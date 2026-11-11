import type { Bookmark, BookmarkInput, BookmarkPatch, LibraryV1, Progress, Result } from './types';
import { defaultCover, mergeCover } from './cover';
import { ownValue } from './ids';
import { placeBookmark, shelfBookmarks, sortLibrary } from './ordering';
import { clone, notFound, ok } from './result';
import { normalizeUrl } from './url';
import { checkOptionalText, checkReadingText, checkTitle, normalizeTags } from './validate';

/** Clock and id source shared by every operation. Operations change the library in place. */
export interface OpContext {
  now: () => string;
  newId: () => string;
}

export function findBookmark(lib: LibraryV1, id: string): Bookmark | undefined {
  return lib.bookmarks.find((bookmark) => bookmark.id === id);
}

function hasShelf(lib: LibraryV1, shelfId: string): boolean {
  return lib.shelves.some((shelf) => shelf.id === shelfId);
}

function setOptional(bookmark: Bookmark, key: 'author' | 'note', value: string | undefined): void {
  if (value === undefined) delete bookmark[key];
  else bookmark[key] = value;
}

function setReading(bookmark: Bookmark, text: string | undefined, savedAt: string): void {
  if (text === undefined) delete bookmark.reading;
  else if (bookmark.reading?.text !== text) bookmark.reading = { format: 'markdown-lite', text, savedAt };
}

/** Checks and applies the text fields shared by add and update. */
function applyTextFields(draft: Bookmark, input: BookmarkInput | BookmarkPatch, now: string): Result<void> {
  if (input.title !== undefined) {
    const title = checkTitle(input.title, draft.url);
    if (!title.ok) return title;
    draft.title = title.value;
  }
  for (const field of ['author', 'note'] as const) {
    const raw = input[field];
    if (raw === undefined) continue;
    const checked = checkOptionalText(raw, field);
    if (!checked.ok) return checked;
    setOptional(draft, field, checked.value);
  }
  if (input.readingText !== undefined) {
    const reading = checkReadingText(input.readingText);
    if (!reading.ok) return reading;
    setReading(draft, reading.value, now);
  }
  if (input.tags !== undefined) draft.tags = normalizeTags(input.tags);
  if (input.cover !== undefined) draft.cover = mergeCover(draft.cover, input.cover);
  return ok(undefined);
}

export function addBookmarkTo(lib: LibraryV1, ctx: OpContext, input: BookmarkInput): Result<Bookmark> {
  const url = normalizeUrl(input.url);
  if (!url.ok) return url;
  const shelfId = input.shelfId ?? lib.shelves[0]?.id;
  if (shelfId === undefined || !hasShelf(lib, shelfId)) return notFound('shelf', 'shelfId');

  const now = ctx.now();
  const draft: Bookmark = {
    id: ctx.newId(),
    url: url.value,
    title: '',
    tags: [],
    shelfId,
    order: shelfBookmarks(lib, shelfId).length,
    addedAt: now,
    updatedAt: now,
    cover: defaultCover(url.value),
  };
  const fields = applyTextFields(draft, { ...input, title: input.title ?? '' }, now);
  if (!fields.ok) return fields;
  lib.bookmarks.push(draft);
  sortLibrary(lib);
  return ok(draft);
}

export function updateBookmarkIn(lib: LibraryV1, ctx: OpContext, id: string, patch: BookmarkPatch): Result<Bookmark> {
  const current = findBookmark(lib, id);
  if (!current) return notFound('bookmark');
  const draft = clone(current);
  if (patch.url !== undefined) {
    const url = normalizeUrl(patch.url);
    if (!url.ok) return url;
    draft.url = url.value;
  }
  if (patch.shelfId !== undefined && !hasShelf(lib, patch.shelfId)) return notFound('shelf', 'shelfId');
  const now = ctx.now();
  const fields = applyTextFields(draft, patch, now);
  if (!fields.ok) return fields;

  draft.updatedAt = now;
  lib.bookmarks[lib.bookmarks.indexOf(current)] = draft;
  if (patch.shelfId !== undefined && patch.shelfId !== draft.shelfId) placeBookmark(lib, draft, patch.shelfId);
  return ok(draft);
}

export function removeBookmarkFrom(lib: LibraryV1, id: string): { bookmark: Bookmark; progress?: Progress } | undefined {
  const bookmark = findBookmark(lib, id);
  if (!bookmark) return undefined;
  const progress = ownValue(lib.progress, id);
  lib.bookmarks.splice(lib.bookmarks.indexOf(bookmark), 1);
  delete lib.progress[id];
  if (lib.session.focusId === id) lib.session.focusId = null;
  if (lib.session.openId === id) lib.session.openId = null;
  sortLibrary(lib);
  return progress ? { bookmark, progress } : { bookmark };
}

/** Puts a removed volume and its progress back at the old position. Ignored if the id is taken. */
export function restoreBookmarkTo(lib: LibraryV1, entry: { bookmark: Bookmark; progress?: Progress }): boolean {
  if (findBookmark(lib, entry.bookmark.id)) return false;
  const fallback = lib.shelves[0]?.id;
  const shelfId = hasShelf(lib, entry.bookmark.shelfId) ? entry.bookmark.shelfId : fallback;
  if (shelfId === undefined) return false;
  const restored: Bookmark = { ...clone(entry.bookmark), shelfId };
  lib.bookmarks.push(restored);
  placeBookmark(lib, restored, shelfId, entry.bookmark.order);
  if (entry.progress) lib.progress[restored.id] = clone(entry.progress);
  return true;
}

export function moveBookmarkIn(
  lib: LibraryV1,
  ctx: OpContext,
  id: string,
  to: { shelfId?: string; index?: number },
): Result<Bookmark> {
  const bookmark = findBookmark(lib, id);
  if (!bookmark) return notFound('bookmark');
  const shelfId = to.shelfId ?? bookmark.shelfId;
  if (!hasShelf(lib, shelfId)) return notFound('shelf', 'shelfId');
  if (shelfId !== bookmark.shelfId) bookmark.updatedAt = ctx.now();
  placeBookmark(lib, bookmark, shelfId, to.index);
  return ok(bookmark);
}

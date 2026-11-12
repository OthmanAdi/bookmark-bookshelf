import type {
  Bookmark,
  BookmarkOrigin,
  CoverSpec,
  Progress,
  Result,
  Session,
  Shelf,
  ShelfOrigin,
  SkippedLink,
} from './types';
import { SORT_MODE_NAMES } from './types';
import { cleanLine } from './clean-text';
import { defaultCover, mergeCover } from './cover';
import { isValidId } from './ids';
import { defaultSession } from './library';
import { ok } from './result';
import { normalizeProgress } from './progress';
import { normalizeUrl } from './url';
import { MAX_URL_LENGTH } from './url-hygiene';
import {
  LIMITS,
  checkDescription,
  checkDue,
  checkLang,
  checkOptionalText,
  checkPrivateNote,
  checkReadingText,
  checkShelfAuthor,
  checkShelfName,
  checkTitle,
  normalizeTags,
} from './validate';

type Fields = Record<string, unknown>;

export function isObject(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isoOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Text from a document that may be longer than allowed: it is cut, not refused. */
function cutText(value: unknown, max: number): string {
  return textOf(value).trim().slice(0, max).trim();
}

/** An id that belongs to another library, as carried by an origin. Only its shape is checked. */
function originId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const id = value.trim();
  return id === '' || id.length > 100 || id === '__proto__' || cleanLine(id) !== id ? undefined : id;
}

function readShelfOrigin(value: unknown): ShelfOrigin | undefined {
  if (!isObject(value)) return undefined;
  const shelfId = originId(value.shelfId);
  const { revision } = value;
  if (shelfId === undefined || typeof revision !== 'number' || !Number.isInteger(revision)) return undefined;
  return revision >= 1 && revision <= 1_000_000 ? { shelfId, revision } : undefined;
}

function readBookmarkOrigin(value: unknown): BookmarkOrigin | undefined {
  if (!isObject(value)) return undefined;
  const shelfId = originId(value.shelfId);
  const volumeId = originId(value.volumeId);
  return shelfId === undefined || volumeId === undefined ? undefined : { shelfId, volumeId };
}

/** The optional description, language, author, due date and origin of a shelf. Values out of range are cut or left out. */
function readShelfMeta(item: Fields, shelf: Shelf): void {
  const description = checkDescription(cutText(item.description, LIMITS.shelfDescription));
  if (description.ok && description.value !== undefined) shelf.description = description.value;
  const author = checkShelfAuthor(cutText(item.author, LIMITS.shelfAuthor));
  if (author.ok && author.value !== undefined) shelf.author = author.value;
  const lang = checkLang(textOf(item.lang));
  if (lang.ok && lang.value !== undefined) shelf.lang = lang.value;
  const due = checkDue(textOf(item.due));
  if (due.ok && due.value !== undefined) shelf.due = due.value;
  const origin = readShelfOrigin(item.origin);
  if (origin) shelf.origin = origin;
}

/** Maps an id as written in a document to the id it is stored under. */
export type IdMap = ReadonlyMap<string, string>;

function freshId(used: Set<string>, newId: () => string): string {
  let id = newId();
  while (used.has(id)) id = newId();
  used.add(id);
  return id;
}

/**
 * Keeps usable, uniquely named shelves. An id that is missing, malformed or already taken is replaced by a
 * fresh one, and `idMap` says which stored id every id in the document now stands for. A shelf whose name is
 * already taken is dropped and its id points at the shelf that was kept.
 */
export function readShelves(items: unknown[], newId: () => string): { shelves: Shelf[]; idMap: IdMap } {
  const used = new Set<string>();
  const byName = new Map<string, string>();
  const idMap = new Map<string, string>();
  const shelves: Shelf[] = [];
  for (const item of items) {
    if (!isObject(item)) continue;
    const name = checkShelfName(textOf(item.name));
    if (!name.ok) continue;
    const written = typeof item.id === 'string' ? item.id : undefined;
    const folded = name.value.toLowerCase();
    const kept = byName.get(folded);
    if (kept !== undefined) {
      if (written !== undefined && !idMap.has(written)) idMap.set(written, kept);
      continue;
    }
    let id: string;
    if (isValidId(item.id) && !used.has(item.id)) {
      id = item.id;
      used.add(id);
    } else {
      id = freshId(used, newId);
    }
    byName.set(folded, id);
    if (written !== undefined && !idMap.has(written)) idMap.set(written, id);
    const shelf: Shelf = { id, name: name.value, order: finiteOr(item.order, Number.MAX_SAFE_INTEGER) };
    readShelfMeta(item, shelf);
    shelves.push(shelf);
  }
  return { shelves, idMap };
}

function readCover(value: unknown, url: string): CoverSpec {
  const base = defaultCover(url);
  if (!isObject(value)) return base;
  const partial: Partial<CoverSpec> = {};
  if (typeof value.cloth === 'string') partial.cloth = value.cloth;
  if (typeof value.pattern === 'string') partial.pattern = value.pattern;
  if (typeof value.seed === 'number') partial.seed = value.seed;
  // A name that is not usable is left out, and the renderer chooses as it does for an older library.
  if (typeof value.binding === 'string') partial.binding = value.binding;
  if (typeof value.stamp === 'string') partial.stamp = value.stamp;
  return mergeCover(base, partial);
}

export interface BookmarkContext {
  /** Shelf ids as written in the document, to the ids they are stored under. */
  shelfIds: IdMap;
  firstShelfId: string;
  fallbackTime: string;
  newId: () => string;
  /** Ids already given to volumes in this document. Filled in as volumes are read. */
  usedIds: Set<string>;
}

function readReadingText(item: Fields): Result<{ text?: string; savedAt: unknown }> {
  if (!isObject(item.reading) || typeof item.reading.text !== 'string') return ok({ savedAt: undefined });
  const text = checkReadingText(item.reading.text);
  if (!text.ok) return text;
  return ok(text.value === undefined ? { savedAt: undefined } : { text: text.value, savedAt: item.reading.savedAt });
}

export interface ReadBookmark {
  bookmark: Bookmark;
  /** The id the document gave it, which progress and session entries in the same document refer to. */
  sourceId: string | undefined;
}

function skippedEntry(item: unknown, reason: string): { skipped: SkippedLink } {
  const fields = isObject(item) ? item : {};
  return {
    skipped: {
      title: cutText(fields.title, LIMITS.title),
      url: cutText(fields.url, MAX_URL_LENGTH),
      reason,
    },
  };
}

/** Reads one volume from a document, or says why it cannot be used. */
export function readBookmark(item: unknown, context: BookmarkContext): ReadBookmark | { skipped: SkippedLink } {
  if (!isObject(item)) return skippedEntry(item, 'It is not a link.');
  if (typeof item.url !== 'string') return skippedEntry(item, 'It has no web address.');
  const url = normalizeUrl(item.url);
  if (!url.ok) return skippedEntry(item, url.error.message);
  const title = checkTitle(textOf(item.title), url.value);
  if (!title.ok) return skippedEntry(item, title.error.message);
  const author = checkOptionalText(textOf(item.author), 'author');
  if (!author.ok) return skippedEntry(item, author.error.message);
  const note = checkOptionalText(textOf(item.note), 'note');
  if (!note.ok) return skippedEntry(item, note.error.message);
  const reading = readReadingText(item);
  if (!reading.ok) return skippedEntry(item, reading.error.message);

  const addedAt = isoOr(item.addedAt, context.fallbackTime);
  const shelfId = typeof item.shelfId === 'string' ? context.shelfIds.get(item.shelfId) : undefined;
  const id = isValidId(item.id) && !context.usedIds.has(item.id) ? item.id : freshId(context.usedIds, context.newId);
  context.usedIds.add(id);
  const bookmark: Bookmark = {
    id,
    url: url.value,
    title: title.value,
    tags: Array.isArray(item.tags) ? normalizeTags(item.tags as string[]) : [],
    shelfId: shelfId ?? context.firstShelfId,
    order: finiteOr(item.order, Number.MAX_SAFE_INTEGER),
    addedAt,
    updatedAt: isoOr(item.updatedAt, addedAt),
    cover: readCover(item.cover, url.value),
  };
  if (author.value !== undefined) bookmark.author = author.value;
  if (note.value !== undefined) bookmark.note = note.value;
  if (reading.value.text !== undefined) {
    bookmark.reading = {
      format: 'markdown-lite',
      text: reading.value.text,
      savedAt: isoOr(reading.value.savedAt, addedAt),
    };
  }
  if (item.required === false) bookmark.required = false;
  const { minutes } = item;
  if (typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0) {
    bookmark.minutes = Math.min(LIMITS.minutes, Math.max(1, Math.round(minutes)));
  }
  const origin = readBookmarkOrigin(item.origin);
  if (origin) bookmark.origin = origin;
  return { bookmark, sourceId: typeof item.id === 'string' ? item.id : undefined };
}

export function readProgress(value: unknown, bookmarkIds: IdMap, fallbackTime: string): Record<string, Progress> {
  const progress: Record<string, Progress> = {};
  if (!isObject(value)) return progress;
  for (const [written, entry] of Object.entries(value)) {
    const id = bookmarkIds.get(written);
    if (id === undefined || !isObject(entry)) continue;
    progress[id] = normalizeProgress(
      { block: finiteOr(entry.block, 0), ratio: finiteOr(entry.ratio, 0), percent: finiteOr(entry.percent, 0) },
      isoOr(entry.updatedAt, fallbackTime),
    );
  }
  return progress;
}

/** When each volume was marked read. Entries for volumes that are not in the library are dropped. */
export function readDone(value: unknown, bookmarkIds: IdMap, fallbackTime: string): Record<string, string> {
  const done: Record<string, string> = {};
  if (!isObject(value)) return done;
  for (const [written, at] of Object.entries(value)) {
    const id = bookmarkIds.get(written);
    if (id !== undefined) done[id] = isoOr(at, fallbackTime);
  }
  return done;
}

/** Private notes. A note over the limit is cut so most of it survives; an empty one is dropped. */
export function readNotes(value: unknown, bookmarkIds: IdMap): Record<string, string> {
  const notes: Record<string, string> = {};
  if (!isObject(value)) return notes;
  for (const [written, text] of Object.entries(value)) {
    const id = bookmarkIds.get(written);
    const note = checkPrivateNote(cutText(text, LIMITS.privateNote));
    if (id !== undefined && note.ok && note.value !== undefined) notes[id] = note.value;
  }
  return notes;
}

function knownIdOrNull(value: unknown, known: IdMap): string | null {
  return typeof value === 'string' ? (known.get(value) ?? null) : null;
}

export function readSession(value: unknown, shelfIds: IdMap, bookmarkIds: IdMap): Session {
  const session = defaultSession();
  if (!isObject(value)) return session;
  session.shelfId = knownIdOrNull(value.shelfId, shelfIds);
  session.focusId = knownIdOrNull(value.focusId, bookmarkIds);
  session.openId = knownIdOrNull(value.openId, bookmarkIds);
  if (value.view === 'shelf' || value.view === 'list') session.view = value.view;
  if (typeof value.variant === 'string' && value.variant.trim() !== '') session.variant = value.variant.trim();
  const { textScale, sort } = value;
  if (typeof textScale === 'number' && Number.isFinite(textScale)) {
    session.textScale = Math.min(4, Math.max(0, Math.round(textScale)));
  }
  if (typeof sort === 'string' && (SORT_MODE_NAMES as readonly string[]).includes(sort)) session.sort = sort as Session['sort'];
  return session;
}

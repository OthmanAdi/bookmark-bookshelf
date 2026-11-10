import type { Bookmark, LibraryV1, Result } from './types';
import { LIBRARY_FORMAT, LIBRARY_VERSION } from './types';
import { DEFAULT_SHELF_NAME, makeShelf } from './library';
import { defaultIdFactory } from './ids';
import { sortLibrary } from './ordering';
import { fail, ok } from './result';
import { isObject, readBookmark, readProgress, readSession, readShelves } from './sanitize';

export interface MigrateOptions {
  /** Only used to fill timestamps that a document lacks. */
  now?: () => Date;
  /** Only used when a shelf or volume has to be created, as in version 0. */
  idFactory?: () => string;
}

type Resolved = Required<MigrateOptions>;

function parseJson(text: string): Result<unknown> {
  try {
    return ok(JSON.parse(text) as unknown);
  } catch {
    return fail('invalid-format', 'The text is not valid JSON.');
  }
}

function assemble(
  shelves: LibraryV1['shelves'],
  bookmarks: Bookmark[],
  rest: Pick<LibraryV1, 'progress' | 'session'>,
): LibraryV1 {
  const library: LibraryV1 = {
    format: LIBRARY_FORMAT,
    version: LIBRARY_VERSION,
    shelves,
    bookmarks,
    progress: rest.progress,
    session: rest.session,
  };
  sortLibrary(library);
  return library;
}

function migrateV1(raw: Record<string, unknown>, options: Resolved): Result<LibraryV1> {
  if (!Array.isArray(raw.shelves) || !Array.isArray(raw.bookmarks)) {
    return fail('invalid-format', 'The library has no shelves or bookmarks list.');
  }
  const fallbackTime = options.now().toISOString();
  let shelves = readShelves(raw.shelves);
  if (shelves.length === 0) shelves = [makeShelf(options.idFactory(), DEFAULT_SHELF_NAME, 0)];
  const first = [...shelves].sort((a, b) => a.order - b.order)[0];
  const shelfIds = new Set(shelves.map((shelf) => shelf.id));
  const context = { shelfIds, firstShelfId: first ? first.id : '', fallbackTime };

  const bookmarks: Bookmark[] = [];
  const bookmarkIds = new Set<string>();
  for (const item of raw.bookmarks) {
    const bookmark = readBookmark(item, context);
    if (!bookmark || bookmarkIds.has(bookmark.id)) continue;
    bookmarkIds.add(bookmark.id);
    bookmarks.push(bookmark);
  }
  return ok(
    assemble(shelves, bookmarks, {
      progress: readProgress(raw.progress, bookmarkIds, fallbackTime),
      session: readSession(raw.session, shelfIds, bookmarkIds),
    }),
  );
}

/** Version 0 was a plain array of `{url, title?, note?, tags?}`. */
function migrateV0(items: unknown[], options: Resolved): LibraryV1 {
  const fallbackTime = options.now().toISOString();
  const shelf = makeShelf(options.idFactory(), DEFAULT_SHELF_NAME, 0);
  const context = { shelfIds: new Set([shelf.id]), firstShelfId: shelf.id, fallbackTime };
  const bookmarks: Bookmark[] = [];
  items.forEach((item, index) => {
    const fields = typeof item === 'string' ? { url: item } : item;
    if (!isObject(fields)) return;
    const legacy = { ...fields, id: options.idFactory(), shelfId: shelf.id, order: index, addedAt: fallbackTime };
    const bookmark = readBookmark(legacy, context);
    if (bookmark) bookmarks.push(bookmark);
  });
  const session = readSession(undefined, context.shelfIds, new Set());
  return assemble([shelf], bookmarks, { progress: {}, session });
}

/**
 * Accepts a v1 document, a version 0 array, or JSON text of either, and returns a clean v1 library.
 * Unknown fields are dropped and unusable entries are skipped.
 */
export function migrateLibrary(raw: unknown, options: MigrateOptions = {}): Result<LibraryV1> {
  const resolved: Resolved = {
    now: options.now ?? (() => new Date()),
    idFactory: options.idFactory ?? defaultIdFactory,
  };
  let value = raw;
  if (typeof raw === 'string') {
    const parsed = parseJson(raw);
    if (!parsed.ok) return parsed;
    value = parsed.value;
  }
  if (Array.isArray(value)) return ok(migrateV0(value, resolved));
  if (!isObject(value)) return fail('invalid-format', 'This is not a Bookmark Bookshelf library.');
  if (typeof value.version === 'number' && value.version > LIBRARY_VERSION) {
    return fail('unsupported-version', `Library version ${value.version} is newer than this app understands.`);
  }
  if (value.format !== LIBRARY_FORMAT || value.version !== LIBRARY_VERSION) {
    return fail('invalid-format', 'This is not a Bookmark Bookshelf library.');
  }
  return migrateV1(value, resolved);
}

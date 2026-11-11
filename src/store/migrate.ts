import type { Bookmark, LibraryV1, Result } from './types';
import { LIBRARY_FORMAT, LIBRARY_VERSION } from './types';
import { DEFAULT_SHELF_NAME, makeShelf } from './library';
import { defaultIdFactory } from './ids';
import { sortLibrary } from './ordering';
import { fail, ok } from './result';
import type { BookmarkContext, IdMap } from './sanitize';
import { isObject, readBookmark, readProgress, readSession, readShelves } from './sanitize';

export interface MigrateOptions {
  /** Only used to fill timestamps that a document lacks. */
  now?: () => Date;
  /** Used when a shelf or volume has to be created, and for any id a document gives that cannot be kept. */
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

function readBookmarks(items: unknown[], context: BookmarkContext): { bookmarks: Bookmark[]; idMap: IdMap } {
  const bookmarks: Bookmark[] = [];
  const idMap = new Map<string, string>();
  for (const item of items) {
    const read = readBookmark(item, context);
    if (!read) continue;
    bookmarks.push(read.bookmark);
    if (read.sourceId !== undefined && !idMap.has(read.sourceId)) idMap.set(read.sourceId, read.bookmark.id);
  }
  return { bookmarks, idMap };
}

function migrateV1(raw: Record<string, unknown>, options: Resolved): Result<LibraryV1> {
  if (!Array.isArray(raw.shelves) || !Array.isArray(raw.bookmarks)) {
    return fail('invalid-format', 'The library has no shelves or bookmarks list.');
  }
  const fallbackTime = options.now().toISOString();
  const read = readShelves(raw.shelves, options.idFactory);
  let { shelves } = read;
  let shelfIds = read.idMap;
  if (shelves.length === 0) {
    shelves = [makeShelf(options.idFactory(), DEFAULT_SHELF_NAME, 0)];
    shelfIds = new Map();
  }
  const first = [...shelves].sort((a, b) => a.order - b.order)[0];
  const context: BookmarkContext = {
    shelfIds,
    firstShelfId: first ? first.id : '',
    fallbackTime,
    newId: options.idFactory,
    usedIds: new Set(),
  };
  const { bookmarks, idMap } = readBookmarks(raw.bookmarks, context);
  return ok(
    assemble(shelves, bookmarks, {
      progress: readProgress(raw.progress, idMap, fallbackTime),
      session: readSession(raw.session, shelfIds, idMap),
    }),
  );
}

/** Version 0 was a plain array of `{url, title?, note?, tags?}`. */
function migrateV0(items: unknown[], options: Resolved): LibraryV1 {
  const fallbackTime = options.now().toISOString();
  const shelf = makeShelf(options.idFactory(), DEFAULT_SHELF_NAME, 0);
  const context: BookmarkContext = {
    shelfIds: new Map([[shelf.id, shelf.id]]),
    firstShelfId: shelf.id,
    fallbackTime,
    newId: options.idFactory,
    usedIds: new Set(),
  };
  const bookmarks: Bookmark[] = [];
  items.forEach((item, index) => {
    const fields = typeof item === 'string' ? { url: item } : item;
    if (!isObject(fields)) return;
    const legacy = { ...fields, id: options.idFactory(), shelfId: shelf.id, order: index, addedAt: fallbackTime };
    const read = readBookmark(legacy, context);
    if (read) bookmarks.push(read.bookmark);
  });
  const session = readSession(undefined, context.shelfIds, new Map());
  return assemble([shelf], bookmarks, { progress: {}, session });
}

function migrate(raw: unknown, resolved: Resolved): Result<LibraryV1> {
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

/**
 * Accepts a v1 document, a version 0 array, or JSON text of either, and returns a clean v1 library.
 * Unknown fields are dropped, unusable entries are skipped and ids that cannot be kept are replaced.
 * It never throws: a document that cannot be read at all is an `invalid-format` result.
 */
export function migrateLibrary(raw: unknown, options: MigrateOptions = {}): Result<LibraryV1> {
  const resolved: Resolved = {
    now: options.now ?? (() => new Date()),
    idFactory: options.idFactory ?? defaultIdFactory,
  };
  try {
    return migrate(raw, resolved);
  } catch {
    return fail('invalid-format', 'This library could not be read.');
  }
}

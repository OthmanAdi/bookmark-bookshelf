import type { Bookmark, LibraryV2, Result } from './types';
import { LIBRARY_FORMAT, LIBRARY_VERSION } from './types';
import { DEFAULT_SHELF_NAME, makeShelf } from './library';
import { defaultIdFactory } from './ids';
import { sortLibrary } from './ordering';
import { fail, ok } from './result';
import type { BookmarkContext, IdMap } from './sanitize';
import { isObject, readBookmark, readDone, readNotes, readProgress, readSession, readShelves } from './sanitize';

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
  shelves: LibraryV2['shelves'],
  bookmarks: Bookmark[],
  rest: Pick<LibraryV2, 'progress' | 'done' | 'notes' | 'session'>,
): LibraryV2 {
  const library: LibraryV2 = {
    format: LIBRARY_FORMAT,
    version: LIBRARY_VERSION,
    shelves,
    bookmarks,
    progress: rest.progress,
    done: rest.done,
    notes: rest.notes,
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

/** Versions 1 and 2 share one layout; version 2 adds the done marks and private notes. */
function migrateKnown(raw: Record<string, unknown>, version: 1 | 2, options: Resolved): Result<LibraryV2> {
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
      done: version === 2 ? readDone(raw.done, idMap, fallbackTime) : {},
      notes: version === 2 ? readNotes(raw.notes, idMap) : {},
      session: readSession(raw.session, shelfIds, idMap),
    }),
  );
}

/** Version 0 was a plain array of `{url, title?, note?, tags?}`. */
function migrateV0(items: unknown[], options: Resolved): LibraryV2 {
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
  return assemble([shelf], bookmarks, { progress: {}, done: {}, notes: {}, session });
}

function migrate(raw: unknown, resolved: Resolved): Result<LibraryV2> {
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
  if (value.format !== LIBRARY_FORMAT || (value.version !== 1 && value.version !== LIBRARY_VERSION)) {
    return fail('invalid-format', 'This is not a Bookmark Bookshelf library.');
  }
  return migrateKnown(value, value.version === 1 ? 1 : 2, resolved);
}

/**
 * Accepts a version 2 or version 1 document, a version 0 array, or JSON text of any of them, and returns a
 * clean version 2 library. Unknown fields are dropped, unusable entries are skipped, values out of range are
 * cut back and ids that cannot be kept are replaced. It never throws: a document that cannot be read at all
 * is an `invalid-format` result.
 */
export function migrateLibrary(raw: unknown, options: MigrateOptions = {}): Result<LibraryV2> {
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

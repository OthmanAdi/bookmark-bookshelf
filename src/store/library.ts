import type { LibraryV2, Session, Shelf } from './types';
import { LIBRARY_FORMAT, LIBRARY_VERSION } from './types';

export const DEFAULT_SHELF_NAME = 'Reading list';

export function defaultSession(): Session {
  return { shelfId: null, focusId: null, openId: null, view: 'shelf', variant: 'default' };
}

export function makeShelf(id: string, name: string, order: number): Shelf {
  return { id, name, order };
}

/** One empty shelf, no volumes. The shelf id is derived from `now` so seeds are reproducible. */
export function emptyLibrary(now: Date = new Date()): LibraryV2 {
  return {
    format: LIBRARY_FORMAT,
    version: LIBRARY_VERSION,
    shelves: [makeShelf(`shelf-${now.getTime().toString(36)}`, DEFAULT_SHELF_NAME, 0)],
    bookmarks: [],
    progress: {},
    done: {},
    notes: {},
    session: defaultSession(),
  };
}

import type { Bookmark, LibraryV2, RemovedBookmark, Shelf, Store } from '../store';

/**
 * Undo for something that took links or shelves out of the library. When nothing about shelves and links
 * has changed since, the library goes back exactly as it was, shelf order included. When it has, the
 * shelves that went come back at the end and the links return to their own places, and nothing the person
 * did in the meantime is touched.
 */
export interface Removal {
  /** The library as it was before anything was removed. */
  before: LibraryV2;
  /** Links that were deleted. */
  removed: RemovedBookmark[];
  /** Shelves that were deleted. */
  shelves: Shelf[];
  /** Links that were kept but moved to another shelf, as they were before. */
  moved: Bookmark[];
}

function structure(lib: LibraryV2): string {
  return JSON.stringify([lib.shelves, lib.bookmarks]);
}

export function undoerFor(store: Store, removal: Removal): () => void {
  const after = structure(store.snapshot());
  const gone = new Set(removal.removed.map((entry) => entry.bookmark.id));

  return () => {
    const now = store.snapshot();
    if (structure(now) === after) {
      const keep = <T>(from: Record<string, T>, into: Record<string, T>): Record<string, T> => {
        for (const id of gone) if (id in from) into[id] = from[id] as T;
        return into;
      };
      const whole: LibraryV2 = {
        ...removal.before,
        progress: keep(removal.before.progress, { ...now.progress }),
        done: keep(removal.before.done, { ...now.done }),
        notes: keep(removal.before.notes, { ...now.notes }),
        session: now.session,
      };
      if (store.importLibrary(whole, 'replace').ok) return;
    }
    if (removal.shelves.length > 0) {
      store.importLibrary({ ...removal.before, shelves: removal.shelves, bookmarks: [], progress: {}, done: {}, notes: {} }, 'merge');
    }
    // Each link recorded its place after the earlier ones had gone, so they come back last to first.
    for (const entry of [...removal.removed].reverse()) store.restoreBookmark(entry);
    for (const link of removal.moved) {
      if (store.get(link.id)) store.moveBookmark(link.id, { shelfId: link.shelfId, index: link.order });
    }
  };
}

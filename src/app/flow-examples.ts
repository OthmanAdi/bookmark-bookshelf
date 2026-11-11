import { isExampleId, isExampleShelfId } from '../data/sample-library';
import type { RemovedBookmark, Shelf, Store } from '../store';

/**
 * Taking the example links out of a library in one step, and putting them back. A shelf that only the
 * examples used goes with them, except that the library always keeps one shelf.
 */
export interface ExamplesRemoval {
  /** How many links were removed. */
  links: number;
  undo(): void;
}

export function countExamples(store: Pick<Store, 'bookmarks'>): number {
  return store.bookmarks().filter((bookmark) => isExampleId(bookmark.id)).length;
}

export function removeExampleLinks(store: Store): ExamplesRemoval | null {
  const doomed = store.bookmarks().filter((bookmark) => isExampleId(bookmark.id));
  if (doomed.length === 0) return null;

  const before = store.snapshot();
  const taken: RemovedBookmark[] = [];
  for (const bookmark of doomed) {
    const entry = store.removeBookmark(bookmark.id);
    if (entry) taken.push(entry);
  }

  const emptied = store.shelves().filter((shelf) => isExampleShelfId(shelf.id) && store.bookmarks(shelf.id).length === 0);
  // The last shelf cannot go; keep the plainest one so the person starts on a shelf with a general name.
  if (emptied.length === store.shelves().length) {
    const keep = emptied.find((shelf) => shelf.name === 'Reading list') ?? emptied[emptied.length - 1];
    emptied.splice(emptied.indexOf(keep as Shelf), 1);
  }
  const gone: Shelf[] = [];
  for (const shelf of emptied) {
    if (store.removeShelf(shelf.id).ok) gone.push(shelf);
  }

  return {
    links: taken.length,
    undo() {
      if (gone.length > 0) {
        const shelvesOnly = { ...before, shelves: gone, bookmarks: [], progress: {}, done: {}, notes: {} };
        store.importLibrary(shelvesOnly, 'merge');
      }
      // Each link recorded its place after the earlier ones had gone, so they come back last to first.
      for (const entry of [...taken].reverse()) store.restoreBookmark(entry);
    },
  };
}

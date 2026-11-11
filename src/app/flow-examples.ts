import { isExampleId, isExampleShelfId } from '../data/sample-library';
import type { RemovedShelf, Store } from '../store';

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

  const removed = store.removeBookmarks(doomed.map((bookmark) => bookmark.id));

  const emptied = store.shelves().filter((shelf) => isExampleShelfId(shelf.id) && store.bookmarks(shelf.id).length === 0);
  // The last shelf cannot go; keep the plainest one so the person starts on a shelf with a general name.
  if (emptied.length === store.shelves().length) {
    const keep = emptied.find((shelf) => shelf.name === 'Reading list') ?? emptied[emptied.length - 1];
    emptied.splice(emptied.indexOf(keep as (typeof emptied)[number]), 1);
  }
  const gone: RemovedShelf[] = [];
  for (const shelf of emptied) {
    const result = store.removeShelf(shelf.id);
    if (result.ok) gone.push(result.value);
  }

  return {
    links: removed.length,
    undo() {
      for (const entry of [...gone].reverse()) store.restoreShelf(entry);
      store.restoreBookmarks(removed);
    },
  };
}

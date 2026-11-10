import type { Bookmark, LibraryV1 } from './types';

/** Puts shelves and volumes in canonical order and re-indexes both to 0..n-1. */
export function sortLibrary(lib: LibraryV1): void {
  lib.shelves.sort((a, b) => a.order - b.order);
  lib.shelves.forEach((shelf, index) => {
    shelf.order = index;
  });
  const rank = new Map(lib.shelves.map((shelf) => [shelf.id, shelf.order]));
  const rankOf = (bookmark: Bookmark): number => rank.get(bookmark.shelfId) ?? Number.MAX_SAFE_INTEGER;
  lib.bookmarks.sort((a, b) => rankOf(a) - rankOf(b) || a.order - b.order);
  const counts = new Map<string, number>();
  for (const bookmark of lib.bookmarks) {
    const position = counts.get(bookmark.shelfId) ?? 0;
    bookmark.order = position;
    counts.set(bookmark.shelfId, position + 1);
  }
}

/** Live references to one shelf's volumes in order. */
export function shelfBookmarks(lib: LibraryV1, shelfId: string): Bookmark[] {
  return lib.bookmarks.filter((bookmark) => bookmark.shelfId === shelfId).sort((a, b) => a.order - b.order);
}

/** Live references, ordered by shelf and then volume when no shelf is given. */
export function orderedBookmarks(lib: LibraryV1, shelfId: string | null | undefined): Bookmark[] {
  return shelfId == null ? [...lib.bookmarks] : shelfBookmarks(lib, shelfId);
}

/**
 * Moves a volume (already in `lib.bookmarks`) to `shelfId` at `index`.
 * Without an index it keeps its place on the same shelf, or goes to the end of another one.
 */
export function placeBookmark(lib: LibraryV1, bookmark: Bookmark, shelfId: string, index?: number): void {
  const sameShelf = bookmark.shelfId === shelfId;
  const currentIndex = shelfBookmarks(lib, bookmark.shelfId).findIndex((item) => item.id === bookmark.id);
  const target = shelfBookmarks(lib, shelfId).filter((item) => item.id !== bookmark.id);
  const wanted = index ?? (sameShelf ? currentIndex : target.length);
  const at = Number.isFinite(wanted) ? Math.min(target.length, Math.max(0, Math.trunc(wanted))) : target.length;
  target.splice(at, 0, bookmark);
  bookmark.shelfId = shelfId;
  target.forEach((item, position) => {
    item.order = position;
  });
  sortLibrary(lib);
}

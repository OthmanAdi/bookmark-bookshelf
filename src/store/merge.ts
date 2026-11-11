import type { Bookmark, LibraryV2 } from './types';
import type { OpContext } from './bookmark-ops';
import { shelfBookmarks, sortLibrary } from './ordering';
import { clone } from './result';
import { urlKey } from './url';

function takeId(wanted: string, used: Set<string>, ctx: OpContext): string {
  let id = used.has(wanted) ? ctx.newId() : wanted;
  while (used.has(id)) id = ctx.newId();
  used.add(id);
  return id;
}

/** Existing shelves are matched by name and left as they are; new ones are added at the end. Returns incoming shelf id to local id. */
function mergeShelves(lib: LibraryV2, incoming: LibraryV2, ctx: OpContext): { ids: Map<string, string>; added: number } {
  const used = new Set(lib.shelves.map((shelf) => shelf.id));
  const ids = new Map<string, string>();
  let added = 0;
  for (const shelf of incoming.shelves) {
    const match = lib.shelves.find((item) => item.name.toLowerCase() === shelf.name.toLowerCase());
    if (match) {
      ids.set(shelf.id, match.id);
      continue;
    }
    const id = takeId(shelf.id, used, ctx);
    lib.shelves.push({ ...clone(shelf), id, order: lib.shelves.length });
    ids.set(shelf.id, id);
    added += 1;
  }
  return { ids, added };
}

/**
 * Adds the shelves and links the library does not have. A link whose address is already saved is left exactly
 * as it is, and so is every shelf with a name that is already taken. Reading position, done marks, notes and
 * the session of the incoming library are not taken.
 *
 * Only links that were saved before the import count as already there, so a file that lists one address twice
 * brings both in.
 */
export function mergeLibrary(
  lib: LibraryV2,
  incoming: LibraryV2,
  ctx: OpContext,
): { added: number; unchanged: number; shelvesAdded: number } {
  const known = new Set(lib.bookmarks.map((bookmark) => urlKey(bookmark.url)));
  const { ids: shelfIds, added: shelvesAdded } = mergeShelves(lib, incoming, ctx);
  const usedIds = new Set(lib.bookmarks.map((bookmark) => bookmark.id));
  let added = 0;
  let unchanged = 0;
  for (const source of incoming.bookmarks) {
    if (known.has(urlKey(source.url))) {
      unchanged += 1;
      continue;
    }
    const shelfId = shelfIds.get(source.shelfId) ?? lib.shelves[0]?.id ?? source.shelfId;
    const copy: Bookmark = {
      ...clone(source),
      id: takeId(source.id, usedIds, ctx),
      shelfId,
      order: shelfBookmarks(lib, shelfId).length,
    };
    lib.bookmarks.push(copy);
    added += 1;
  }
  sortLibrary(lib);
  return { added, unchanged, shelvesAdded };
}

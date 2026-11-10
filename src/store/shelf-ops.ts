import type { LibraryV1, Result, Shelf } from './types';
import type { OpContext } from './bookmark-ops';
import { shelfBookmarks, sortLibrary } from './ordering';
import { fail, notFound, ok } from './result';
import { checkShelfName } from './validate';

function nameTaken(lib: LibraryV1, name: string, exceptId?: string): boolean {
  const folded = name.toLowerCase();
  return lib.shelves.some((shelf) => shelf.id !== exceptId && shelf.name.toLowerCase() === folded);
}

function duplicate(): ReturnType<typeof fail> {
  return fail('duplicate-shelf', 'A shelf with that name already exists.', 'name');
}

export function addShelfTo(lib: LibraryV1, ctx: OpContext, rawName: string): Result<Shelf> {
  const name = checkShelfName(rawName);
  if (!name.ok) return name;
  if (nameTaken(lib, name.value)) return duplicate();
  const shelf: Shelf = { id: ctx.newId(), name: name.value, order: lib.shelves.length };
  lib.shelves.push(shelf);
  return ok(shelf);
}

export function renameShelfIn(lib: LibraryV1, id: string, rawName: string): Result<Shelf> {
  const shelf = lib.shelves.find((item) => item.id === id);
  if (!shelf) return notFound('shelf');
  const name = checkShelfName(rawName);
  if (!name.ok) return name;
  if (nameTaken(lib, name.value, id)) return duplicate();
  shelf.name = name.value;
  return ok(shelf);
}

/** Moves the shelf's volumes to the end of the target shelf, then drops the shelf. */
export function removeShelfFrom(lib: LibraryV1, id: string, moveTo?: string): Result<void> {
  if (!lib.shelves.some((shelf) => shelf.id === id)) return notFound('shelf');
  if (lib.shelves.length <= 1) return fail('last-shelf', 'The last shelf cannot be removed.');
  const target = moveTo ?? lib.shelves.find((shelf) => shelf.id !== id)?.id;
  if (target === undefined || target === id || !lib.shelves.some((shelf) => shelf.id === target)) {
    return notFound('target shelf', 'moveTo');
  }
  const offset = shelfBookmarks(lib, target).length;
  shelfBookmarks(lib, id).forEach((bookmark, index) => {
    bookmark.shelfId = target;
    bookmark.order = offset + index;
  });
  lib.shelves.splice(
    lib.shelves.findIndex((shelf) => shelf.id === id),
    1,
  );
  if (lib.session.shelfId === id) lib.session.shelfId = null;
  sortLibrary(lib);
  return ok(undefined);
}

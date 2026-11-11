import type { LibraryV2, RemovedShelf, Result, Shelf, ShelfPatch } from './types';
import type { OpContext } from './bookmark-ops';
import { shelfBookmarks, sortLibrary } from './ordering';
import { clone, fail, notFound, ok } from './result';
import { checkDescription, checkDue, checkLang, checkShelfAuthor, checkShelfName } from './validate';

function nameTaken(lib: LibraryV2, name: string, exceptId?: string): boolean {
  const folded = name.toLowerCase();
  return lib.shelves.some((shelf) => shelf.id !== exceptId && shelf.name.toLowerCase() === folded);
}

function duplicate(): ReturnType<typeof fail> {
  return fail('duplicate-shelf', 'A shelf with that name already exists.', 'name');
}

export function addShelfTo(lib: LibraryV2, ctx: OpContext, rawName: string): Result<Shelf> {
  const name = checkShelfName(rawName);
  if (!name.ok) return name;
  if (nameTaken(lib, name.value)) return duplicate();
  const shelf: Shelf = { id: ctx.newId(), name: name.value, order: lib.shelves.length };
  lib.shelves.push(shelf);
  return ok(shelf);
}

type OptionalShelfField = 'description' | 'lang' | 'author' | 'due';

const OPTIONAL_CHECKS: Array<[OptionalShelfField, (raw: string) => Result<string | undefined>]> = [
  ['description', checkDescription],
  ['lang', checkLang],
  ['author', checkShelfAuthor],
  ['due', checkDue],
];

/** Checks every given field first, then applies them all, so a bad field changes nothing. */
export function updateShelfIn(lib: LibraryV2, id: string, patch: ShelfPatch): Result<Shelf> {
  const shelf = lib.shelves.find((item) => item.id === id);
  if (!shelf) return notFound('shelf');
  let name: string | undefined;
  if (patch.name !== undefined) {
    const checked = checkShelfName(patch.name);
    if (!checked.ok) return checked;
    if (nameTaken(lib, checked.value, id)) return duplicate();
    name = checked.value;
  }
  const values: Array<[OptionalShelfField, string | undefined]> = [];
  for (const [field, check] of OPTIONAL_CHECKS) {
    const raw = patch[field];
    if (raw === undefined) continue;
    const checked = check(typeof raw === 'string' ? raw : '');
    if (!checked.ok) return checked;
    values.push([field, checked.value]);
  }
  if (name !== undefined) shelf.name = name;
  for (const [field, value] of values) {
    if (value === undefined) delete shelf[field];
    else shelf[field] = value;
  }
  return ok(shelf);
}

export function renameShelfIn(lib: LibraryV2, id: string, rawName: string): Result<Shelf> {
  return updateShelfIn(lib, id, { name: rawName });
}

/** Moves the shelf's volumes to the end of the target shelf, then drops the shelf. */
export function removeShelfFrom(lib: LibraryV2, id: string, moveTo?: string): Result<RemovedShelf> {
  const shelf = lib.shelves.find((item) => item.id === id);
  if (!shelf) return notFound('shelf');
  if (lib.shelves.length <= 1) return fail('last-shelf', 'The last shelf cannot be removed.');
  const target = moveTo ?? lib.shelves.find((shelf) => shelf.id !== id)?.id;
  if (target === undefined || target === id || !lib.shelves.some((shelf) => shelf.id === target)) {
    return notFound('target shelf', 'moveTo');
  }
  const offset = shelfBookmarks(lib, target).length;
  const links = shelfBookmarks(lib, id).map((bookmark) => ({ id: bookmark.id, order: bookmark.order }));
  const removed: RemovedShelf = { shelf: clone(shelf), moveTo: target, links, wasActive: lib.session.shelfId === id };
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
  return ok(removed);
}

/**
 * Puts a shelf back at the place it had and moves its links back onto it in their old order, as long as they
 * are still on the shelf they were moved to. Links added or moved since stay where they are.
 */
export function restoreShelfIn(lib: LibraryV2, entry: RemovedShelf): Result<void> {
  if (lib.shelves.some((shelf) => shelf.id === entry.shelf.id)) {
    return fail('duplicate-shelf', 'That shelf is already back.', 'name');
  }
  if (nameTaken(lib, entry.shelf.name)) return duplicate();
  const shelf = clone(entry.shelf);
  lib.shelves.push({ ...shelf, order: entry.shelf.order - 0.5 });
  const wanted = new Map(entry.links.map((link) => [link.id, link.order]));
  for (const bookmark of lib.bookmarks) {
    const order = wanted.get(bookmark.id);
    if (order === undefined || bookmark.shelfId !== entry.moveTo) continue;
    bookmark.shelfId = shelf.id;
    bookmark.order = order;
  }
  if (entry.wasActive && lib.session.shelfId === null) lib.session.shelfId = shelf.id;
  sortLibrary(lib);
  return ok(undefined);
}

import type { Bookmark, ImportSummary, LibraryV1 } from './types';
import type { OpContext } from './bookmark-ops';
import { shelfBookmarks, sortLibrary } from './ordering';
import { clone } from './result';

function takeId(wanted: string, used: Set<string>, ctx: OpContext): string {
  const id = used.has(wanted) ? ctx.newId() : wanted;
  used.add(id);
  return id;
}

/** Existing shelves are matched by name, new ones are added at the end. Returns incoming shelf id to local id. */
function mergeShelves(lib: LibraryV1, incoming: LibraryV1, ctx: OpContext): { ids: Map<string, string>; added: number } {
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
    lib.shelves.push({ id, name: shelf.name, order: lib.shelves.length });
    ids.set(shelf.id, id);
    added += 1;
  }
  return { ids, added };
}

/** Incoming values win, but an incoming gap never erases what the person already has. */
function updateExisting(existing: Bookmark, incoming: Bookmark, now: string): void {
  const before = JSON.stringify(existing);
  existing.title = incoming.title;
  if (incoming.note !== undefined) existing.note = incoming.note;
  if (incoming.tags.length > 0) existing.tags = [...incoming.tags];
  if (incoming.reading) existing.reading = clone(incoming.reading);
  if (JSON.stringify(existing) !== before) existing.updatedAt = now;
}

/**
 * Adds shelves by name and volumes by URL. A volume whose URL is already present keeps its id,
 * shelf, cover and progress. `updated` counts every URL that matched an existing volume.
 */
export function mergeLibrary(lib: LibraryV1, incoming: LibraryV1, ctx: OpContext): ImportSummary {
  const { ids: shelfIds, added: shelvesAdded } = mergeShelves(lib, incoming, ctx);
  const usedIds = new Set(lib.bookmarks.map((bookmark) => bookmark.id));
  let added = 0;
  let updated = 0;
  for (const source of incoming.bookmarks) {
    const existing = lib.bookmarks.find((bookmark) => bookmark.url === source.url);
    if (existing) {
      updateExisting(existing, source, ctx.now());
      updated += 1;
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
    const progress = incoming.progress[source.id];
    if (progress) lib.progress[copy.id] = clone(progress);
    added += 1;
  }
  sortLibrary(lib);
  return { added, updated, shelvesAdded };
}

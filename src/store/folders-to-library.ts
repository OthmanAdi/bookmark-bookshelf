/**
 * Turns the folders of an imported bookmarks file into the shelves and volumes to append to a library.
 * A pure function: it reads the library it is given, adds nothing to it and never changes a volume that
 * already exists. Randomness and the clock come in as options so the result can be checked exactly.
 */

import type { Bookmark, CoverSpec, Shelf } from './types';
import { cleanLine } from './clean-text';
import { normalizeUrl } from './url';
import { stripTracking } from './url-hygiene';
import { LIMITS, hostnameTitle } from './validate';

export const IMPORT_LIMIT = 5000;
const FALLBACK_SHELF = 'Imported';

export interface ImportFolder {
  name: string;
  links: ReadonlyArray<{ url: string; title: string; addedAt?: string }>;
}

export interface FoldersPatchOptions {
  now: Date;
  newId(): string;
  /** Cover for a new volume, given its address. Passed in so this module needs no hashing or randomness. */
  coverFor(seedText: string): CoverSpec;
  /** A folder whose name equals an existing shelf name (any case) goes onto that shelf. */
  mergeIntoExistingShelfNames: boolean;
}

export interface FoldersPatchSummary {
  added: number;
  unchanged: number;
  shelvesAdded: number;
  skipped: Array<{ title: string; url: string; reason: string }>;
}

export interface FoldersPatch {
  /** New shelves only. */
  shelves: Shelf[];
  /** New volumes only, in file order. */
  bookmarks: Bookmark[];
  summary: FoldersPatchSummary;
}

/** The address as it will be saved, so the same page with and without tracking parameters counts once. */
function keyOf(url: string): string {
  try {
    return stripTracking(new URL(url)).href;
  } catch {
    return url;
  }
}

function uniqueName(base: string, used: ReadonlySet<string>): string {
  let candidate = base;
  for (let n = 2; used.has(candidate.toLowerCase()); n += 1) {
    const suffix = ` (${n})`;
    candidate = `${base.slice(0, LIMITS.shelfName - suffix.length).trimEnd()}${suffix}`;
  }
  return candidate;
}

export function foldersToLibraryPatch(
  folders: readonly ImportFolder[],
  existing: { shelves: readonly Shelf[]; bookmarks: readonly Bookmark[] },
  options: FoldersPatchOptions,
): FoldersPatch {
  const nowIso = options.now.toISOString();
  const nowTime = options.now.getTime();
  const newShelves: Shelf[] = [];
  const newBookmarks: Bookmark[] = [];
  const summary: FoldersPatchSummary = { added: 0, unchanged: 0, shelvesAdded: 0, skipped: [] };

  const seen = new Set(existing.bookmarks.map((bookmark) => keyOf(bookmark.url)));
  const byName = new Map(existing.shelves.map((shelf) => [shelf.name.toLowerCase(), shelf] as const));
  const usedNames = new Set(byName.keys());
  const nextOrder = new Map<string, number>();
  for (const bookmark of existing.bookmarks) {
    nextOrder.set(bookmark.shelfId, Math.max(nextOrder.get(bookmark.shelfId) ?? 0, bookmark.order + 1));
  }
  let shelfOrder = existing.shelves.reduce((max, shelf) => Math.max(max, shelf.order + 1), 0);

  for (const folder of folders) {
    const wanted = cleanLine(folder.name).slice(0, LIMITS.shelfName).trim() || FALLBACK_SHELF;
    let shelf: Shelf | undefined = options.mergeIntoExistingShelfNames ? byName.get(wanted.toLowerCase()) : undefined;

    for (const link of folder.links) {
      const address = normalizeUrl(link.url);
      if (!address.ok) {
        summary.skipped.push({ title: link.title, url: String(link.url).slice(0, 2048), reason: 'not a valid address' });
        continue;
      }
      const url = stripTracking(new URL(address.value)).href;
      const key = keyOf(url);
      if (seen.has(key)) {
        summary.unchanged += 1;
        continue;
      }
      if (newBookmarks.length >= IMPORT_LIMIT) {
        summary.skipped.push({ title: link.title, url, reason: `over the limit of ${IMPORT_LIMIT.toLocaleString('en-US')}` });
        continue;
      }
      seen.add(key);

      if (!shelf) {
        const name = uniqueName(wanted, usedNames);
        shelf = { id: options.newId(), name, order: shelfOrder };
        shelfOrder += 1;
        usedNames.add(name.toLowerCase());
        byName.set(name.toLowerCase(), shelf);
        newShelves.push(shelf);
        summary.shelvesAdded += 1;
      }

      const parsed = link.addedAt === undefined ? Number.NaN : Date.parse(link.addedAt);
      const addedAt = Number.isNaN(parsed) || parsed > nowTime ? nowIso : new Date(parsed).toISOString();
      const title = cleanLine(link.title).slice(0, LIMITS.title).trim() || hostnameTitle(url);
      const order = nextOrder.get(shelf.id) ?? 0;
      nextOrder.set(shelf.id, order + 1);
      newBookmarks.push({
        id: options.newId(),
        url,
        title,
        tags: [],
        shelfId: shelf.id,
        order,
        addedAt,
        updatedAt: nowIso,
        cover: options.coverFor(url),
      });
      summary.added += 1;
    }
  }
  return { shelves: newShelves, bookmarks: newBookmarks, summary };
}

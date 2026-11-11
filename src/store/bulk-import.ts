/**
 * Bringing many links in at once: the folders of a browser bookmarks file and a pasted list. Neither can
 * change a link that is already saved; an address that is already there is counted and left alone.
 */

import type { Bookmark, ImportSummary, LibraryV2, Result, SkippedLink } from './types';
import type { OpContext } from './bookmark-ops';
import { draftBookmark } from './bookmark-ops';
import { defaultCover } from './cover';
import { IMPORT_LIMIT, foldersToLibraryPatch } from './folders-to-library';
import type { ImportFolder } from './folders-to-library';
import type { LinkListEntry } from './link-list';
import { sortLibrary } from './ordering';
import { notFound, ok } from './result';
import { normalizeUrl, urlKey } from './url';

export interface FoldersImportOptions {
  /** A folder named like a shelf that exists goes onto that shelf. Defaults to true. */
  mergeIntoExistingShelfNames?: boolean;
  /** Entries the reader of the file already left out, so the summary can list them with the rest. */
  skipped?: SkippedLink[];
}

function savedKeys(lib: LibraryV2): Set<string> {
  return new Set(lib.bookmarks.map((bookmark) => urlKey(bookmark.url)));
}

/**
 * Adds the folders of a bookmarks file as shelves and links. A link whose address is already saved, in any
 * spelling, is counted as unchanged. New shelves come after the existing ones.
 */
export function importFoldersInto(
  lib: LibraryV2,
  ctx: OpContext,
  folders: readonly ImportFolder[],
  options: FoldersImportOptions = {},
): Result<ImportSummary> {
  const known = savedKeys(lib);
  let alreadySaved = 0;
  const fresh: ImportFolder[] = folders.map((folder) => ({
    name: folder.name,
    links: folder.links.filter((link) => {
      const address = normalizeUrl(link.url);
      if (!address.ok || !known.has(urlKey(address.value))) return true;
      alreadySaved += 1;
      return false;
    }),
  }));

  const usedIds = new Set([...lib.shelves.map((shelf) => shelf.id), ...lib.bookmarks.map((bookmark) => bookmark.id)]);
  const newId = (): string => {
    let id = ctx.newId();
    while (usedIds.has(id)) id = ctx.newId();
    usedIds.add(id);
    return id;
  };
  const patch = foldersToLibraryPatch(fresh, lib, {
    now: new Date(ctx.now()),
    newId,
    coverFor: defaultCover,
    mergeIntoExistingShelfNames: options.mergeIntoExistingShelfNames ?? true,
  });

  lib.shelves.push(...patch.shelves);
  lib.bookmarks.push(...patch.bookmarks);
  sortLibrary(lib);
  const { summary } = patch;
  return ok({
    added: summary.added,
    unchanged: summary.unchanged + alreadySaved,
    shelvesAdded: summary.shelvesAdded,
    skipped: [...(options.skipped ?? []), ...summary.skipped],
    updated: 0,
  });
}

/**
 * Adds the entries of a pasted list to one shelf, in the order written. An address that is already saved is
 * counted as unchanged; an entry that cannot be saved is listed with the reason.
 */
export function importLinksInto(
  lib: LibraryV2,
  ctx: OpContext,
  entries: readonly LinkListEntry[],
  shelfId: string,
): Result<ImportSummary> {
  if (!lib.shelves.some((shelf) => shelf.id === shelfId)) return notFound('shelf', 'shelfId');
  const known = savedKeys(lib);
  const placed = lib.bookmarks.filter((bookmark) => bookmark.shelfId === shelfId).length;
  const added: Bookmark[] = [];
  const skipped: SkippedLink[] = [];
  let unchanged = 0;

  for (const entry of entries) {
    if (added.length >= IMPORT_LIMIT) {
      skipped.push({
        title: entry.title ?? '',
        url: entry.url,
        reason: `A list can bring in at most ${IMPORT_LIMIT.toLocaleString('en-US')} links at once.`,
      });
      continue;
    }
    const address = normalizeUrl(entry.url);
    if (address.ok && known.has(urlKey(address.value))) {
      unchanged += 1;
      continue;
    }
    const drafted = draftBookmark(
      lib,
      ctx,
      {
        url: entry.url,
        shelfId,
        ...(entry.title !== undefined ? { title: entry.title } : {}),
        ...(entry.note !== undefined ? { note: entry.note } : {}),
        ...(entry.required === false ? { required: false } : {}),
        ...(entry.minutes !== undefined ? { minutes: entry.minutes } : {}),
      },
      placed + added.length,
    );
    if (!drafted.ok) {
      skipped.push({ title: entry.title ?? '', url: entry.url, reason: drafted.error.message });
      continue;
    }
    added.push(drafted.value);
  }

  lib.bookmarks.push(...added);
  sortLibrary(lib);
  return ok({ added: added.length, unchanged, shelvesAdded: 0, skipped, updated: 0 });
}

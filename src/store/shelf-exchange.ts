/**
 * Handing a shelf to someone and receiving one. Sending takes only what can be shared; receiving always makes
 * a new shelf with new ids, so nothing already in the library can be overwritten or merged into.
 */

import type { Bookmark, ImportedShelf, LibraryV2, Result, Shelf, SkippedLink } from './types';
import type { OpContext } from './bookmark-ops';
import { defaultCover, mergeCover } from './cover';
import { shelfBookmarks, sortLibrary } from './ordering';
import { notFound, ok } from './result';
import { readShelfFile, toShelfFile } from './shelf-file';
import type { ShelfFile } from './shelf-file';
import { normalizeUrl } from './url';
import { LIMITS } from './validate';

/** The file for one shelf, in the shelf's own order. Texts go in only when asked for. */
export function exportShelfFrom(lib: LibraryV2, id: string, includeTexts: boolean): Result<ShelfFile> {
  const shelf = lib.shelves.find((item) => item.id === id);
  if (!shelf) return notFound('shelf');
  return ok(
    toShelfFile({
      shelf,
      bookmarks: shelfBookmarks(lib, id),
      includeTexts,
      revision: shelf.origin?.revision ?? 1,
    }),
  );
}

/** A name nobody uses yet: the given one, then "Name (2)", "Name (3)" and so on, kept within the length limit. */
function freeName(lib: LibraryV2, wanted: string): string {
  const taken = new Set(lib.shelves.map((shelf) => shelf.name.toLowerCase()));
  if (!taken.has(wanted.toLowerCase())) return wanted;
  for (let count = 2; ; count += 1) {
    const suffix = ` (${count})`;
    const name = `${wanted.slice(0, LIMITS.shelfName - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

function unwrap(input: unknown): unknown {
  if (typeof input === 'object' && input !== null && 'file' in input && 'skipped' in input) {
    return (input as { file: unknown }).file;
  }
  return input;
}

/**
 * Adds one new shelf from a shelf file given as text, as a parsed value or as what `readShelfFile` returned.
 * Every link gets a fresh id and remembers where it came from; the file order is kept; a link whose address is
 * already saved elsewhere is added all the same, so a class shelf arrives whole. Nothing personal comes with it.
 */
export function importShelfInto(lib: LibraryV2, ctx: OpContext, input: unknown): Result<ImportedShelf> {
  const read = readShelfFile(unwrap(input));
  if (!read.ok) return read;
  const { file } = read.value;
  const skipped: SkippedLink[] = [...read.value.skipped];
  const now = ctx.now();

  const shelf: Shelf = { id: ctx.newId(), name: freeName(lib, file.shelf.name), order: lib.shelves.length };
  const { description, lang, author, due } = file.shelf;
  if (description !== undefined) shelf.description = description;
  if (lang !== undefined) shelf.lang = lang;
  if (author !== undefined) shelf.author = author;
  if (due !== undefined) shelf.due = due;
  shelf.origin = { shelfId: file.shelf.id, revision: file.shelf.revision };

  const used = new Set(lib.bookmarks.map((bookmark) => bookmark.id));
  used.add(shelf.id);
  const fresh = (): string => {
    let id = ctx.newId();
    while (used.has(id)) id = ctx.newId();
    used.add(id);
    return id;
  };

  const links: Bookmark[] = [];
  for (const volume of file.volumes) {
    const url = normalizeUrl(volume.url);
    if (!url.ok) {
      skipped.push({ title: volume.title, url: volume.url, reason: url.error.message });
      continue;
    }
    const link: Bookmark = {
      id: fresh(),
      url: url.value,
      title: volume.title,
      tags: volume.tags ? [...volume.tags] : [],
      shelfId: shelf.id,
      order: links.length,
      addedAt: now,
      updatedAt: now,
      cover: mergeCover(defaultCover(url.value), volume.cover),
      origin: { shelfId: file.shelf.id, volumeId: volume.id },
    };
    if (volume.author !== undefined) link.author = volume.author;
    if (volume.note !== undefined) link.note = volume.note;
    if (volume.text !== undefined) link.reading = { format: 'markdown-lite', text: volume.text, savedAt: now };
    if (volume.required === false) link.required = false;
    if (volume.minutes !== undefined) link.minutes = volume.minutes;
    links.push(link);
  }

  lib.shelves.push(shelf);
  lib.bookmarks.push(...links);
  sortLibrary(lib);
  return ok({ shelfId: shelf.id, name: shelf.name, added: links.length, skipped });
}

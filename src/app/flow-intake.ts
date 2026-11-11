import type { Store } from '../store';
import { LIBRARY_FORMAT } from '../store';
import { isNetscapeBookmarks, parseNetscapeBookmarks, type NetscapeBookmarks } from '../store/netscape';
import { SHELF_FILE_FORMAT, readShelfFile, type ShelfFileRead } from '../store/shelf-file';

/**
 * Working out what a file or a piece of pasted text is, before anything is shown or saved. Nothing here
 * changes the library: it only reads, and every reading goes through the store's own parsers.
 */

export const MAX_INTAKE_BYTES = 10 * 1024 * 1024;

export type Intake =
  | { kind: 'bookmarks'; read: NetscapeBookmarks }
  | { kind: 'shelf'; read: ShelfFileRead }
  | { kind: 'library'; text: string; shelves: number; links: number }
  | { kind: 'list'; text: string }
  | { kind: 'refused'; message: string };

function countOf(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/** What `text` is: a browser bookmarks file, a shelf file, a library file, or a list of links to read line by line. */
export function sniffText(text: string): Intake {
  if (typeof text !== 'string' || text.trim() === '') return { kind: 'refused', message: 'That file is empty.' };
  if (isNetscapeBookmarks(text)) return { kind: 'bookmarks', read: parseNetscapeBookmarks(text) };

  const first = text.trimStart().charAt(0);
  if (first === '{') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { kind: 'refused', message: 'That file looks like JSON but cannot be read. It may be damaged or cut off.' };
    }
    const format = (parsed as { format?: unknown } | null)?.format;
    if (format === SHELF_FILE_FORMAT) {
      const read = readShelfFile(parsed);
      return read.ok ? { kind: 'shelf', read: read.value } : { kind: 'refused', message: read.error.message };
    }
    if (format === LIBRARY_FORMAT) {
      const library = parsed as { shelves?: unknown; bookmarks?: unknown };
      return { kind: 'library', text, shelves: countOf(library.shelves), links: countOf(library.bookmarks) };
    }
    return { kind: 'refused', message: 'That JSON file was not made by this app, so it cannot be brought in.' };
  }
  return { kind: 'list', text };
}

/** Reads a file the person chose or dropped. Large files are refused before they are read. */
export async function readIntakeFile(file: File): Promise<Intake> {
  if (file.size > MAX_INTAKE_BYTES) return { kind: 'refused', message: 'That file is larger than 10 MB, which is more than this app brings in at once.' };
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { kind: 'refused', message: 'That file could not be read.' };
  }
  return sniffText(text);
}

/** How many of these addresses are saved already, in any spelling of the address. */
export function countKnown(store: Pick<Store, 'findByUrl'>, urls: Iterable<string>): number {
  let known = 0;
  for (const url of urls) if (store.findByUrl(url)) known += 1;
  return known;
}

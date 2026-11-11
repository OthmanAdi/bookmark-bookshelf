/**
 * Ways out of the app besides its own backup file: a bookmarks file that any browser can import, and a
 * Markdown list that can be pasted into a document or read back by `parseLinkList`.
 */

import { cleanLine } from './clean-text';
import { hostnameTitle } from './validate';

export interface ExportShelf {
  id: string;
  name: string;
  order?: number;
}

export interface ExportBookmark {
  shelfId: string;
  url: string;
  title: string;
  note?: string;
  addedAt?: string;
  order?: number;
  required?: boolean;
  minutes?: number;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function unixSeconds(iso: string | undefined): number | undefined {
  if (iso === undefined) return undefined;
  const time = Date.parse(iso);
  if (Number.isNaN(time) || time <= 0) return undefined;
  return Math.floor(time / 1000);
}

function byOrder<T extends { order?: number }>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const left = a.item.order;
      const right = b.item.order;
      if (typeof left === 'number' && typeof right === 'number' && left !== right) return left - right;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

/** A bookmarks file in the format every desktop browser reads and writes: one folder per shelf. */
export function toNetscapeBookmarks(library: {
  shelves: readonly ExportShelf[];
  bookmarks: readonly ExportBookmark[];
}): string {
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];
  for (const shelf of byOrder(library.shelves)) {
    const volumes = byOrder(library.bookmarks.filter((bookmark) => bookmark.shelfId === shelf.id));
    const times = volumes.map((volume) => unixSeconds(volume.addedAt)).filter((time): time is number => time !== undefined);
    const folderDate = times.length > 0 ? ` ADD_DATE="${Math.min(...times)}"` : '';
    lines.push(`    <DT><H3${folderDate}>${escapeHtml(cleanLine(shelf.name))}</H3>`, '    <DL><p>');
    for (const volume of volumes) {
      const added = unixSeconds(volume.addedAt);
      const date = added === undefined ? '' : ` ADD_DATE="${added}"`;
      const title = cleanLine(volume.title) || hostnameTitle(volume.url);
      lines.push(`        <DT><A HREF="${escapeHtml(volume.url)}"${date}>${escapeHtml(title)}</A>`);
      const note = cleanLine(volume.note ?? '');
      if (note !== '') lines.push(`        <DD>${escapeHtml(note)}`);
    }
    lines.push('    </DL><p>');
  }
  lines.push('</DL><p>', '');
  return lines.join('\n');
}

const MARKDOWN_SPECIAL = /[\\`*_{}[\]()#+!|<>~]/g;

function escapeMarkdown(text: string): string {
  return text.replace(MARKDOWN_SPECIAL, '\\$&');
}

function markdownAddress(url: string): string {
  return url.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/\s/g, '%20');
}

/**
 * `# name`, then one numbered line per volume: `1. [Title](address) - note ~12 min (optional)`.
 * The note, the stated length and the optional mark are only written when the volume has them.
 */
export function toMarkdownList(input: {
  shelfName: string;
  volumes: ReadonlyArray<Pick<ExportBookmark, 'url' | 'title' | 'note' | 'required' | 'minutes'>>;
}): string {
  const name = cleanLine(input.shelfName) || 'Shelf';
  const lines = [`# ${escapeMarkdown(name)}`, ''];
  input.volumes.forEach((volume, index) => {
    const title = cleanLine(volume.title) || hostnameTitle(volume.url);
    let line = `${index + 1}. [${escapeMarkdown(title)}](${markdownAddress(volume.url)})`;
    const note = cleanLine(volume.note ?? '');
    if (note !== '') line += ` - ${note}`;
    if (typeof volume.minutes === 'number' && volume.minutes >= 1) line += ` ~${Math.round(volume.minutes)} min`;
    if (volume.required === false) line += ' (optional)';
    lines.push(line);
  });
  lines.push('');
  return lines.join('\n');
}

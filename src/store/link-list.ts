/**
 * Reads a pasted list of links, one entry per line. Accepted shapes, with or without a leading list
 * marker or number:
 *
 *   [Title](https://example.org)        Title | https://example.org | note
 *   Title - https://example.org         https://example.org Title
 *   https://example.org
 *
 * `(optional)` marks an entry as not required and `~12 min` sets its reading time. A line with no address
 * is returned as unreadable with its line number; nothing is guessed.
 */

import { cleanLine } from './clean-text';
import { normalizeUrl } from './url';
import { MAX_URL_LENGTH, hasCredentials, looksLikeAddress } from './url-hygiene';

export interface LinkListEntry {
  url: string;
  title?: string;
  note?: string;
  required?: boolean;
  minutes?: number;
}

export interface UnreadableLine {
  /** 1-based. */
  line: number;
  text: string;
}

export interface LinkListResult {
  entries: LinkListEntry[];
  unreadable: UnreadableLine[];
}

const MAX_LINE = 5000;
const MAX_SHOWN = 300;
const LIST_MARKER = /^(?:[-*+•]|\d{1,4}[.)])[ \t]+/;
const HEADING = /^#{1,6}[ \t]/;
const OPTIONAL = /\(\s*optional\s*\)/gi;
const MINUTES = /~\s*(\d{1,4})\s*min(?:ute)?s?\b/i;
const SEPARATORS = new Set(['-', '–', '—', '|', ':']);
const MARKDOWN_ESCAPE = /\\([\\`*_{}[\]()#+\-.!|<>~])/g;

interface Parts {
  url: string;
  title: string;
  note: string;
}

function isSpace(char: string | undefined): boolean {
  return char === ' ' || char === '\t';
}

/** Trims whitespace and separator characters from both ends of a loose piece of text. */
function tidy(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && (isSpace(text[start]) || SEPARATORS.has(text[start] ?? ''))) start += 1;
  while (end > start && (isSpace(text[end - 1]) || SEPARATORS.has(text[end - 1] ?? ''))) end -= 1;
  return text.slice(start, end).replace(/[ \t]+/g, ' ');
}

/** Finds `[text](target)` where the target is an address. Brackets and parentheses may nest or be escaped. */
function findMarkdownLink(line: string): { start: number; end: number; text: string; target: string } | undefined {
  let from = line.indexOf('[');
  while (from !== -1) {
    let depth = 0;
    let close = -1;
    for (let i = from; i < line.length; i += 1) {
      const char = line[i];
      if (char === '\\') {
        i += 1;
      } else if (char === '[') {
        depth += 1;
      } else if (char === ']') {
        depth -= 1;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    if (close !== -1 && line[close + 1] === '(') {
      let level = 1;
      let i = close + 2;
      for (; i < line.length; i += 1) {
        const char = line[i];
        if (char === '(') level += 1;
        else if (char === ')') {
          level -= 1;
          if (level === 0) break;
        } else if (isSpace(char)) {
          break;
        }
      }
      let target = line.slice(close + 2, i);
      if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
      if (looksLikeAddress(target)) {
        let end = i;
        if (line[end] !== ')') {
          const closing = line.indexOf(')', end);
          end = closing === -1 ? line.length : closing + 1;
        } else {
          end += 1;
        }
        return { start: from, end, text: line.slice(from + 1, close).replace(MARKDOWN_ESCAPE, '$1'), target };
      }
    }
    from = line.indexOf('[', from + 1);
  }
  return undefined;
}

function bareAddress(token: string): string | undefined {
  let text = token;
  if (text.startsWith('<') && text.endsWith('>')) text = text.slice(1, -1);
  else if (text.startsWith('(') && text.endsWith(')')) text = text.slice(1, -1);
  text = text.replace(/[.,;:!?]+$/, '');
  return looksLikeAddress(text) ? text : undefined;
}

function splitPiped(line: string): Parts | undefined {
  if (!line.includes('|')) return undefined;
  const pieces = line.split('|').map((piece) => piece.trim());
  const index = pieces.findIndex((piece) => bareAddress(piece) !== undefined);
  if (index === -1) return undefined;
  const url = bareAddress(pieces[index] ?? '') ?? '';
  const before = pieces.slice(0, index).filter((piece) => piece !== '');
  const after = pieces.slice(index + 1).filter((piece) => piece !== '');
  if (before.length > 0) return { url, title: before.join(' '), note: after.join(' ') };
  return { url, title: after[0] ?? '', note: after.slice(1).join(' ') };
}

function splitLoose(line: string): Parts | undefined {
  const tokens = line.split(/[ \t]+/);
  const index = tokens.findIndex((token) => bareAddress(token) !== undefined);
  if (index === -1) return undefined;
  const url = bareAddress(tokens[index] ?? '') ?? '';
  const before = tidy(tokens.slice(0, index).join(' '));
  const after = tidy(tokens.slice(index + 1).join(' '));
  if (before !== '') return { url, title: before, note: after };
  return { url, title: after, note: '' };
}

function splitLine(line: string): Parts | undefined {
  const link = findMarkdownLink(line);
  if (link) {
    const rest = `${line.slice(0, link.start)} ${line.slice(link.end)}`;
    return { url: link.target, title: link.text, note: rest };
  }
  return splitPiped(line) ?? splitLoose(line);
}

function finalUrl(raw: string): string | undefined {
  const text = raw.trim();
  if (text.length > MAX_URL_LENGTH) return undefined;
  const normalized = normalizeUrl(text);
  if (!normalized.ok) return undefined;
  try {
    if (hasCredentials(new URL(normalized.value))) return undefined;
  } catch {
    return undefined;
  }
  return normalized.value;
}

function readLine(raw: string): LinkListEntry | undefined {
  let line = raw.trim();
  if (line.length > MAX_LINE) return undefined;
  line = line.replace(LIST_MARKER, '');
  const parts = splitLine(line);
  if (!parts) return undefined;
  const url = finalUrl(parts.url);
  if (url === undefined) return undefined;

  let required: boolean | undefined;
  let minutes: number | undefined;
  const read = (text: string): string => {
    let out = text.replace(OPTIONAL, ' ');
    if (out !== text) required = false;
    const match = MINUTES.exec(out);
    if (match) {
      const value = Number(match[1]);
      if (value >= 1 && value <= 600 && minutes === undefined) minutes = value;
      out = out.replace(MINUTES, ' ');
    }
    return tidy(cleanLine(out));
  };

  const title = read(parts.title);
  const note = read(parts.note);
  const entry: LinkListEntry = { url };
  if (title !== '') entry.title = title;
  if (note !== '') entry.note = note;
  if (required !== undefined) entry.required = required;
  if (minutes !== undefined) entry.minutes = minutes;
  return entry;
}

export function parseLinkList(text: string): LinkListResult {
  const entries: LinkListEntry[] = [];
  const unreadable: UnreadableLine[] = [];
  if (typeof text !== 'string') return { entries, unreadable };
  const lines = text.split(/\r\n|\r|\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? '';
    const trimmed = raw.trim();
    if (trimmed === '' || HEADING.test(trimmed)) continue;
    const entry = readLine(raw);
    if (entry) entries.push(entry);
    else unreadable.push({ line: index + 1, text: cleanLine(trimmed).slice(0, MAX_SHOWN) });
  }
  return { entries, unreadable };
}

/**
 * Reads the bookmarks file every desktop browser exports (the "Netscape bookmark file": HTML written as
 * nested definition lists). The store has no DOM, so this is a tolerant scanner over the few tags that
 * matter. It never throws and it makes one pass over the text: no backtracking patterns, and every
 * position is read at most once, so a file of several megabytes takes a few tens of milliseconds.
 */

import { cleanLine } from './clean-text';
import { MAX_URL_LENGTH, hasCredentials } from './url-hygiene';

export interface NetscapeLink {
  url: string;
  title: string;
  /** ISO time, from `ADD_DATE` (Unix seconds). Left out when missing or absurd. */
  addedAt?: string;
}

export interface NetscapeFolder {
  /** Nested folders read `Parent / Child`. Links outside any folder go to `Imported`. */
  name: string;
  links: NetscapeLink[];
}

export interface NetscapeSkipped {
  title: string;
  url: string;
  reason: string;
}

export interface NetscapeBookmarks {
  folders: NetscapeFolder[];
  skipped: NetscapeSkipped[];
}

export const IMPORTED_FOLDER = 'Imported';

const MAX_TEXT = 2000;
const MAX_NAME = 200;
const MAX_DEPTH = 16;
/** 1980-01-01 and 2100-01-01 in Unix seconds. Anything outside is a different unit or a broken file. */
const DATE_MIN = 315532800;
const DATE_MAX = 4102444800;

/** Tags that end a title that was never closed, so a truncated or sloppy file loses one title, not the rest. */
const STRUCTURAL = new Set(['dl', 'dt', 'dd', 'a', 'h3']);

const ENTITY = /&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|amp|lt|gt|quot|apos);/gi;
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(ENTITY, (whole, body: string) => {
    const lower = body.toLowerCase();
    const named = NAMED[lower];
    if (named !== undefined) return named;
    const code = lower.startsWith('#x') ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10);
    if (!Number.isFinite(code) || code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return whole;
    return String.fromCodePoint(code);
  });
}

function isSpace(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13 || code === 12;
}

function isAlnum(code: number): boolean {
  return (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || (code >= 48 && code <= 57);
}

interface Tag {
  name: string;
  closing: boolean;
  attrs: Record<string, string>;
  /** Index just after the tag. */
  end: number;
}

const WANTED_ATTRS: ReadonlySet<string> = new Set(['a']);

/** Reads the tag that starts at `start` (a `<`). Returns undefined when it is not a tag at all. */
function readTag(html: string, start: number): Tag | undefined {
  const length = html.length;
  let i = start + 1;
  const closing = html.charCodeAt(i) === 47;
  if (closing) i += 1;
  const nameStart = i;
  while (i < length && isAlnum(html.charCodeAt(i))) i += 1;
  if (i === nameStart) return undefined;
  const name = html.slice(nameStart, Math.min(i, nameStart + 12)).toLowerCase();
  const keep = !closing && WANTED_ATTRS.has(name);
  const attrs: Record<string, string> = {};

  while (i < length) {
    while (i < length && (isSpace(html.charCodeAt(i)) || html.charCodeAt(i) === 47)) i += 1;
    if (i >= length) break;
    if (html.charCodeAt(i) === 62) return { name, closing, attrs, end: i + 1 };
    const attrStart = i;
    while (i < length) {
      const code = html.charCodeAt(i);
      if (isSpace(code) || code === 61 || code === 62) break;
      i += 1;
    }
    const attrName = html.slice(attrStart, i).toLowerCase();
    while (i < length && isSpace(html.charCodeAt(i))) i += 1;
    let value = '';
    if (html.charCodeAt(i) === 61) {
      i += 1;
      while (i < length && isSpace(html.charCodeAt(i))) i += 1;
      const quote = html.charCodeAt(i);
      if (quote === 34 || quote === 39) {
        const close = html.indexOf(quote === 34 ? '"' : "'", i + 1);
        if (close === -1) {
          value = html.slice(i + 1);
          i = length;
        } else {
          value = html.slice(i + 1, close);
          i = close + 1;
        }
      } else {
        const valueStart = i;
        while (i < length && !isSpace(html.charCodeAt(i)) && html.charCodeAt(i) !== 62) i += 1;
        value = html.slice(valueStart, i);
      }
    }
    if (keep && attrName !== '' && !(attrName in attrs)) attrs[attrName] = value;
  }
  return { name, closing, attrs, end: length };
}

/**
 * Collects the text of an element that starts at `from`, skipping inline tags, until its closing tag.
 * Stops without consuming when a structural tag shows up first (an unclosed element).
 */
function readText(html: string, from: number, closeName: string): { text: string; end: number } {
  const length = html.length;
  let text = '';
  const append = (segment: string): void => {
    if (text.length < MAX_TEXT) text += segment.slice(0, MAX_TEXT - text.length);
  };
  let segmentStart = from;
  let pos = from;
  while (pos < length) {
    const lt = html.indexOf('<', pos);
    if (lt === -1) break;
    const tag = readTag(html, lt);
    if (!tag) {
      pos = lt + 1;
      continue;
    }
    if (tag.closing && tag.name === closeName) {
      append(html.slice(segmentStart, lt));
      return { text, end: tag.end };
    }
    if (STRUCTURAL.has(tag.name)) {
      append(html.slice(segmentStart, lt));
      return { text, end: lt };
    }
    append(html.slice(segmentStart, lt));
    segmentStart = tag.end;
    pos = tag.end;
  }
  append(html.slice(segmentStart));
  return { text, end: length };
}

function isoFromUnixSeconds(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!/^\d{1,11}$/.test(trimmed)) return undefined;
  const seconds = Number(trimmed);
  if (seconds < DATE_MIN || seconds > DATE_MAX) return undefined;
  return new Date(seconds * 1000).toISOString();
}

type Checked = { ok: true; url: string } | { ok: false; reason: string };

function checkAddress(raw: string): Checked {
  if (raw === '') return { ok: false, reason: 'has no address' };
  if (raw.length > MAX_URL_LENGTH) return { ok: false, reason: `address is longer than ${MAX_URL_LENGTH} characters` };
  const scheme = SCHEME.exec(raw)?.[1]?.toLowerCase();
  if (scheme === undefined) return { ok: false, reason: 'not a valid address' };
  if (scheme !== 'http' && scheme !== 'https') return { ok: false, reason: `not a web address (${scheme}:)` };
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: 'not a valid address' };
  }
  if (parsed.hostname === '') return { ok: false, reason: 'not a valid address' };
  if (hasCredentials(parsed)) return { ok: false, reason: 'address contains a user name or password' };
  if (parsed.href.length > MAX_URL_LENGTH) return { ok: false, reason: `address is longer than ${MAX_URL_LENGTH} characters` };
  return { ok: true, url: parsed.href };
}

/** Parses a browser bookmarks export. Never throws: text that is not a bookmarks file gives no folders. */
export function parseNetscapeBookmarks(html: string): NetscapeBookmarks {
  const folders: NetscapeFolder[] = [];
  const skipped: NetscapeSkipped[] = [];
  if (typeof html !== 'string' || html === '') return { folders, skipped };

  const byName = new Map<string, NetscapeFolder>();
  /** One cumulative path per open list; `''` for a list without a folder name. */
  const paths: string[] = [''];
  let pending: string | undefined;

  const folderFor = (path: string): NetscapeFolder => {
    const name = path === '' ? IMPORTED_FOLDER : path;
    const key = name.toLowerCase();
    let folder = byName.get(key);
    if (!folder) {
      folder = { name, links: [] };
      byName.set(key, folder);
      folders.push(folder);
    }
    return folder;
  };

  const length = html.length;
  let i = 0;
  while (i < length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;
    if (html.startsWith('<!--', lt)) {
      const close = html.indexOf('-->', lt + 4);
      i = close === -1 ? length : close + 3;
      continue;
    }
    const tag = readTag(html, lt);
    if (!tag) {
      i = lt + 1;
      continue;
    }
    i = tag.end;

    if (tag.name === 'dl') {
      if (tag.closing) {
        if (paths.length > 1) paths.pop();
        pending = undefined;
      } else {
        const parent = paths[paths.length - 1] ?? '';
        let path = parent;
        if (pending !== undefined && paths.length <= MAX_DEPTH) path = parent === '' ? pending : `${parent} / ${pending}`;
        paths.push(path);
        pending = undefined;
      }
    } else if (tag.name === 'h3' && !tag.closing) {
      const text = readText(html, i, 'h3');
      i = text.end;
      const name = cleanLine(decodeEntities(text.text)).slice(0, MAX_NAME).trim();
      pending = name === '' ? undefined : name;
    } else if (tag.name === 'a' && !tag.closing) {
      const text = readText(html, i, 'a');
      i = text.end;
      // An anchor without an href is a named target inside a page, not a bookmark.
      if (tag.attrs.href === undefined) continue;
      const title = cleanLine(decodeEntities(text.text)).slice(0, 300);
      const raw = decodeEntities(tag.attrs.href).trim();
      const checked = checkAddress(raw);
      if (!checked.ok) {
        skipped.push({ title, url: raw.slice(0, MAX_URL_LENGTH), reason: checked.reason });
        continue;
      }
      const link: NetscapeLink = { url: checked.url, title };
      const addedAt = isoFromUnixSeconds(tag.attrs.add_date);
      if (addedAt !== undefined) link.addedAt = addedAt;
      folderFor(paths[paths.length - 1] ?? '').links.push(link);
    }
  }
  return { folders, skipped };
}

const SNIFF_LENGTH = 2000;
const SNIFF_DOCTYPE = /netscape-bookmark-file-1/i;
const SNIFF_LIST = /<dl[^>]{0,200}>\s{0,200}(?:<p>\s{0,200})?<dt/i;

/** Cheap check of the start of a text: is this a browser bookmarks export rather than a JSON library? */
export function isNetscapeBookmarks(text: string): boolean {
  if (typeof text !== 'string') return false;
  const head = text.slice(0, SNIFF_LENGTH);
  return SNIFF_DOCTYPE.test(head) || SNIFF_LIST.test(head);
}

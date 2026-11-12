/**
 * The shelf file: one shelf handed to someone else as a JSON file.
 *
 * It carries only what can be shared. Reading position, done marks and private notes live in maps next to
 * the library, so writing a file never has to strip anything out of a volume: it just does not take them.
 * Reading one treats the content as untrusted: bounds are enforced, text is cleaned, addresses are checked.
 */

import type { CoverSpec, Result } from './types';
import { cleanLine, cleanText } from './clean-text';
import { materialName } from './cover';
import { fail, ok } from './result';
import { minutesOf } from './reading-time';
import { MAX_URL_LENGTH, hasCredentials } from './url-hygiene';
import { LIMITS, hostnameTitle, normalizeTags } from './validate';

export const SHELF_FILE_FORMAT = 'bookmark-bookshelf-shelf' as const;
export const SHELF_FILE_VERSION = 1 as const;

export const SHELF_FILE_LIMITS = {
  volumes: 500,
  textPerVolume: 200000,
  fileBytes: 5 * 1024 * 1024,
  description: 500,
  author: 80,
  lang: 12,
  minutes: 600,
  id: 100,
  seed: 2147483647,
  coverName: 24,
} as const;

export interface ShelfFileVolume {
  id: string;
  url: string;
  title: string;
  author?: string;
  note?: string;
  tags?: string[];
  /** Absent means required. */
  required?: boolean;
  minutes?: number;
  cover?: CoverSpec;
  /** Markdown-lite reading text. */
  text?: string;
}

export interface ShelfFile {
  format: typeof SHELF_FILE_FORMAT;
  version: typeof SHELF_FILE_VERSION;
  shelf: {
    id: string;
    name: string;
    description?: string;
    lang?: string;
    author?: string;
    /** YYYY-MM-DD. */
    due?: string;
    revision: number;
  };
  volumes: ShelfFileVolume[];
}

export interface ShelfFileSkipped {
  title: string;
  url: string;
  reason: string;
}

export interface ShelfFileRead {
  file: ShelfFile;
  skipped: ShelfFileSkipped[];
}

/** The parts of a shelf that go into a file. A library shelf satisfies this. */
export interface ShelfFileShelf {
  id: string;
  name: string;
  description?: string;
  lang?: string;
  author?: string;
  due?: string;
}

/** The parts of a volume that go into a file. A library volume satisfies this and may carry more. */
export interface ShelfFileSource {
  id: string;
  url: string;
  title: string;
  author?: string;
  note?: string;
  tags?: string[];
  required?: boolean;
  minutes?: number;
  cover?: CoverSpec;
  reading?: { text: string };
  shelfId?: string;
  order?: number;
}

/**
 * Builds the file for one shelf. Volumes from other shelves are left out when they say which shelf they
 * are on, and the rest keep their stored order. Only the listed shareable fields are copied.
 */
export function toShelfFile(input: {
  shelf: ShelfFileShelf;
  bookmarks: readonly ShelfFileSource[];
  includeTexts: boolean;
  revision?: number;
}): ShelfFile {
  const { shelf } = input;
  const meta: ShelfFile['shelf'] = { id: shelf.id, name: shelf.name, revision: input.revision ?? 1 };
  if (shelf.description) meta.description = shelf.description;
  if (shelf.lang) meta.lang = shelf.lang;
  if (shelf.author) meta.author = shelf.author;
  if (shelf.due) meta.due = shelf.due;

  const own = input.bookmarks
    .map((bookmark, index) => ({ bookmark, index }))
    .filter(({ bookmark }) => bookmark.shelfId === undefined || bookmark.shelfId === shelf.id);
  own.sort((a, b) => {
    const left = a.bookmark.order;
    const right = b.bookmark.order;
    if (typeof left === 'number' && typeof right === 'number' && left !== right) return left - right;
    return a.index - b.index;
  });

  const volumes = own.map(({ bookmark }): ShelfFileVolume => {
    const volume: ShelfFileVolume = { id: bookmark.id, url: bookmark.url, title: bookmark.title };
    if (bookmark.author) volume.author = bookmark.author;
    if (bookmark.note) volume.note = bookmark.note;
    if (bookmark.tags && bookmark.tags.length > 0) volume.tags = [...bookmark.tags];
    if (typeof bookmark.required === 'boolean') volume.required = bookmark.required;
    if (typeof bookmark.minutes === 'number') volume.minutes = bookmark.minutes;
    if (bookmark.cover) {
      const { cloth, pattern, seed, binding, stamp } = bookmark.cover;
      volume.cover = { cloth, pattern, seed };
      // Only a chosen binding or stamp is written, so a file without them stays as short as before.
      if (binding) volume.cover.binding = binding;
      if (stamp) volume.cover.stamp = stamp;
    }
    if (input.includeTexts && bookmark.reading && bookmark.reading.text !== '') volume.text = bookmark.reading.text;
    return volume;
  });
  return { format: SHELF_FILE_FORMAT, version: SHELF_FILE_VERSION, shelf: meta, volumes };
}

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function foldForName(value: string): string {
  return value
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '');
}

const RESERVED_NAMES = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

/** `<shelf-name-slug>.shelf.json`, safe as a file name on any system. */
export function shelfFileName(name: string): string {
  let slug = foldForName(typeof name === 'string' ? name : '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  if (slug === '') slug = 'shelf';
  if (RESERVED_NAMES.test(slug)) slug = `${slug}-shelf`;
  return `${slug}.shelf.json`;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function validDue(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function validId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const id = cleanLine(value);
  return id !== '' && id === value && id.length <= SHELF_FILE_LIMITS.id && id !== '__proto__';
}

function coverName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, SHELF_FILE_LIMITS.coverName);
}

/**
 * Clamps a cover to the allowed shapes. A cover that cannot be made safe is left out; the app derives one.
 * A binding or stamp that is not a short name of letters is left out on its own, and the renderer chooses.
 */
function readCover(value: unknown): CoverSpec | undefined {
  if (!isFields(value)) return undefined;
  const cloth = coverName(value.cloth);
  const pattern = coverName(value.pattern);
  const raw = value.seed;
  if (cloth === '' || pattern === '' || typeof raw !== 'number' || Number.isNaN(raw)) return undefined;
  const seed = Math.min(SHELF_FILE_LIMITS.seed, Math.max(0, Math.trunc(raw)));
  const cover: CoverSpec = { cloth, pattern, seed };
  const binding = materialName(value.binding);
  const stamp = materialName(value.stamp);
  if (binding !== undefined) cover.binding = binding;
  if (stamp !== undefined) cover.stamp = stamp;
  return cover;
}

type VolumeRead = { volume: ShelfFileVolume } | { reason: string };

function readVolume(item: Fields, urlText: string): VolumeRead {
  if (!validId(item.id)) return { reason: 'volume has no usable id' };

  if (urlText === '') return { reason: 'address is missing' };
  if (urlText.length > MAX_URL_LENGTH) return { reason: `address is longer than ${MAX_URL_LENGTH} characters` };
  if (!/^https?:\/\//i.test(urlText)) return { reason: 'address is not an http or https address' };
  let parsed: URL;
  try {
    parsed = new URL(urlText);
  } catch {
    return { reason: 'address is not valid' };
  }
  if (parsed.hostname === '') return { reason: 'address is not valid' };
  if (hasCredentials(parsed)) return { reason: 'address contains a user name or password' };
  if (parsed.href.length > MAX_URL_LENGTH) return { reason: `address is longer than ${MAX_URL_LENGTH} characters` };

  const rawTitle = typeof item.title === 'string' ? cleanLine(item.title) : '';
  if (rawTitle.length > LIMITS.title) return { reason: `title is longer than ${LIMITS.title} characters` };
  const volume: ShelfFileVolume = { id: item.id, url: parsed.href, title: rawTitle === '' ? hostnameTitle(parsed.href) : rawTitle };

  if (item.author !== undefined) {
    const author = typeof item.author === 'string' ? cleanLine(item.author) : '';
    if (author.length > LIMITS.author) return { reason: `author is longer than ${LIMITS.author} characters` };
    if (author !== '') volume.author = author;
  }
  if (item.note !== undefined) {
    const note = typeof item.note === 'string' ? cleanText(item.note).trim() : '';
    if (note.length > LIMITS.note) return { reason: `note is longer than ${LIMITS.note} characters` };
    if (note !== '') volume.note = note;
  }
  if (item.tags !== undefined) {
    if (!Array.isArray(item.tags)) return { reason: 'tags are not a list' };
    const tags = normalizeTags(item.tags.filter((tag): tag is string => typeof tag === 'string').map(cleanLine));
    if (tags.length > 0) volume.tags = tags;
  }
  if (item.required !== undefined) {
    if (typeof item.required !== 'boolean') return { reason: 'required must be true or false' };
    volume.required = item.required;
  }
  if (item.minutes !== undefined) {
    const { minutes } = item;
    if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 1 || minutes > SHELF_FILE_LIMITS.minutes) {
      return { reason: `minutes must be a whole number from 1 to ${SHELF_FILE_LIMITS.minutes}` };
    }
    volume.minutes = minutes;
  }
  if (item.cover !== undefined) {
    const cover = readCover(item.cover);
    if (cover) volume.cover = cover;
  }
  if (item.text !== undefined) {
    if (typeof item.text !== 'string') return { reason: 'text is not a string' };
    if (item.text.length > SHELF_FILE_LIMITS.textPerVolume) {
      return { reason: `reading text is longer than ${SHELF_FILE_LIMITS.textPerVolume.toLocaleString('en-US')} characters` };
    }
    const text = cleanText(item.text);
    if (text.trim() !== '') volume.text = text;
  }
  return { volume };
}

function readMeta(value: unknown): Result<ShelfFile['shelf']> {
  if (!isFields(value)) return fail('invalid-shelf', 'The file has no shelf in it.', 'shelf');
  if (!validId(value.id)) return fail('invalid-shelf', 'The shelf in the file has no usable id.', 'id');
  const name = typeof value.name === 'string' ? cleanLine(value.name) : '';
  if (name === '') return fail('invalid-name', 'The shelf in the file has no name.', 'name');
  if (name.length > LIMITS.shelfName) {
    return fail('too-long', `The shelf name can have at most ${LIMITS.shelfName} characters.`, 'name');
  }
  const meta: ShelfFile['shelf'] = { id: value.id, name, revision: 1 };

  if (value.description !== undefined) {
    const description = typeof value.description === 'string' ? cleanText(value.description).trim() : '';
    if (description.length > SHELF_FILE_LIMITS.description) {
      return fail('too-long', `The description can have at most ${SHELF_FILE_LIMITS.description} characters.`, 'description');
    }
    if (description !== '') meta.description = description;
  }
  if (value.author !== undefined) {
    const author = typeof value.author === 'string' ? cleanLine(value.author) : '';
    if (author.length > SHELF_FILE_LIMITS.author) {
      return fail('too-long', `The author can have at most ${SHELF_FILE_LIMITS.author} characters.`, 'author');
    }
    if (author !== '') meta.author = author;
  }
  if (value.lang !== undefined) {
    if (typeof value.lang !== 'string') return fail('invalid-lang', 'The language has to be text.', 'lang');
    const lang = value.lang.trim();
    if (lang !== '') {
      if (lang.length > SHELF_FILE_LIMITS.lang || !/^[A-Za-z0-9-]+$/.test(lang)) {
        return fail('invalid-lang', 'The language can only hold letters, digits and hyphens, up to 12 characters.', 'lang');
      }
      meta.lang = lang;
    }
  }
  if (value.due !== undefined) {
    if (typeof value.due !== 'string') return fail('invalid-due', 'The due date has to look like 2026-03-31.', 'due');
    const due = value.due.trim();
    if (due !== '') {
      if (!validDue(due)) return fail('invalid-due', 'The due date has to look like 2026-03-31.', 'due');
      meta.due = due;
    }
  }
  if (value.revision !== undefined) {
    const { revision } = value;
    if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1 || revision > 1_000_000) {
      return fail('invalid-revision', 'The revision has to be a whole number of at least 1.', 'revision');
    }
    meta.revision = revision;
  }
  return ok(meta);
}

/**
 * Reads and checks a shelf file given as JSON text or as an already parsed value. Never throws.
 * Volumes that fail are left out and listed in `skipped` with the reason; problems with the file or the
 * shelf itself are an error.
 */
export function readShelfFile(input: unknown): Result<ShelfFileRead> {
  let data: unknown = input;
  if (typeof input === 'string') {
    if (input.length > SHELF_FILE_LIMITS.fileBytes || (input.length * 3 > SHELF_FILE_LIMITS.fileBytes && byteLength(input) > SHELF_FILE_LIMITS.fileBytes)) {
      return fail('file-too-large', 'That shelf file is larger than 5 MB.');
    }
    try {
      data = JSON.parse(input.charCodeAt(0) === 0xfeff ? input.slice(1) : input);
    } catch {
      return fail('invalid-file', 'That is not a shelf file: the text is not valid JSON.');
    }
  }
  if (!isFields(data) || data.format !== SHELF_FILE_FORMAT) {
    return fail('not-a-shelf-file', 'That is not a Bookmark Bookshelf shelf file.', 'format');
  }
  const { version } = data;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return fail('not-a-shelf-file', 'That shelf file has no version number.', 'version');
  }
  if (version > SHELF_FILE_VERSION) {
    return fail('unsupported-version', 'This shelf file was made by a newer version. Update the app to open it.', 'version');
  }

  const meta = readMeta(data.shelf);
  if (!meta.ok) return meta;
  if (!Array.isArray(data.volumes)) return fail('invalid-file', 'The shelf file has no list of volumes.', 'volumes');
  if (data.volumes.length > SHELF_FILE_LIMITS.volumes) {
    return fail('too-many-volumes', `A shelf file can hold at most ${SHELF_FILE_LIMITS.volumes} volumes.`, 'volumes');
  }

  const volumes: ShelfFileVolume[] = [];
  const skipped: ShelfFileSkipped[] = [];
  const ids = new Set<string>();
  for (const item of data.volumes as unknown[]) {
    if (!isFields(item)) {
      skipped.push({ title: '', url: '', reason: 'entry is not a volume' });
      continue;
    }
    const urlText = typeof item.url === 'string' ? item.url.trim() : '';
    const read = readVolume(item, urlText);
    if ('reason' in read) {
      const title = typeof item.title === 'string' ? cleanLine(item.title).slice(0, LIMITS.title) : '';
      skipped.push({ title, url: urlText.slice(0, MAX_URL_LENGTH), reason: read.reason });
    } else if (ids.has(read.volume.id)) {
      skipped.push({ title: read.volume.title, url: read.volume.url, reason: 'id is used by an earlier volume' });
    } else {
      ids.add(read.volume.id);
      volumes.push(read.volume);
    }
  }
  return ok({
    file: { format: SHELF_FILE_FORMAT, version: SHELF_FILE_VERSION, shelf: meta.value, volumes },
    skipped,
  });
}

export interface ShelfFileSummary {
  name: string;
  description?: string;
  author?: string;
  due?: string;
  volumes: number;
  required: number;
  /** Total of the lengths that are known. Absent when no volume has one. */
  minutes?: number;
  /** How many volumes the total is based on. */
  minutesKnownFor: number;
  /** Unique source hosts, sorted, without a leading `www.`. */
  hosts: string[];
  firstTitles: string[];
}

/** What a person sees before accepting a shelf that arrived in a file or a link. */
export function summariseShelfFile(file: ShelfFile): ShelfFileSummary {
  const hosts = new Set<string>();
  let required = 0;
  let minutes = 0;
  let known = 0;
  for (const volume of file.volumes) {
    if (volume.required !== false) required += 1;
    const length = minutesOf(volume.text === undefined ? volume : { minutes: volume.minutes, reading: { text: volume.text } });
    if (length !== undefined) {
      minutes += length;
      known += 1;
    }
    try {
      hosts.add(new URL(volume.url).hostname.replace(/^www\./i, '').toLowerCase());
    } catch {
      // An address that does not parse has no host to list.
    }
  }
  const summary: ShelfFileSummary = {
    name: file.shelf.name,
    volumes: file.volumes.length,
    required,
    minutesKnownFor: known,
    hosts: [...hosts].sort(),
    firstTitles: file.volumes.slice(0, 3).map((volume) => volume.title),
  };
  if (file.shelf.description !== undefined) summary.description = file.shelf.description;
  if (file.shelf.author !== undefined) summary.author = file.shelf.author;
  if (file.shelf.due !== undefined) summary.due = file.shelf.due;
  if (known > 0) summary.minutes = minutes;
  return summary;
}

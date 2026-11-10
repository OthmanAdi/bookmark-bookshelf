import type { Bookmark, CoverSpec, Progress, Session, Shelf } from './types';
import { defaultCover, mergeCover } from './cover';
import { defaultSession } from './library';
import { normalizeProgress } from './progress';
import { normalizeUrl } from './url';
import {
  checkOptionalText,
  checkReadingText,
  checkShelfName,
  checkTitle,
  normalizeTags,
} from './validate';

type Fields = Record<string, unknown>;

export function isObject(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && value !== '__proto__';
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isoOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Keeps valid, uniquely named shelves. Order values are only used for sorting. */
export function readShelves(items: unknown[]): Shelf[] {
  const ids = new Set<string>();
  const names = new Set<string>();
  const shelves: Shelf[] = [];
  for (const item of items) {
    if (!isObject(item) || !validId(item.id) || ids.has(item.id)) continue;
    const name = checkShelfName(textOf(item.name));
    if (!name.ok || names.has(name.value.toLowerCase())) continue;
    ids.add(item.id);
    names.add(name.value.toLowerCase());
    shelves.push({ id: item.id, name: name.value, order: finiteOr(item.order, Number.MAX_SAFE_INTEGER) });
  }
  return shelves;
}

function readCover(value: unknown, url: string): CoverSpec {
  const base = defaultCover(url);
  if (!isObject(value)) return base;
  const partial: Partial<CoverSpec> = {};
  if (typeof value.cloth === 'string') partial.cloth = value.cloth;
  if (typeof value.pattern === 'string') partial.pattern = value.pattern;
  if (typeof value.seed === 'number') partial.seed = value.seed;
  return mergeCover(base, partial);
}

export interface BookmarkContext {
  shelfIds: ReadonlySet<string>;
  firstShelfId: string;
  fallbackTime: string;
}

function readReadingText(item: Fields): { text?: string; savedAt: unknown } | 'invalid' {
  if (!isObject(item.reading) || typeof item.reading.text !== 'string') return { savedAt: undefined };
  const text = checkReadingText(item.reading.text);
  if (!text.ok) return 'invalid';
  return text.value === undefined ? { savedAt: undefined } : { text: text.value, savedAt: item.reading.savedAt };
}

/** Returns undefined for anything that is not a usable volume. */
export function readBookmark(item: unknown, context: BookmarkContext): Bookmark | undefined {
  if (!isObject(item) || !validId(item.id) || typeof item.url !== 'string') return undefined;
  const url = normalizeUrl(item.url);
  if (!url.ok) return undefined;
  const title = checkTitle(textOf(item.title), url.value);
  const author = checkOptionalText(textOf(item.author), 'author');
  const note = checkOptionalText(textOf(item.note), 'note');
  const reading = readReadingText(item);
  if (!title.ok || !author.ok || !note.ok || reading === 'invalid') return undefined;

  const addedAt = isoOr(item.addedAt, context.fallbackTime);
  const known = typeof item.shelfId === 'string' && context.shelfIds.has(item.shelfId);
  const bookmark: Bookmark = {
    id: item.id,
    url: url.value,
    title: title.value,
    tags: Array.isArray(item.tags) ? normalizeTags(item.tags as string[]) : [],
    shelfId: known ? (item.shelfId as string) : context.firstShelfId,
    order: finiteOr(item.order, Number.MAX_SAFE_INTEGER),
    addedAt,
    updatedAt: isoOr(item.updatedAt, addedAt),
    cover: readCover(item.cover, url.value),
  };
  if (author.value !== undefined) bookmark.author = author.value;
  if (note.value !== undefined) bookmark.note = note.value;
  if (reading.text !== undefined) {
    bookmark.reading = { format: 'markdown-lite', text: reading.text, savedAt: isoOr(reading.savedAt, addedAt) };
  }
  return bookmark;
}

export function readProgress(
  value: unknown,
  bookmarkIds: ReadonlySet<string>,
  fallbackTime: string,
): Record<string, Progress> {
  const progress: Record<string, Progress> = {};
  if (!isObject(value)) return progress;
  for (const [id, entry] of Object.entries(value)) {
    if (!bookmarkIds.has(id) || !validId(id) || !isObject(entry)) continue;
    progress[id] = normalizeProgress(
      { block: finiteOr(entry.block, 0), ratio: finiteOr(entry.ratio, 0), percent: finiteOr(entry.percent, 0) },
      isoOr(entry.updatedAt, fallbackTime),
    );
  }
  return progress;
}

function knownIdOrNull(value: unknown, known: ReadonlySet<string>): string | null {
  return typeof value === 'string' && known.has(value) ? value : null;
}

export function readSession(value: unknown, shelfIds: ReadonlySet<string>, bookmarkIds: ReadonlySet<string>): Session {
  const session = defaultSession();
  if (!isObject(value)) return session;
  session.shelfId = knownIdOrNull(value.shelfId, shelfIds);
  session.focusId = knownIdOrNull(value.focusId, bookmarkIds);
  session.openId = knownIdOrNull(value.openId, bookmarkIds);
  if (value.view === 'shelf' || value.view === 'list') session.view = value.view;
  if (typeof value.variant === 'string' && value.variant.trim() !== '') session.variant = value.variant.trim();
  return session;
}

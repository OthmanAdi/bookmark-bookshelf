import type { Bookmark, CoverSpec, Progress, Session, Shelf } from './types';
import { defaultCover, mergeCover } from './cover';
import { isValidId } from './ids';
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

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isoOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Maps an id as written in a document to the id it is stored under. */
export type IdMap = ReadonlyMap<string, string>;

function freshId(used: Set<string>, newId: () => string): string {
  let id = newId();
  while (used.has(id)) id = newId();
  used.add(id);
  return id;
}

/**
 * Keeps usable, uniquely named shelves. An id that is missing, malformed or already taken is replaced by a
 * fresh one, and `idMap` says which stored id every id in the document now stands for. A shelf whose name is
 * already taken is dropped and its id points at the shelf that was kept.
 */
export function readShelves(items: unknown[], newId: () => string): { shelves: Shelf[]; idMap: IdMap } {
  const used = new Set<string>();
  const byName = new Map<string, string>();
  const idMap = new Map<string, string>();
  const shelves: Shelf[] = [];
  for (const item of items) {
    if (!isObject(item)) continue;
    const name = checkShelfName(textOf(item.name));
    if (!name.ok) continue;
    const written = typeof item.id === 'string' ? item.id : undefined;
    const folded = name.value.toLowerCase();
    const kept = byName.get(folded);
    if (kept !== undefined) {
      if (written !== undefined && !idMap.has(written)) idMap.set(written, kept);
      continue;
    }
    let id: string;
    if (isValidId(item.id) && !used.has(item.id)) {
      id = item.id;
      used.add(id);
    } else {
      id = freshId(used, newId);
    }
    byName.set(folded, id);
    if (written !== undefined && !idMap.has(written)) idMap.set(written, id);
    shelves.push({ id, name: name.value, order: finiteOr(item.order, Number.MAX_SAFE_INTEGER) });
  }
  return { shelves, idMap };
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
  /** Shelf ids as written in the document, to the ids they are stored under. */
  shelfIds: IdMap;
  firstShelfId: string;
  fallbackTime: string;
  newId: () => string;
  /** Ids already given to volumes in this document. Filled in as volumes are read. */
  usedIds: Set<string>;
}

function readReadingText(item: Fields): { text?: string; savedAt: unknown } | 'invalid' {
  if (!isObject(item.reading) || typeof item.reading.text !== 'string') return { savedAt: undefined };
  const text = checkReadingText(item.reading.text);
  if (!text.ok) return 'invalid';
  return text.value === undefined ? { savedAt: undefined } : { text: text.value, savedAt: item.reading.savedAt };
}

/**
 * Returns undefined for anything that is not a usable volume. `sourceId` is the id the document gave it,
 * which progress and session entries in the same document refer to.
 */
export function readBookmark(
  item: unknown,
  context: BookmarkContext,
): { bookmark: Bookmark; sourceId: string | undefined } | undefined {
  if (!isObject(item) || typeof item.url !== 'string') return undefined;
  const url = normalizeUrl(item.url);
  if (!url.ok) return undefined;
  const title = checkTitle(textOf(item.title), url.value);
  const author = checkOptionalText(textOf(item.author), 'author');
  const note = checkOptionalText(textOf(item.note), 'note');
  const reading = readReadingText(item);
  if (!title.ok || !author.ok || !note.ok || reading === 'invalid') return undefined;

  const addedAt = isoOr(item.addedAt, context.fallbackTime);
  const shelfId = typeof item.shelfId === 'string' ? context.shelfIds.get(item.shelfId) : undefined;
  const id = isValidId(item.id) && !context.usedIds.has(item.id) ? item.id : freshId(context.usedIds, context.newId);
  context.usedIds.add(id);
  const bookmark: Bookmark = {
    id,
    url: url.value,
    title: title.value,
    tags: Array.isArray(item.tags) ? normalizeTags(item.tags as string[]) : [],
    shelfId: shelfId ?? context.firstShelfId,
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
  return { bookmark, sourceId: typeof item.id === 'string' ? item.id : undefined };
}

export function readProgress(value: unknown, bookmarkIds: IdMap, fallbackTime: string): Record<string, Progress> {
  const progress: Record<string, Progress> = {};
  if (!isObject(value)) return progress;
  for (const [written, entry] of Object.entries(value)) {
    const id = bookmarkIds.get(written);
    if (id === undefined || !isObject(entry)) continue;
    progress[id] = normalizeProgress(
      { block: finiteOr(entry.block, 0), ratio: finiteOr(entry.ratio, 0), percent: finiteOr(entry.percent, 0) },
      isoOr(entry.updatedAt, fallbackTime),
    );
  }
  return progress;
}

function knownIdOrNull(value: unknown, known: IdMap): string | null {
  return typeof value === 'string' ? (known.get(value) ?? null) : null;
}

export function readSession(value: unknown, shelfIds: IdMap, bookmarkIds: IdMap): Session {
  const session = defaultSession();
  if (!isObject(value)) return session;
  session.shelfId = knownIdOrNull(value.shelfId, shelfIds);
  session.focusId = knownIdOrNull(value.focusId, bookmarkIds);
  session.openId = knownIdOrNull(value.openId, bookmarkIds);
  if (value.view === 'shelf' || value.view === 'list') session.view = value.view;
  if (typeof value.variant === 'string' && value.variant.trim() !== '') session.variant = value.variant.trim();
  return session;
}

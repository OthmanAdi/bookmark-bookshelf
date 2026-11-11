import { describe, expect, it } from 'vitest';
import { createMemoryStorage, createStore, migrateLibrary } from '../store';
import {
  EXAMPLE_IDS,
  EXAMPLE_SHELF_IDS,
  SAMPLE_TEXT_NOTICE,
  isExampleId,
  isExampleShelfId,
  sampleLibrary,
} from './sample-library';
import { SAMPLE_TEXTS } from './sample-texts';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const CLOTHS = ['ink', 'bone', 'rust', 'moss', 'plum', 'ochre', 'slate', 'teal'];
const PATTERNS = ['arcs', 'bars', 'dots', 'rays', 'tiles', 'waves'];

const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;
const words = (text: string): string[] => text.toLowerCase().match(/[\p{L}\p{N}’']+/gu) ?? [];
/** Covers and spines are dressed by site, so `en.wikipedia.org` and `de.wikipedia.org` count once. */
const siteOf = (url: string): string => new URL(url).hostname.split('.').slice(-2).join('.');

function blockKinds(text: string): string {
  const kinds = [
    /^#{2,3} /m.test(text) ? 'headings' : '',
    /^(- |\d+\. )/m.test(text) ? 'list' : '',
    /^> /m.test(text) ? 'quote' : '',
  ];
  return kinds.filter(Boolean).join('+') || 'paragraphs';
}

describe('sampleLibrary', () => {
  const lib = sampleLibrary(NOW);

  it('is a version 2 library with three shelves and fourteen to sixteen links', () => {
    expect(lib.format).toBe('bookmark-bookshelf');
    expect(lib.version).toBe(2);
    expect(lib.shelves.map((s) => s.order)).toEqual([0, 1, 2]);
    expect(lib.bookmarks.length).toBeGreaterThanOrEqual(14);
    expect(lib.bookmarks.length).toBeLessThanOrEqual(16);
  });

  it('uses unique ids and puts every link on an existing shelf', () => {
    const shelfIds = new Set(lib.shelves.map((s) => s.id));
    expect(shelfIds.size).toBe(lib.shelves.length);
    for (const b of lib.bookmarks) expect(shelfIds.has(b.shelfId)).toBe(true);
    const ids = lib.bookmarks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const shelf of lib.shelves) expect(lib.bookmarks.some((b) => b.shelfId === shelf.id)).toBe(true);
  });

  it('recognises every example link and shelf, and nothing else', () => {
    expect([...EXAMPLE_IDS].sort()).toEqual(lib.bookmarks.map((b) => b.id).sort());
    expect([...EXAMPLE_SHELF_IDS].sort()).toEqual(lib.shelves.map((s) => s.id).sort());
    for (const b of lib.bookmarks) {
      expect(b.id.startsWith('example-')).toBe(true);
      expect(isExampleId(b.id)).toBe(true);
      expect(isExampleShelfId(b.id)).toBe(false);
    }
    for (const s of lib.shelves) {
      expect(s.id.startsWith('example-')).toBe(true);
      expect(isExampleShelfId(s.id)).toBe(true);
      expect(isExampleId(s.id)).toBe(false);
    }
    for (const id of ['', 'example-', 'example-something-else', 'constructor', '3f2b6c1e-0000-4000-8000-000000000000']) {
      expect(isExampleId(id)).toBe(false);
      expect(isExampleShelfId(id)).toBe(false);
    }
  });

  it('has https addresses that parse and are already in canonical form', () => {
    for (const b of lib.bookmarks) {
      const url = new URL(b.url);
      expect(url.protocol).toBe('https:');
      expect(url.href).toBe(b.url);
    }
  });

  it('numbers order 0..n-1 inside each shelf, in the order the links are listed', () => {
    for (const shelf of lib.shelves) {
      const orders = lib.bookmarks.filter((b) => b.shelfId === shelf.id).map((b) => b.order);
      expect(orders).toEqual(orders.map((_, i) => i));
    }
  });

  it('starts with no reading history', () => {
    expect(lib.progress).toEqual({});
    expect(lib.done).toEqual({});
    expect(lib.notes).toEqual({});
  });

  it('opens on the shelf view in the default look, on the first link of the first shelf', () => {
    const first = lib.bookmarks.find((b) => b.shelfId === lib.shelves[0]?.id && b.order === 0);
    expect(lib.session).toEqual({ shelfId: null, focusId: first?.id, openId: null, view: 'shelf', variant: 'paper' });
  });

  it('shows what the shelf fields do on exactly one shelf, with a due date after now', () => {
    const described = lib.shelves.filter((s) => s.description !== undefined);
    expect(described).toHaveLength(1);
    const [shelf] = described;
    expect(shelf?.author).toBeTruthy();
    expect(shelf?.due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Date.parse(`${shelf?.due}T23:59:59Z`)).toBeGreaterThan(NOW.getTime());
    expect(shelf?.lang).toBeUndefined();
    expect((shelf?.description ?? '').length).toBeLessThanOrEqual(500);
    expect((shelf?.author ?? '').length).toBeLessThanOrEqual(80);
  });

  it('marks some links on that shelf optional and gives some a reading time in range', () => {
    const homework = lib.bookmarks.filter((b) => b.shelfId === lib.shelves.find((s) => s.due)?.id);
    const optional = homework.filter((b) => b.required === false);
    expect(optional.length).toBeGreaterThan(0);
    expect(optional.length).toBeLessThan(homework.length);
    for (const b of lib.bookmarks) {
      if (b.required !== undefined) expect(b.required).toBe(false);
      if (b.minutes === undefined) continue;
      expect(Number.isInteger(b.minutes)).toBe(true);
      expect(b.minutes).toBeGreaterThanOrEqual(1);
      expect(b.minutes).toBeLessThanOrEqual(600);
    }
    expect(homework.some((b) => b.minutes !== undefined)).toBe(true);
  });

  it('leaves some links without a note and some without tags, and keeps tags lower case', () => {
    expect(lib.bookmarks.some((b) => b.note === undefined)).toBe(true);
    expect(lib.bookmarks.some((b) => b.tags.length === 0)).toBe(true);
    for (const b of lib.bookmarks) {
      expect(b.tags.length).toBeLessThanOrEqual(3);
      for (const tag of b.tags) expect(tag).toBe(tag.toLowerCase());
    }
  });

  it('takes cloth and pattern from the allowed lists, with no equal neighbours on the whole row', () => {
    for (const b of lib.bookmarks) {
      expect(CLOTHS).toContain(b.cover.cloth);
      expect(PATTERNS).toContain(b.cover.pattern);
      expect(Number.isInteger(b.cover.seed)).toBe(true);
    }
    expect(new Set(lib.bookmarks.map((b) => b.cover.cloth))).toEqual(new Set(CLOTHS));
    lib.bookmarks.forEach((b, i) => {
      const next = lib.bookmarks[i + 1];
      if (next) expect(next.cover.cloth).not.toBe(b.cover.cloth);
    });
  });

  it('gives four links a text of 250 to 1,300 words, and every text belongs to a link', () => {
    const withText = lib.bookmarks.filter((b) => b.reading !== undefined);
    expect(withText).toHaveLength(4);
    for (const b of withText) {
      expect(b.reading?.format).toBe('markdown-lite');
      expect(b.reading?.savedAt).toBe(b.addedAt);
      const words = wordCount(b.reading?.text ?? '');
      expect(words).toBeGreaterThanOrEqual(250);
      expect(words).toBeLessThanOrEqual(1300);
    }
    expect(Object.keys(SAMPLE_TEXTS).sort()).toEqual(withText.map((b) => b.id).sort());
  });

  it('writes texts the reader shows as written: no angle brackets, no links to other pages', () => {
    for (const b of lib.bookmarks) {
      if (!b.reading) continue;
      expect(b.reading.text.includes('<')).toBe(false);
      for (const link of b.reading.text.matchAll(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/g)) expect(link[1]).toBe(b.url);
    }
  });

  it('passes the store’s own reading of a library without a single change', () => {
    const options = { now: () => NOW, idFactory: () => 'fresh-id' };
    for (const input of [structuredClone(lib), JSON.stringify(lib)]) {
      const read = migrateLibrary(input, options);
      expect(read.ok).toBe(true);
      if (read.ok) expect(read.value).toEqual(lib);
    }
  });

  it('seeds a store that hands back the same library', () => {
    const store = createStore({ storage: createMemoryStorage(), seed: () => sampleLibrary(NOW), now: () => NOW, syncTabs: false });
    expect(store.snapshot()).toEqual(lib);
    expect(store.bookmarks().map((b) => b.id)).toEqual(lib.bookmarks.map((b) => b.id));
    store.destroy();
  });

  it('draws its links from at least six sites, and every shelf from more than one', () => {
    expect(new Set(lib.bookmarks.map((b) => siteOf(b.url))).size).toBeGreaterThanOrEqual(6);
    for (const shelf of lib.shelves) {
      const sites = new Set(lib.bookmarks.filter((b) => b.shelfId === shelf.id).map((b) => siteOf(b.url)));
      expect(sites.size).toBeGreaterThan(1);
    }
  });

  it('never lets more than two notes open with the same word', () => {
    const openings = new Map<string, number>();
    for (const b of lib.bookmarks) {
      const first = words(b.note ?? '')[0];
      if (first !== undefined) openings.set(first, (openings.get(first) ?? 0) + 1);
    }
    for (const [word, count] of openings) expect(count, word).toBeLessThanOrEqual(2);
  });

  it('opens every text differently and shapes each one differently', () => {
    const texts = lib.bookmarks.flatMap((b) => (b.reading ? [b.reading.text] : []));
    const openings = texts.map((text) => words(text).slice(0, 8).join(' '));
    expect(new Set(openings).size).toBe(texts.length);
    for (const [i, a] of openings.entries()) {
      for (const b of openings.slice(i + 1)) expect(a.split(' ').slice(0, 3)).not.toEqual(b.split(' ').slice(0, 3));
    }
    expect(new Set(texts.map(blockKinds)).size).toBe(texts.length);
  });

  it('dates every link before now, each at a different time', () => {
    const times = lib.bookmarks.map((b) => Date.parse(b.addedAt));
    for (const t of times) expect(t).toBeLessThan(NOW.getTime());
    expect(new Set(times).size).toBe(times.length);
  });

  it('returns equal but separate objects on every call', () => {
    const a = sampleLibrary(NOW);
    const b = sampleLibrary(NOW);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.bookmarks[0]).not.toBe(b.bookmarks[0]);
    expect(a.bookmarks[0]?.tags).not.toBe(b.bookmarks[0]?.tags);
    a.bookmarks[0]?.tags.push('mutated');
    expect(sampleLibrary(NOW).bookmarks[0]?.tags).not.toContain('mutated');
  });
});

describe('SAMPLE_TEXT_NOTICE', () => {
  it('says the text was written for the app and is not the linked page', () => {
    expect(SAMPLE_TEXT_NOTICE).toBe('Example text written for this app. It is not the linked page.');
  });
});

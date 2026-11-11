// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ShelfFileSource } from './shelf-file';
import { toMarkdownList, toNetscapeBookmarks } from './export-formats';
import { parseLinkList } from './link-list';
import { parseNetscapeBookmarks } from './netscape';
import { readShelfFile, toShelfFile } from './shelf-file';
import { decodeShelfLink, encodeShelfLink } from './shelf-link';

/*
 * Round-trip properties for the formats the app writes and reads. Each case is made from a seed, so a
 * failure names the seed that reproduces it: set RUNS to 1 and BASE_SEED to the printed value.
 */

const RUNS = 300;
const BASE_SEED = 20260611;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Gen {
  readonly next: () => number;

  constructor(readonly seed: number) {
    this.next = mulberry32(seed);
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)] as T;
  }

  /** Words that stress escaping in every format, with single spaces and nothing that reads as a marker. */
  words(min: number, max: number): string {
    return Array.from({ length: this.int(min, max) }, () => this.pick(WORDS)).join(' ');
  }
}

const WORDS = [
  'alpha',
  'Beta',
  'Über',
  'Straße',
  'café',
  '日本語',
  'العربية',
  '🚀',
  'Tom&Jerry',
  '<b>',
  '</a>',
  '"quoted"',
  "it's",
  '[x]',
  '](',
  '(y)',
  '*bold*',
  '_it_',
  '`code`',
  'a|b',
  '#1',
  'C++',
  '50%',
  'back\\slash',
  '~tilde',
  'x+y',
  '{z}',
  '!',
  '-',
  ':',
  '|',
  'dash-',
  'colon:',
  '&amp;',
  '&#39;',
  'under_score',
  'a/b',
  'Q&A?',
  '„Deutsch“',
  '100',
];
const CLOTHS = ['ink', 'bone', 'rust', 'moss', 'plum', 'ochre', 'slate', 'teal'];
const PATTERNS = ['arcs', 'bars', 'dots', 'rays', 'tiles', 'waves'];
const HOSTS = ['example.org', 'www.example.com', 'docs.example.net', 'xn--bcher-kva.example', 'example.co.uk'];
const SEGMENTS = ['a', 'post-1', 'Caf%C3%A9', 'x_y', 'v2.1', 'tilde~', 'one%20two', 'p'];
const QUERIES = ['', '', 'q=1', 'a=1&b=2', 'x=%C3%BC&y=%26', 'id=7&page=2'];
const FRAGMENTS = ['', '', '', 'top', 'section-2'];

function makeUrl(g: Gen, index: number): string {
  const path = Array.from({ length: g.int(0, 3) }, () => g.pick(SEGMENTS)).join('/');
  const query = g.pick(QUERIES);
  const fragment = g.pick(FRAGMENTS);
  const raw = `${g.pick(['https', 'http'])}://${g.pick(HOSTS)}/${path}${path === '' ? '' : '/'}n${index}${query ? `?${query}` : ''}${fragment ? `#${fragment}` : ''}`;
  return new URL(raw).href;
}

function makeText(g: Gen): string {
  return Array.from({ length: g.int(1, 6) }, () => g.words(3, 25)).join('\n\n');
}

interface Made {
  id: string;
  name: string;
  description?: string;
  lang?: string;
  author?: string;
  due?: string;
  volumes: Array<ShelfFileSource & { addedAt: string; shelfId: string }>;
}

function makeShelf(g: Gen, index: number): Made {
  const shelf: Made = { id: `shelf-${g.seed}-${index}`, name: `${g.words(1, 3)} #${index}`, volumes: [] };
  if (g.chance(0.5)) shelf.description = g.words(1, 30);
  if (g.chance(0.5)) shelf.lang = g.pick(['de', 'en-GB', 'ar', 'zh-Hant-TW']);
  if (g.chance(0.4)) shelf.author = g.words(1, 4);
  if (g.chance(0.4)) shelf.due = `20${g.int(26, 29)}-${String(g.int(1, 12)).padStart(2, '0')}-${String(g.int(1, 28)).padStart(2, '0')}`;
  const count = g.int(0, 12);
  for (let i = 0; i < count; i += 1) {
    const volume: Made['volumes'][number] = {
      id: `v-${g.seed}-${index}-${i}`,
      url: makeUrl(g, i),
      title: g.words(1, 8),
      order: i,
      shelfId: shelf.id,
      cover: { cloth: g.pick(CLOTHS), pattern: g.pick(PATTERNS), seed: g.int(0, 2147483647) },
      addedAt: new Date(Date.UTC(g.int(2001, 2026), g.int(0, 11), g.int(1, 28), g.int(0, 23), g.int(0, 59), g.int(0, 59))).toISOString(),
    };
    if (g.chance(0.4)) volume.author = g.words(1, 3);
    if (g.chance(0.4)) volume.note = g.words(1, 12);
    if (g.chance(0.5)) volume.tags = [...new Set(Array.from({ length: g.int(1, 5) }, () => g.pick(WORDS).toLowerCase().slice(0, 40)))].filter((tag) => tag.trim() !== '');
    if (g.chance(0.3)) volume.required = g.chance(0.5);
    if (g.chance(0.4)) volume.minutes = g.int(1, 600);
    if (g.chance(0.3)) volume.reading = { text: makeText(g) };
    shelf.volumes.push(volume);
  }
  return shelf;
}

function makeLibrary(g: Gen): Made[] {
  return Array.from({ length: g.int(1, 3) }, (_value, index) => makeShelf(g, index));
}

/** Runs one property for every seed and names the seed of the first counterexample. */
async function forAllSeeds(property: string, body: (g: Gen) => void | Promise<void>): Promise<void> {
  for (let run = 0; run < RUNS; run += 1) {
    const seed = BASE_SEED + run;
    try {
      await body(new Gen(seed));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`property "${property}" failed for seed ${seed}: ${detail}`);
    }
  }
}

describe('round trips for the new formats', () => {
  it('a shelf file reads back as it was written', async () => {
    await forAllSeeds('shelf file round trip', (g) => {
      const [shelf] = makeLibrary(g) as [Made];
      const file = toShelfFile({ shelf, bookmarks: shelf.volumes, includeTexts: g.chance(0.5), revision: g.int(1, 50) });
      const read = readShelfFile(JSON.stringify(file));
      if (!read.ok) throw new Error(`file was refused: ${read.error.code} ${read.error.message}`);
      expect(read.value.skipped).toEqual([]);
      expect(read.value.file).toEqual(file);
      const pretty = readShelfFile(JSON.stringify(file, null, 2));
      expect(pretty.ok && pretty.value.file).toEqual(file);
    });
  });

  it('a shelf file never carries anything but its listed keys', async () => {
    const allowed = ['id', 'url', 'title', 'author', 'note', 'tags', 'required', 'minutes', 'cover', 'text'];
    await forAllSeeds('shelf file keys', (g) => {
      const [shelf] = makeLibrary(g) as [Made];
      const file = toShelfFile({ shelf, bookmarks: shelf.volumes, includeTexts: true });
      for (const volume of file.volumes) {
        for (const key of Object.keys(volume)) expect(allowed).toContain(key);
      }
      expect(JSON.stringify(file)).not.toContain('addedAt');
    });
  });

  it('a shelf link decodes to the file it was made from', async () => {
    await forAllSeeds('link codec round trip', async (g) => {
      const [shelf] = makeLibrary(g) as [Made];
      const file = toShelfFile({ shelf, bookmarks: shelf.volumes, includeTexts: g.chance(0.5) });
      const link = await encodeShelfLink(file);
      expect(link.fragment).toMatch(/^shelf=1\.d\.[A-Za-z0-9_-]+$/);
      const decoded = await decodeShelfLink(link.fragment);
      if (!decoded.ok) throw new Error(`link was refused: ${decoded.error.code} ${decoded.error.message}`);
      expect(decoded.value.file).toEqual(file);
      expect(decoded.value.skipped).toEqual([]);
    });
  });

  it('a bookmarks file written by the app is read back with the same folders, titles, addresses and dates', async () => {
    await forAllSeeds('netscape export then parse', (g) => {
      const library = makeLibrary(g);
      const html = toNetscapeBookmarks({
        shelves: library.map((shelf, order) => ({ id: shelf.id, name: shelf.name, order })),
        bookmarks: library.flatMap((shelf) => shelf.volumes),
      });
      const parsed = parseNetscapeBookmarks(html);
      expect(parsed.skipped).toEqual([]);
      expect(parsed.folders).toEqual(
        library
          .filter((shelf) => shelf.volumes.length > 0)
          .map((shelf) => ({
            name: shelf.name,
            links: shelf.volumes.map((volume) => ({ url: volume.url, title: volume.title, addedAt: volume.addedAt })),
          })),
      );
    });
  });

  it('a markdown list is read back with the same addresses and titles', async () => {
    await forAllSeeds('list export then parse', (g) => {
      for (const shelf of makeLibrary(g)) {
        const text = toMarkdownList({ shelfName: shelf.name, volumes: shelf.volumes });
        const parsed = parseLinkList(g.chance(0.5) ? text.replace(/\n/g, '\r\n') : text);
        expect(parsed.unreadable).toEqual([]);
        expect(parsed.entries.map((entry) => [entry.url, entry.title])).toEqual(shelf.volumes.map((volume) => [volume.url, volume.title]));
        parsed.entries.forEach((entry, index) => {
          const volume = shelf.volumes[index];
          expect(entry.required).toBe(volume?.required === false ? false : undefined);
          expect(entry.minutes).toBe(volume?.minutes);
        });
      }
    });
  });
});

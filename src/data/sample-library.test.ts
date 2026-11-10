import { describe, expect, it } from 'vitest';
import { SAMPLE_TEXT_NOTICE, sampleLibrary } from './sample-library';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const CLOTHS = ['ink', 'bone', 'rust', 'moss', 'plum', 'ochre', 'slate', 'teal'];
const PATTERNS = ['arcs', 'bars', 'dots', 'rays', 'tiles', 'waves'];

const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;
const blockCount = (text: string): number => text.split(/\n{2,}/).filter((part) => part.trim() !== '').length;

describe('sampleLibrary', () => {
  const lib = sampleLibrary(NOW);

  it('has the expected format, three shelves in order and fourteen bookmarks', () => {
    expect(lib.format).toBe('bookmark-bookshelf');
    expect(lib.version).toBe(1);
    expect(lib.shelves.map((s) => s.name)).toEqual(['Reading list', 'Craft', 'Reference']);
    expect(lib.shelves.map((s) => s.order)).toEqual([0, 1, 2]);
    expect(lib.bookmarks).toHaveLength(14);
  });

  it('uses unique ids and existing shelves', () => {
    const shelfIds = new Set(lib.shelves.map((s) => s.id));
    expect(shelfIds.size).toBe(3);
    for (const b of lib.bookmarks) expect(shelfIds.has(b.shelfId)).toBe(true);
    const ids = lib.bookmarks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has https URLs that parse', () => {
    for (const b of lib.bookmarks) {
      const url = new URL(b.url);
      expect(url.protocol).toBe('https:');
    }
  });

  it('numbers order 0..n-1 inside each shelf', () => {
    for (const shelf of lib.shelves) {
      const orders = lib.bookmarks.filter((b) => b.shelfId === shelf.id).map((b) => b.order);
      expect([...orders].sort((a, b) => a - b)).toEqual(orders.map((_, i) => i));
      expect(orders).toEqual(orders.map((_, i) => i));
    }
  });

  it('keeps titles short and tags lowercase, one to three per bookmark', () => {
    for (const b of lib.bookmarks) {
      expect(b.title.length).toBeLessThanOrEqual(34);
      expect(b.tags.length).toBeGreaterThanOrEqual(1);
      expect(b.tags.length).toBeLessThanOrEqual(3);
      for (const tag of b.tags) expect(tag).toBe(tag.toLowerCase());
      expect(b.note).toBeTruthy();
    }
  });

  it('gives exactly two bookmarks no reading copy', () => {
    const without = lib.bookmarks.filter((b) => b.reading === undefined).map((b) => b.id);
    expect(without).toEqual(['bm-internet-archive', 'bm-wcag']);
    for (const b of lib.bookmarks) {
      if (b.reading) {
        expect(b.reading.format).toBe('markdown-lite');
        expect(b.reading.savedAt).toBe(b.addedAt);
      }
    }
  });

  it('takes cloth and pattern from the allowed lists, with no equal neighbours', () => {
    for (const b of lib.bookmarks) {
      expect(CLOTHS).toContain(b.cover.cloth);
      expect(PATTERNS).toContain(b.cover.pattern);
      expect(Number.isInteger(b.cover.seed)).toBe(true);
      expect(b.cover.seed).toBeGreaterThan(0);
    }
    expect(new Set(lib.bookmarks.map((b) => b.cover.cloth))).toEqual(new Set(CLOTHS));
    for (const shelf of lib.shelves) {
      const row = lib.bookmarks.filter((b) => b.shelfId === shelf.id).sort((a, b) => a.order - b.order);
      row.forEach((b, i) => {
        const next = row[i + 1];
        if (next) expect(next.cover.cloth).not.toBe(b.cover.cloth);
      });
    }
  });

  it('spreads addedAt over the 60 days before now', () => {
    const times = lib.bookmarks.map((b) => Date.parse(b.addedAt));
    for (const t of times) {
      expect(t).toBeLessThan(NOW.getTime());
      expect(t).toBeGreaterThan(NOW.getTime() - 60 * 24 * 3600 * 1000);
    }
    expect(new Set(times).size).toBe(times.length);
  });

  it('contains no angle bracket in any text', () => {
    for (const b of lib.bookmarks) {
      if (b.reading) expect(b.reading.text.includes('<')).toBe(false);
    }
  });

  it('writes markdown-lite with at most one link, pointing at its own bookmark', () => {
    for (const b of lib.bookmarks) {
      if (!b.reading) continue;
      const links = [...b.reading.text.matchAll(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/g)];
      expect(links.length).toBeLessThanOrEqual(1);
      for (const link of links) expect(link[1]).toBe(b.url);
      expect(b.reading.text).toMatch(/^(## |### |- |1\. )/m);
    }
  });

  it('sizes the texts: one long, eleven short', () => {
    const counts = lib.bookmarks.flatMap((b) => (b.reading ? [{ id: b.id, words: wordCount(b.reading.text) }] : []));
    expect(counts).toHaveLength(12);
    const longest = counts.reduce((a, b) => (b.words > a.words ? b : a));
    expect(longest.id).toBe('bm-tsundoku');
    expect(longest.words).toBeGreaterThanOrEqual(900);
    expect(longest.words).toBeLessThanOrEqual(1200);
    const tsundoku = lib.bookmarks.find((b) => b.id === 'bm-tsundoku');
    expect((tsundoku?.reading?.text.match(/^## /gm) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((tsundoku?.reading?.text.match(/^## /gm) ?? []).length).toBeLessThanOrEqual(5);
    for (const c of counts) {
      if (c.id === 'bm-tsundoku') continue;
      expect(c.words).toBeGreaterThanOrEqual(180);
      expect(c.words).toBeLessThanOrEqual(380);
    }
  });

  it('saves exactly two reading positions that fit their texts', () => {
    const entries = Object.entries(lib.progress);
    expect(entries.map(([id]) => id).sort()).toEqual(['bm-pointer-events', 'bm-tsundoku']);
    expect(lib.progress['bm-tsundoku']?.percent).toBe(0.34);
    expect(lib.progress['bm-pointer-events']?.percent).toBe(0.72);
    for (const [id, p] of entries) {
      const bookmark = lib.bookmarks.find((b) => b.id === id);
      expect(bookmark?.reading).toBeDefined();
      const blocks = blockCount(bookmark?.reading?.text ?? '');
      expect(p.block).toBeGreaterThanOrEqual(0);
      expect(p.block).toBeLessThan(blocks);
      expect(p.ratio).toBeGreaterThanOrEqual(0);
      expect(p.ratio).toBeLessThanOrEqual(1);
      expect(Date.parse(p.updatedAt)).toBeLessThan(NOW.getTime());
      expect(Date.parse(p.updatedAt)).toBeGreaterThan(Date.parse(bookmark?.addedAt ?? ''));
    }
  });

  it('starts on the shelf view focused on the Tsundoku volume', () => {
    expect(lib.session).toEqual({
      shelfId: null,
      focusId: 'bm-tsundoku',
      openId: null,
      view: 'shelf',
      variant: 'paper',
    });
    expect(lib.bookmarks.some((b) => b.id === lib.session.focusId)).toBe(true);
  });

  it('returns equal but separate objects on every call', () => {
    const a = sampleLibrary(NOW);
    const b = sampleLibrary(NOW);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.bookmarks).not.toBe(b.bookmarks);
    expect(a.bookmarks[0]).not.toBe(b.bookmarks[0]);
    expect(a.bookmarks[0]?.tags).not.toBe(b.bookmarks[0]?.tags);
    a.bookmarks[0]?.tags.push('mutated');
    expect(sampleLibrary(NOW).bookmarks[0]?.tags).not.toContain('mutated');
  });
});

describe('SAMPLE_TEXT_NOTICE', () => {
  it('is one sentence about original notes', () => {
    expect(SAMPLE_TEXT_NOTICE).toMatch(/original/);
    expect(SAMPLE_TEXT_NOTICE).toMatch(/not excerpts/);
    expect(SAMPLE_TEXT_NOTICE.endsWith('.')).toBe(true);
  });
});

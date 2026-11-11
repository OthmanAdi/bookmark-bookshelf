import { describe, expect, it } from 'vitest';
import type { SortContext, SortMode, SortableVolume } from './sort';
import { SORT_MODES, sortVolumes } from './sort';

function vol(id: string, extra: Partial<SortableVolume> = {}): SortableVolume {
  return { id, url: `https://example.org/${id}`, title: `Title ${id}`, addedAt: '2026-01-01T00:00:00.000Z', ...extra };
}

function context(percent: Record<string, number> = {}, done: string[] = []): SortContext {
  return { percentOf: (id) => percent[id] ?? 0, isDone: (id) => done.includes(id) };
}

const order = (volumes: SortableVolume[], mode: SortMode, ctx: SortContext = context()) =>
  sortVolumes(volumes, mode, ctx).map((item) => item.id);

describe('SORT_MODES', () => {
  it('lists every mode once with a plain label', () => {
    expect(SORT_MODES.map((item) => item.mode)).toEqual([
      'manual',
      'added-new',
      'added-old',
      'title',
      'source',
      'unread-first',
      'shortest',
    ]);
    for (const item of SORT_MODES) {
      expect(item.label.length).toBeGreaterThan(3);
      expect(item.label).not.toMatch(/-/);
    }
  });
});

describe('sortVolumes', () => {
  it('keeps the stored order for manual', () => {
    const volumes = [vol('c'), vol('a'), vol('b')];
    expect(order(volumes, 'manual')).toEqual(['c', 'a', 'b']);
  });

  it('returns a new array and leaves the input alone', () => {
    const volumes = [vol('b', { title: 'B' }), vol('a', { title: 'A' })];
    const sorted = sortVolumes(volumes, 'title', context());
    expect(sorted).not.toBe(volumes);
    expect(volumes.map((item) => item.id)).toEqual(['b', 'a']);
    expect(sortVolumes(volumes, 'manual', context())).not.toBe(volumes);
  });

  it('puts the newest first and the oldest first', () => {
    const volumes = [
      vol('mid', { addedAt: '2026-02-01T00:00:00.000Z' }),
      vol('old', { addedAt: '2025-12-31T23:59:59.000Z' }),
      vol('new', { addedAt: '2026-03-01T00:00:00.000Z' }),
    ];
    expect(order(volumes, 'added-new')).toEqual(['new', 'mid', 'old']);
    expect(order(volumes, 'added-old')).toEqual(['old', 'mid', 'new']);
  });

  it('compares dates as times, not as text', () => {
    const volumes = [vol('a', { addedAt: '2026-01-01T10:00:00+02:00' }), vol('b', { addedAt: '2026-01-01T09:30:00.000Z' })];
    expect(order(volumes, 'added-new')).toEqual(['b', 'a']);
  });

  it('treats an unreadable date as the earliest time', () => {
    const volumes = [vol('ok'), vol('bad', { addedAt: 'yesterday' })];
    expect(order(volumes, 'added-old')).toEqual(['bad', 'ok']);
  });

  it('sorts by title ignoring case and accents, with numbers by value', () => {
    const volumes = [
      vol('1', { title: 'chapter 10' }),
      vol('2', { title: 'Chapter 2' }),
      vol('3', { title: 'Äpfel' }),
      vol('4', { title: 'apfel' }),
      vol('5', { title: 'Zebra' }),
      vol('6', { title: 'Banana' }),
    ];
    const sorted = order(volumes, 'title');
    expect(sorted.indexOf('2')).toBeLessThan(sorted.indexOf('1'));
    expect(sorted.slice(0, 2).sort()).toEqual(['3', '4']);
    expect(sorted.indexOf('6')).toBeGreaterThan(sorted.indexOf('4'));
    expect(sorted[sorted.length - 1]).toBe('5');
  });

  it('sorts by source host without www', () => {
    const volumes = [
      vol('z', { url: 'https://www.zeta.example.org/a' }),
      vol('b', { url: 'https://beta.example.org/b' }),
      vol('a', { url: 'https://www.alpha.example.org/c' }),
      vol('bad', { url: 'not a url' }),
    ];
    expect(order(volumes, 'source')).toEqual(['a', 'b', 'bad', 'z']);
  });

  it('puts unread first, then started, then done', () => {
    const volumes = [vol('done'), vol('started'), vol('fresh'), vol('fresh2'), vol('done-started')];
    const ctx = context({ started: 0.4, 'done-started': 0.9, done: 1 }, ['done', 'done-started']);
    expect(order(volumes, 'unread-first', ctx)).toEqual(['fresh', 'fresh2', 'started', 'done', 'done-started']);
  });

  it('counts a volume marked done as done even with no reading position', () => {
    const volumes = [vol('a'), vol('b')];
    expect(order(volumes, 'unread-first', context({}, ['a']))).toEqual(['b', 'a']);
  });

  it('puts the shortest first and unknown lengths last', () => {
    const volumes = [
      vol('unknown'),
      vol('long', { minutes: 40 }),
      vol('text', { reading: { text: 'word '.repeat(440) } }),
      vol('short', { minutes: 3 }),
      vol('unknown2'),
    ];
    expect(order(volumes, 'shortest')).toEqual(['text', 'short', 'long', 'unknown', 'unknown2']);
  });

  it('prefers a stated length to the estimate', () => {
    const volumes = [vol('a', { minutes: 30, reading: { text: 'one two' } }), vol('b', { minutes: 10, reading: { text: 'word '.repeat(5000) } })];
    expect(order(volumes, 'shortest')).toEqual(['b', 'a']);
  });
});

describe('stability', () => {
  const modes = SORT_MODES.map((item) => item.mode);

  it.each(modes)('keeps equal volumes in their input order for %s', (mode) => {
    const volumes = ['e', 'a', 'd', 'b', 'c'].map((id) => vol(id, { title: 'Same', url: 'https://example.org/same' }));
    expect(order(volumes, mode)).toEqual(['e', 'a', 'd', 'b', 'c']);
  });

  it.each(modes)('is the same when applied twice (%s)', (mode) => {
    const volumes = [
      vol('a', { title: 'b', minutes: 4 }),
      vol('b', { title: 'a', minutes: 4, addedAt: '2026-05-05T00:00:00.000Z' }),
      vol('c', { title: 'b' }),
    ];
    const ctx = context({ b: 0.5 });
    const once = sortVolumes(volumes, mode, ctx);
    expect(sortVolumes(once, mode, ctx).map((item) => item.id)).toEqual(once.map((item) => item.id));
  });

  it('sorts 2,000 volumes quickly in every mode', () => {
    const volumes = Array.from({ length: 2000 }, (_value, i) =>
      vol(`v${i}`, { title: `Title ${(i * 37) % 2000}`, url: `https://site${i % 50}.example.org/${i}`, minutes: (i % 90) + 1 }),
    );
    const start = performance.now();
    for (const mode of modes) sortVolumes(volumes, mode, context({ v5: 0.5 }, ['v7']));
    expect(performance.now() - start).toBeLessThan(500);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultCover, type Bookmark } from '../store';
import { toShelfItem } from './bookshelf';

function link(cover: Partial<Bookmark['cover']> = {}): Bookmark {
  return {
    id: 'b1',
    url: 'https://example.org/essay',
    title: 'An essay',
    tags: [],
    shelfId: 's1',
    order: 0,
    addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    cover: { ...defaultCover('https://example.org/essay'), ...cover },
  };
}

describe('toShelfItem, how handled and how old a volume is', () => {
  afterEach(() => vi.useRealTimers());

  it('leaves a new, unread link untouched', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T09:00:00.000Z'));
    const item = toShelfItem(link(), 0);
    expect(item.handled).toBe(0);
    expect(item.age).toBe(0);
  });

  it('counts reading, finishing and a note as handling', () => {
    const half = toShelfItem(link(), 0.5).handled!;
    const whole = toShelfItem(link(), 1).handled!;
    const done = toShelfItem(link(), 0, { done: true }).handled!;
    expect(half).toBeGreaterThan(0.3);
    expect(whole).toBeGreaterThan(half);
    expect(done).toBeGreaterThanOrEqual(0.85);
    expect(toShelfItem({ ...link(), note: 'For the essay on archives.' }, 0).handled).toBeGreaterThan(0);
    expect(toShelfItem({ ...link(), note: '   ' }, 0).handled).toBe(0);
    expect(toShelfItem({ ...link(), note: 'Read twice.' }, 1, { done: true }).handled).toBe(1);
    for (const percent of [-1, 0, 0.3, 1, 7, Number.NaN]) {
      const handled = toShelfItem(link(), percent).handled!;
      expect(handled).toBeGreaterThanOrEqual(0);
      expect(handled).toBeLessThanOrEqual(1);
    }
  });

  it('counts whole days since the link was saved', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-01T12:00:00.000Z'));
    expect(toShelfItem(link(), 0).age).toBe(365);
    expect(toShelfItem({ ...link(), addedAt: '2027-06-01T00:00:00.000Z' }, 0).age).toBe(0);
    expect(toShelfItem({ ...link(), addedAt: 'not a date' }, 0).age).toBe(0);
    expect(toShelfItem(link(), 0.4)).toEqual(toShelfItem(link(), 0.4));
  });
});

describe('toShelfItem', () => {
  it('hands the binding and stamp of the cover to the shelf', () => {
    const item = toShelfItem(link({ binding: 'leather', stamp: 'gold' }), 0);
    expect(item.binding).toBe('leather');
    expect(item.stamp).toBe('gold');
  });

  it('leaves them out when the cover has none, so the renderer chooses', () => {
    const item = toShelfItem(link(), 0);
    expect(item.binding).toBeUndefined();
    expect(item.stamp).toBeUndefined();
  });

  it('still passes the cloth, pattern and seed', () => {
    const bookmark = link({ cloth: 'teal', pattern: 'dots', seed: 7, binding: 'velvet' });
    expect(toShelfItem(bookmark, 0.5)).toMatchObject({ cloth: 'teal', pattern: 'dots', seed: 7, binding: 'velvet', progress: 0.5 });
  });
});

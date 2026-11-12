import { describe, expect, it } from 'vitest';
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

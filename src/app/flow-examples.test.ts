import { describe, expect, it } from 'vitest';
import { isExampleId } from '../data/sample-library';
import { countExamples, removeExampleLinks } from './flow-examples';
import { makeStore } from './flow-test-helpers';

describe('removing the examples', () => {
  it('counts the example links', () => {
    const store = makeStore();
    expect(countExamples(store)).toBe(store.bookmarks().length);
    expect(countExamples(store)).toBeGreaterThan(5);
  });

  it('removes every example link and the shelves only they used', () => {
    const store = makeStore();
    const result = removeExampleLinks(store);
    expect(result?.links).toBeGreaterThan(5);
    expect(store.bookmarks()).toHaveLength(0);
    expect(store.shelves()).toHaveLength(1);
    expect(store.shelves()[0]?.name).toBe('Reading list');
  });

  it('leaves the links the person added, and the shelf that holds them', () => {
    const store = makeStore();
    const homework = store.shelves().find((shelf) => shelf.name.startsWith('Homework'));
    const added = store.addBookmark({ url: 'https://example.org/mine', title: 'Mine', shelfId: homework?.id });
    if (!added.ok) throw new Error(added.error.message);
    removeExampleLinks(store);
    expect(store.bookmarks().map((bookmark) => bookmark.title)).toEqual(['Mine']);
    expect(store.shelves().some((shelf) => shelf.id === homework?.id)).toBe(true);
    expect(store.bookmarks().every((bookmark) => !isExampleId(bookmark.id))).toBe(true);
  });

  it('does nothing when there are no examples', () => {
    const store = makeStore();
    removeExampleLinks(store);
    expect(removeExampleLinks(store)).toBeNull();
  });

  it('puts everything back in order with one undo', () => {
    const store = makeStore();
    const before = store.snapshot();
    const first = before.bookmarks[0];
    if (!first) throw new Error('no example links');
    store.setProgress(first.id, { block: 1, ratio: 0.5, percent: 0.4 });
    store.setDone(first.id, true);
    const withMarks = store.snapshot();
    const result = removeExampleLinks(store);
    result?.undo();
    const after = store.snapshot();
    expect(after.shelves.map((shelf) => shelf.name).sort()).toEqual(withMarks.shelves.map((shelf) => shelf.name).sort());
    for (const shelf of withMarks.shelves) {
      const ids = (lib: typeof after) => lib.bookmarks.filter((bookmark) => bookmark.shelfId === shelf.id).sort((a, b) => a.order - b.order).map((bookmark) => bookmark.id);
      expect(ids(after)).toEqual(ids(withMarks));
    }
    expect(store.progress(first.id)?.percent).toBe(0.4);
    expect(store.isDone(first.id)).toBe(true);
  });
});

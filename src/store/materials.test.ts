import { describe, expect, it } from 'vitest';
import { createStore, DEFAULT_STORAGE_KEY, defaultCover, migrateLibrary } from './index';
import type { LibraryV1, Store } from './index';
import { counterIds, makeRig, testClock } from './test-helpers';

/** A binding and a stamp are kept on the cover wherever the cover goes inside the library. */

function addBound(store: Store, url = 'https://example.org/essay'): string {
  const result = store.addBookmark({ url, cover: { binding: 'leather', stamp: 'gold' } });
  if (!result.ok) throw new Error(result.error.code);
  return result.value.id;
}

describe('binding and stamp in the library', () => {
  it('stores them when a link is added', () => {
    const { store } = makeRig();
    const id = addBound(store);
    expect(store.get(id)?.cover).toEqual({ ...defaultCover('https://example.org/essay'), binding: 'leather', stamp: 'gold' });
  });

  it('changes one without touching the other, and an empty text removes it', () => {
    const { store } = makeRig();
    const id = addBound(store);
    store.updateBookmark(id, { cover: { binding: 'velvet' } });
    expect(store.get(id)?.cover).toMatchObject({ binding: 'velvet', stamp: 'gold' });
    store.updateBookmark(id, { cover: { stamp: '' } });
    expect(store.get(id)?.cover).not.toHaveProperty('stamp');
    expect(store.get(id)?.cover.binding).toBe('velvet');
  });

  it('keeps them through a reload from storage', () => {
    const { store, storage } = makeRig();
    const id = addBound(store);
    const again = createStore({ storage, syncTabs: false });
    expect(again.get(id)?.cover).toMatchObject({ binding: 'leather', stamp: 'gold' });
  });

  it('drops an unusable name on load and keeps the rest of the cover', () => {
    const { store, storage } = makeRig();
    const id = addBound(store);
    const doc = JSON.parse(storage.getItem(DEFAULT_STORAGE_KEY) ?? '{}') as { bookmarks: Array<{ cover: Record<string, unknown> }> };
    const cover = doc.bookmarks[0]!.cover;
    cover.binding = '"><img src=x>';
    cover.stamp = 42;
    storage.setItem(DEFAULT_STORAGE_KEY, JSON.stringify(doc));
    const loaded = createStore({ storage, syncTabs: false }).get(id)?.cover;
    expect(loaded).toEqual(defaultCover('https://example.org/essay'));
  });

  it('loads a library without them unchanged', () => {
    const { store, storage } = makeRig();
    const result = store.addBookmark({ url: 'https://example.org/plain', cover: { cloth: 'teal' } });
    if (!result.ok) throw new Error(result.error.code);
    const before = storage.getItem(DEFAULT_STORAGE_KEY);
    const again = createStore({ storage, syncTabs: false });
    expect(again.get(result.value.id)).toEqual(result.value);
    expect(again.get(result.value.id)?.cover).not.toHaveProperty('binding');
    expect(storage.getItem(DEFAULT_STORAGE_KEY)).toBe(before);
  });

  it('brings them back with an undone removal', () => {
    const { store } = makeRig();
    const id = addBound(store);
    const removed = store.removeBookmark(id);
    if (!removed) throw new Error('not removed');
    store.restoreBookmark(removed);
    expect(store.get(id)?.cover).toMatchObject({ binding: 'leather', stamp: 'gold' });
    const [entry] = store.removeBookmarks([id]);
    store.restoreBookmarks(JSON.parse(JSON.stringify([entry])));
    expect(store.get(id)?.cover).toMatchObject({ binding: 'leather', stamp: 'gold' });
  });

  it('keeps them through the library file, exported and brought back', () => {
    const { store } = makeRig();
    const id = addBound(store);
    const other = makeRig().store;
    expect(other.importLibrary(store.exportLibrary(), 'replace').ok).toBe(true);
    expect(other.get(id)?.cover).toMatchObject({ binding: 'leather', stamp: 'gold' });
  });

  it('keeps them when a library is merged into another', () => {
    const { store } = makeRig();
    addBound(store);
    const other = makeRig({ idFactory: counterIds('other') }).store;
    expect(other.importLibrary(store.exportLibrary(), 'merge').ok).toBe(true);
    const merged = other.bookmarks().find((link) => link.url === 'https://example.org/essay');
    expect(merged?.cover).toMatchObject({ binding: 'leather', stamp: 'gold' });
  });
});

describe('binding and stamp in a version 1 library', () => {
  function v1(cover: Record<string, unknown>): LibraryV1 {
    return {
      format: 'bookmark-bookshelf',
      version: 1,
      shelves: [{ id: 's1', name: 'First', order: 0 }],
      bookmarks: [
        {
          id: 'b1',
          url: 'https://example.com/',
          title: 'Example',
          tags: [],
          shelfId: 's1',
          order: 0,
          addedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          cover: cover as unknown as LibraryV1['bookmarks'][number]['cover'],
        },
      ],
      progress: {},
      session: { shelfId: null, focusId: null, openId: null, view: 'shelf', variant: 'default' },
    };
  }
  const options = () => ({ now: testClock().now, idFactory: counterIds('m') });

  it('carries them over to version 2', () => {
    const result = migrateLibrary(v1({ cloth: 'ink', pattern: 'arcs', seed: 5, binding: 'linen', stamp: 'blind' }), options());
    expect(result.ok && result.value.bookmarks[0]?.cover).toEqual({ cloth: 'ink', pattern: 'arcs', seed: 5, binding: 'linen', stamp: 'blind' });
  });

  it('adds nothing to a cover that had neither', () => {
    const result = migrateLibrary(v1({ cloth: 'ink', pattern: 'arcs', seed: 5 }), options());
    expect(result.ok && result.value.bookmarks[0]?.cover).toEqual({ cloth: 'ink', pattern: 'arcs', seed: 5 });
  });
});

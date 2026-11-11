import { describe, expect, it } from 'vitest';
import { DEFAULT_STORAGE_KEY, createMemoryStorage, createStore } from './index';
import type { KeyValueStorage } from './index';
import { addAll, counterIds, makeRig, testClock } from './test-helpers';

const SESSION_KEY = `${DEFAULT_STORAGE_KEY}:session`;

/** Counts what is written to each key. */
function countingStorage() {
  const inner = createMemoryStorage();
  const writes: Record<string, number> = {};
  const storage: KeyValueStorage & { inner: typeof inner } = {
    inner,
    getItem: (key) => inner.getItem(key),
    setItem: (key, value) => {
      writes[key] = (writes[key] ?? 0) + 1;
      inner.setItem(key, value);
    },
    removeItem: (key) => inner.removeItem(key),
  };
  return { storage, writes };
}

describe('the session key', () => {
  it('holds the session, and the library key holds none', () => {
    const { store, storage } = makeRig();
    const [a = ''] = addAll(store, ['a.example.org']);
    store.setSession({ focusId: a, view: 'list', variant: 'night' });
    expect(JSON.parse(storage.getItem(SESSION_KEY) ?? '{}')).toMatchObject({ focusId: a, view: 'list', variant: 'night' });
    expect(JSON.parse(storage.getItem(DEFAULT_STORAGE_KEY) ?? '{}')).not.toHaveProperty('session');
  });

  it('is the only thing written when the person moves to another link', () => {
    const { storage, writes } = countingStorage();
    const store = createStore({ storage, now: testClock().now, idFactory: counterIds(), syncTabs: false });
    const [a = '', b = ''] = addAll(store, ['a.example.org', 'b.example.org']);
    const libraryWrites = writes[DEFAULT_STORAGE_KEY];

    store.setSession({ focusId: a });
    store.setSession({ focusId: b });
    store.setSession({ view: 'list' });
    expect(writes[DEFAULT_STORAGE_KEY]).toBe(libraryWrites);
    expect(writes[SESSION_KEY]).toBeGreaterThanOrEqual(3);
  });

  it('is not written again when nothing in it changed', () => {
    const { storage, writes } = countingStorage();
    const store = createStore({ storage, now: testClock().now, idFactory: counterIds(), syncTabs: false });
    const [a = ''] = addAll(store, ['a.example.org']);
    store.setSession({ focusId: a });
    const before = writes[SESSION_KEY];
    store.addShelf('Another');
    store.setSession({ focusId: a });
    expect(writes[SESSION_KEY]).toBe(before);
  });

  it('comes back with the library in a new store', () => {
    const { store, storage } = makeRig();
    const [a = ''] = addAll(store, ['a.example.org']);
    store.setSession({ focusId: a, openId: a, view: 'list', variant: 'oak', textScale: 3, sort: 'title' });
    const again = createStore({ storage, syncTabs: false });
    expect(again.session()).toEqual(store.session());
    expect(again.snapshot()).toEqual(store.snapshot());
  });

  it('is written together with the library when removing a link clears the focus', () => {
    const { store, storage } = makeRig();
    const [a = ''] = addAll(store, ['a.example.org']);
    store.setSession({ focusId: a });
    store.removeBookmark(a);
    expect(JSON.parse(storage.getItem(SESSION_KEY) ?? '{}')).toMatchObject({ focusId: null });
    expect(createStore({ storage, syncTabs: false }).session().focusId).toBeNull();
  });

  it('ignores ids the library does not have and text that is not JSON', () => {
    const { store, storage } = makeRig();
    addAll(store, ['a.example.org']);
    storage.setItem(SESSION_KEY, JSON.stringify({ focusId: 'gone', shelfId: 'gone', view: 'list' }));
    expect(createStore({ storage, syncTabs: false }).session()).toMatchObject({ focusId: null, shelfId: null, view: 'list' });
    storage.setItem(SESSION_KEY, '{oops');
    expect(createStore({ storage, syncTabs: false }).session().view).toBe('shelf');
  });

  it('goes out with a pending reading position instead of dropping it', () => {
    const { store, storage } = makeRig({ progressDelay: 60_000 });
    const [a = ''] = addAll(store, ['a.example.org']);
    store.setProgress(a, { block: 5, ratio: 0.5, percent: 0.5 });
    store.setSession({ focusId: a });
    expect(createStore({ storage, syncTabs: false }).progress(a)).toMatchObject({ block: 5 });
  });
});

describe('a library saved in a single key', () => {
  function singleKeyDocument(): string {
    return JSON.stringify({
      format: 'bookmark-bookshelf',
      version: 1,
      shelves: [{ id: 's1', name: 'Reading list', order: 0 }],
      bookmarks: [
        {
          id: 'b1',
          url: 'https://example.org/one',
          title: 'One',
          tags: [],
          shelfId: 's1',
          order: 0,
          addedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          cover: { cloth: 'ink', pattern: 'arcs', seed: 1 },
        },
      ],
      progress: {},
      session: { shelfId: 's1', focusId: 'b1', openId: null, view: 'list', variant: 'oak' },
    });
  }

  it('keeps its session when it is opened', () => {
    const storage = createMemoryStorage({ [DEFAULT_STORAGE_KEY]: singleKeyDocument() });
    const store = createStore({ storage, syncTabs: false });
    expect(store.session()).toMatchObject({ shelfId: 's1', focusId: 'b1', view: 'list', variant: 'oak' });
    expect(storage.getItem(SESSION_KEY)).toBeNull();
  });

  it('moves to the two-key layout on the first write and keeps everything', () => {
    const storage = createMemoryStorage({ [DEFAULT_STORAGE_KEY]: singleKeyDocument() });
    const store = createStore({ storage, now: testClock().now, idFactory: counterIds('n'), syncTabs: false });
    store.addShelf('Second');

    const stored = JSON.parse(storage.getItem(DEFAULT_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    expect(stored).not.toHaveProperty('session');
    expect(stored.version).toBe(2);
    expect(JSON.parse(storage.getItem(SESSION_KEY) ?? '{}')).toMatchObject({ focusId: 'b1', view: 'list', variant: 'oak' });

    const again = createStore({ storage, syncTabs: false });
    expect(again.snapshot()).toEqual(store.snapshot());
  });

  it('moves to the two-key layout even when the first write is a session change', () => {
    const storage = createMemoryStorage({ [DEFAULT_STORAGE_KEY]: singleKeyDocument() });
    const store = createStore({ storage, syncTabs: false });
    store.setSession({ view: 'shelf' });
    expect(JSON.parse(storage.getItem(SESSION_KEY) ?? '{}')).toMatchObject({ focusId: 'b1', view: 'shelf' });
    expect(createStore({ storage, syncTabs: false }).session()).toMatchObject({ focusId: 'b1', view: 'shelf' });
  });
});

describe('usage', () => {
  it('counts the library and session keys at two bytes a character', () => {
    const { store, storage } = makeRig();
    addAll(store, ['a.example.org', 'b.example.org']);
    store.setSession({ view: 'list' });
    const characters =
      (storage.getItem(DEFAULT_STORAGE_KEY)?.length ?? 0) + (storage.getItem(SESSION_KEY)?.length ?? 0);
    expect(store.usage().bytes).toBe(characters * 2);
    expect(store.usage().quotaHint).toBeGreaterThan(store.usage().bytes);
  });

  it('grows with the saved text', () => {
    const { store } = makeRig();
    const [a = ''] = addAll(store, ['a.example.org']);
    const before = store.usage().bytes;
    store.updateBookmark(a, { readingText: 'word '.repeat(2000) });
    expect(store.usage().bytes).toBeGreaterThan(before + 10000);
  });

  it('is small for a store that has written nothing', () => {
    expect(createStore({ storage: createMemoryStorage(), syncTabs: false }).usage().bytes).toBe(0);
  });
});

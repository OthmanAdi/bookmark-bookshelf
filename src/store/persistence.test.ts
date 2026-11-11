import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage, createStore, DEFAULT_STORAGE_KEY } from './index';
import type { KeyValueStorage, StoreEvent } from './index';
import { addAll, counterIds, makeRig, testClock } from './test-helpers';

function quotaStorage(inner: KeyValueStorage): KeyValueStorage & { full: boolean } {
  const wrapper = {
    full: false,
    getItem: (key: string) => inner.getItem(key),
    setItem: (key: string, value: string) => {
      if (wrapper.full) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      inner.setItem(key, value);
    },
    removeItem: (key: string) => inner.removeItem(key),
  };
  return wrapper;
}

describe('persistence', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('round trips through storage into a second store', () => {
    const { store, storage } = makeRig();
    const shelf = store.addShelf('Essays');
    if (!shelf.ok) throw new Error('shelf');
    const [id = ''] = addAll(store, ['a.com', 'b.com'], shelf.value.id);
    store.updateBookmark(id, { title: 'Alpha', tags: ['x'], note: 'n', readingText: 'body' });
    store.setProgress(id, { block: 3, ratio: 0.5, percent: 0.4 });
    store.setSession({ shelfId: shelf.value.id, focusId: id, openId: id, view: 'list', variant: 'night' });
    store.flush();

    const second = createStore({ storage, syncTabs: false });
    expect(second.snapshot()).toEqual(store.snapshot());
    expect(second.persistence).toBe('local');
  });

  it('starts from the seed when nothing is stored, and uses a custom key', () => {
    const storage = createMemoryStorage();
    const store = createStore({ storage, key: 'custom', syncTabs: false });
    store.addShelf('Extra');
    expect(storage.getItem('custom')).not.toBeNull();
    expect(storage.getItem(DEFAULT_STORAGE_KEY)).toBeNull();
    expect(store.shelves().map((s) => s.name)).toEqual(['Reading list', 'Extra']);
  });

  it('uses a custom seed', () => {
    const base = makeRig().store.snapshot();
    const seeded = { ...base, shelves: [{ id: 's', name: 'Seeded', order: 0 }] };
    const store = createStore({ storage: createMemoryStorage(), seed: () => seeded, syncTabs: false });
    expect(store.shelves()).toEqual([{ id: 's', name: 'Seeded', order: 0 }]);
  });

  it('backs up unreadable text under a timestamped key before starting fresh', () => {
    const clock = testClock();
    const garbage = '{not json at all';
    const storage = createMemoryStorage({ [DEFAULT_STORAGE_KEY]: garbage });
    const store = createStore({ storage, now: clock.now, syncTabs: false });
    expect(storage.getItem(`${DEFAULT_STORAGE_KEY}:backup-${clock.now().getTime()}`)).toBe(garbage);
    expect(store.bookmarks()).toEqual([]);
    expect(store.shelves()).toHaveLength(1);
  });

  it('backs up a library from a newer version as well', () => {
    const newer = JSON.stringify({ format: 'bookmark-bookshelf', version: 3, shelves: [], bookmarks: [] });
    const storage = createMemoryStorage({ [DEFAULT_STORAGE_KEY]: newer });
    createStore({ storage, now: testClock().now, syncTabs: false });
    const backups = backupKeys(storage, [DEFAULT_STORAGE_KEY]);
    expect(backups).toHaveLength(1);
  });

  it('does not create a backup for a readable library', () => {
    const { store, storage } = makeRig();
    store.addShelf('X');
    createStore({ storage, syncTabs: false });
    expect(backupKeys(storage, [DEFAULT_STORAGE_KEY])).toEqual([]);
  });

  it('a quota failure does not throw, undoes the change, and reports quota from Result methods', () => {
    const storage = quotaStorage(createMemoryStorage());
    const { store } = makeRig({ storage });
    const [id = ''] = addAll(store, ['a.com']);
    storage.full = true;

    const added = store.addBookmark({ url: 'b.com' });
    expect(added).toMatchObject({ ok: false, error: { code: 'quota' } });
    expect(store.bookmarks()).toHaveLength(1);

    expect(store.addShelf('More')).toMatchObject({ ok: false, error: { code: 'quota' } });
    expect(store.shelves()).toHaveLength(1);
    expect(() => store.setSession({ focusId: id })).not.toThrow();
    expect(store.removeBookmark(id)).toBeUndefined();
    expect(store.bookmarks()).toHaveLength(1);
    expect(() => store.flush()).not.toThrow();

    storage.full = false;
    expect(store.addBookmark({ url: 'c.com' }).ok).toBe(true);
    const reloaded = createStore({ storage, syncTabs: false });
    expect(reloaded.bookmarks().map((b) => b.url)).toEqual(['https://a.com/', 'https://c.com/']);
  });

  it('a quota failure on a coalesced progress write does not throw', () => {
    vi.useFakeTimers();
    try {
      const storage = quotaStorage(createMemoryStorage());
      const { store } = makeRig({ storage });
      const [id = ''] = addAll(store, ['a.com']);
      storage.full = true;
      store.setProgress(id, { block: 1, ratio: 0, percent: 0 });
      expect(() => vi.advanceTimersByTime(300)).not.toThrow();
      expect(store.progress(id)?.block).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses localStorage by default when it works', () => {
    const store = createStore({ syncTabs: false, key: 'test:default-storage' });
    expect(store.persistence).toBe('local');
    store.addShelf('Local');
    expect(globalThis.localStorage.getItem('test:default-storage')).toContain('Local');
    globalThis.localStorage.removeItem('test:default-storage');
  });

  it('falls back to memory when localStorage fails the probe', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    const store = createStore({ syncTabs: false, key: 'test:blocked' });
    expect(store.persistence).toBe('memory');
    expect(store.addShelf('Still works').ok).toBe(true);
  });
});

/** Memory storage has no key listing, so look for the one timestamp the test clock produces. */
function backupKeys(storage: KeyValueStorage, keys: string[]): string[] {
  const stamp = testClock().now().getTime();
  return keys.map((key) => `${key}:backup-${stamp}`).filter((key) => storage.getItem(key) !== null);
}

describe('subscribers', () => {
  it('notify with the reason and stop after unsubscribe', () => {
    const { store } = makeRig();
    const events: StoreEvent[] = [];
    const stop = store.subscribe((event) => events.push(event));
    const [id = ''] = addAll(store, ['a.com']);
    store.addShelf('S');
    store.setSession({ focusId: id });
    store.setProgress(id, { block: 1, ratio: 0, percent: 0 });
    store.destroy();
    expect(events.map((e) => e.reason)).toEqual(['bookmarks', 'shelves', 'session', 'progress']);
    expect(events.every((e) => e.type === 'change')).toBe(true);

    const second = makeRig();
    const seen: string[] = [];
    const unsubscribe = second.store.subscribe((event) => seen.push(event.reason));
    second.store.addShelf('One');
    unsubscribe();
    second.store.addShelf('Two');
    expect(seen).toEqual(['shelves']);
    stop();
  });

  it('does not notify when a change did not happen', () => {
    const { store } = makeRig();
    const seen: string[] = [];
    store.subscribe((event) => seen.push(event.reason));
    store.addBookmark({ url: 'javascript:1' });
    store.addShelf('');
    store.setSession({ view: 'shelf' });
    store.removeBookmark('missing');
    expect(seen).toEqual([]);
  });

  it('a throwing listener does not stop the others', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { store } = makeRig();
    const seen: string[] = [];
    store.subscribe(() => {
      throw new Error('boom');
    });
    store.subscribe((event) => seen.push(event.reason));
    store.addShelf('X');
    expect(seen).toEqual(['shelves']);
  });

  it('does not notify when the write failed, because nothing changed', () => {
    const storage = quotaStorage(createMemoryStorage());
    const { store } = makeRig({ storage });
    storage.full = true;
    const seen: string[] = [];
    store.subscribe((event) => seen.push(event.reason));
    store.addShelf('X');
    expect(seen).toEqual([]);
  });
});

describe('snapshot isolation', () => {
  it('copies returned by snapshot, bookmarks, shelves, get and session cannot change the store', () => {
    const { store } = makeRig();
    const [id = ''] = addAll(store, ['a.com']);
    store.setProgress(id, { block: 1, ratio: 0, percent: 0 });

    const snapshot = store.snapshot();
    snapshot.bookmarks[0]!.title = 'hacked';
    snapshot.shelves.length = 0;
    snapshot.session.view = 'list';
    delete snapshot.progress[id];

    const list = store.bookmarks();
    list[0]!.tags.push('hacked');
    list.length = 0;
    store.shelves()[0]!.name = 'hacked';
    const one = store.get(id);
    if (one) one.title = 'hacked';
    store.session().variant = 'hacked';
    const progress = store.progress(id);
    if (progress) progress.block = 99;

    expect(store.get(id)?.title).toBe('a.com');
    expect(store.get(id)?.tags).toEqual([]);
    expect(store.shelves()[0]?.name).toBe('Reading list');
    expect(store.session()).toMatchObject({ view: 'shelf', variant: 'default' });
    expect(store.progress(id)?.block).toBe(1);
    expect(store.bookmarks()).toHaveLength(1);
  });

  it('returned results and removal entries are copies too', () => {
    const { store } = makeRig();
    const added = store.addBookmark({ url: 'a.com', tags: ['t'] });
    if (!added.ok) throw new Error('add');
    added.value.tags.push('hacked');
    added.value.title = 'hacked';
    expect(store.get(added.value.id)).toMatchObject({ title: 'a.com', tags: ['t'] });
    const entry = store.removeBookmark(added.value.id);
    if (entry) entry.bookmark.title = 'hacked';
    expect(store.bookmarks()).toEqual([]);
  });
});

describe('cross-tab sync', () => {
  function fire(key: string | null): void {
    window.dispatchEvent(new StorageEvent('storage', { key }));
  }

  it('reloads on a storage event for its key and emits an external change', () => {
    const storage = createMemoryStorage();
    const one = createStore({ storage, now: testClock().now, idFactory: counterIds('a'), syncTabs: true });
    const other = createStore({ storage, now: testClock().now, idFactory: counterIds('b'), syncTabs: false });
    const events: StoreEvent[] = [];
    one.subscribe((event) => events.push(event));

    other.addBookmark({ url: 'from-other-tab.com' });
    expect(one.bookmarks()).toHaveLength(0);
    fire(DEFAULT_STORAGE_KEY);
    expect(one.bookmarks().map((b) => b.url)).toEqual(['https://from-other-tab.com/']);
    expect(events).toEqual([{ type: 'change', reason: 'external' }]);
    one.destroy();
  });

  it('ignores events for other keys', () => {
    const storage = createMemoryStorage();
    const one = createStore({ storage, syncTabs: true });
    const events: StoreEvent[] = [];
    one.subscribe((event) => events.push(event));
    fire('something-else');
    expect(events).toEqual([]);
    one.destroy();
  });

  it('stops listening after destroy and when syncTabs is off', () => {
    const storage = createMemoryStorage();
    const destroyed = createStore({ storage, syncTabs: true });
    const off = createStore({ storage, syncTabs: false });
    const events: StoreEvent[] = [];
    destroyed.subscribe((event) => events.push(event));
    off.subscribe((event) => events.push(event));
    destroyed.destroy();
    const writer = createStore({ storage, syncTabs: false });
    writer.addShelf('Changed');
    fire(DEFAULT_STORAGE_KEY);
    expect(events).toEqual([]);
    expect(off.shelves()).toHaveLength(1);
  });
});

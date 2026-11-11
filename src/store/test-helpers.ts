import { createMemoryStorage, createStore } from './index';
import type { MemoryStorage, Store, StoreOptions } from './index';

export function counterIds(prefix = 'id'): () => string {
  let count = 0;
  return () => {
    count += 1;
    return `${prefix}-${count}`;
  };
}

export interface TestClock {
  now: () => Date;
  advance: (ms: number) => void;
}

export function testClock(start = '2026-01-01T00:00:00.000Z'): TestClock {
  let time = Date.parse(start);
  return {
    now: () => new Date(time),
    advance: (ms) => {
      time += ms;
    },
  };
}

export interface TestRig {
  store: Store;
  /** Memory storage unless a test brought its own; tests that bring a wrapper do not list keys. */
  storage: MemoryStorage;
  clock: TestClock;
}

export function makeRig(extra: StoreOptions = {}): TestRig {
  const storage = (extra.storage ?? createMemoryStorage()) as MemoryStorage;
  const clock = testClock();
  const store = createStore({
    storage,
    now: clock.now,
    idFactory: counterIds(),
    syncTabs: false,
    ...extra,
  });
  return { store, storage, clock };
}

export function firstShelfId(store: Store): string {
  const shelf = store.shelves()[0];
  if (!shelf) throw new Error('store has no shelf');
  return shelf.id;
}

/** Adds volumes by URL and returns their ids, failing loudly if one is rejected. */
export function addAll(store: Store, urls: string[], shelfId?: string): string[] {
  return urls.map((url) => {
    const result = store.addBookmark(shelfId === undefined ? { url } : { url, shelfId });
    if (!result.ok) throw new Error(`could not add ${url}: ${result.error.code}`);
    return result.value.id;
  });
}

export function titles(store: Store, shelfId?: string | null): string[] {
  return store.bookmarks(shelfId).map((bookmark) => bookmark.title);
}

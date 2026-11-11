import { describe, expect, it } from 'vitest';
import { createMemoryStorage, createStore } from './index';
import type { KeyValueStorage } from './index';
import { addAll, makeRig } from './test-helpers';

function limitedStorage(inner: KeyValueStorage): KeyValueStorage & { full: boolean } {
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

function rig() {
  const storage = limitedStorage(createMemoryStorage());
  const made = makeRig({ storage });
  const [a = '', b = ''] = addAll(made.store, ['a.example.org', 'b.example.org']);
  made.store.setProgress(a, { block: 2, ratio: 0.5, percent: 0.3 });
  made.store.setNote(a, 'first note');
  made.store.flush();
  return { ...made, storage, a, b };
}

describe('a write that storage refuses', () => {
  it('leaves the library exactly as it was', () => {
    const { store, storage, a } = rig();
    const before = store.snapshot();
    storage.full = true;

    expect(store.addBookmark({ url: 'c.example.org' })).toMatchObject({ ok: false, error: { code: 'quota' } });
    expect(store.updateBookmark(a, { title: 'Changed' }).ok).toBe(false);
    expect(store.moveBookmark(a, { index: 1 }).ok).toBe(false);
    expect(store.addShelf('Extra').ok).toBe(false);
    expect(store.renameShelf(store.shelves()[0]!.id, 'Renamed').ok).toBe(false);
    expect(store.updateShelf(store.shelves()[0]!.id, { author: 'Someone' }).ok).toBe(false);
    expect(store.setDone(a, true).ok).toBe(false);
    expect(store.setNote(a, 'second note').ok).toBe(false);
    expect(store.removeBookmark(a)).toBeUndefined();
    expect(store.removeShelf(store.shelves()[0]!.id).ok).toBe(false);
    expect(store.importLibrary([{ url: 'd.example.org' }], 'merge').ok).toBe(false);
    expect(store.importLibrary([{ url: 'd.example.org' }], 'replace').ok).toBe(false);

    expect(store.snapshot()).toEqual(before);
  });

  it('does not announce anything', () => {
    const { store, storage, a } = rig();
    storage.full = true;
    const seen: string[] = [];
    store.subscribe((event) => seen.push(event.reason));
    store.updateBookmark(a, { title: 'Changed' });
    store.setDone(a, true);
    expect(seen).toEqual([]);
  });

  it('cannot add the same link twice when the person tries again', () => {
    const { store, storage } = rig();
    storage.full = true;
    expect(store.addBookmark({ url: 'c.example.org' }).ok).toBe(false);
    expect(store.addBookmark({ url: 'c.example.org' }).ok).toBe(false);
    storage.full = false;
    expect(store.addBookmark({ url: 'c.example.org' }).ok).toBe(true);
    expect(store.bookmarks().filter((link) => link.url === 'https://c.example.org/')).toHaveLength(1);
    expect(createStore({ storage, syncTabs: false }).bookmarks()).toHaveLength(3);
  });

  it('returns a result the caller can read, with a plain message', () => {
    const { store, storage } = rig();
    storage.full = true;
    const result = store.addBookmark({ url: 'c.example.org' });
    if (result.ok) throw new Error('expected a failure');
    expect(result.error.code).toBe('quota');
    expect(result.error.message).toMatch(/would not save/);
  });

  it('restores the reading position and personal state it touched', () => {
    const { store, storage, a } = rig();
    storage.full = true;
    store.removeBookmark(a);
    expect(store.progress(a)).toMatchObject({ block: 2 });
    expect(store.note(a)).toBe('first note');
    expect(store.get(a)).toBeDefined();
  });
});

describe('persistence and lastError', () => {
  it('start out healthy', () => {
    const { store } = rig();
    expect(store.persistence).toBe('local');
    expect(store.lastError()).toBeUndefined();
  });

  it('tell the truth after a refused write and recover after a good one', () => {
    const { store, storage } = rig();
    storage.full = true;
    store.addBookmark({ url: 'c.example.org' });
    expect(store.persistence).toBe('memory');
    expect(store.lastError()).toMatchObject({ code: 'quota' });

    storage.full = false;
    store.addBookmark({ url: 'c.example.org' });
    expect(store.persistence).toBe('local');
    expect(store.lastError()).toBeUndefined();
  });

  it('are not changed by a write that was not needed', () => {
    const { store, storage, a } = rig();
    storage.full = true;
    store.setDone(a, false);
    expect(store.persistence).toBe('local');
    expect(store.lastError()).toBeUndefined();
  });

  it('report a refused session write, which is kept in memory', () => {
    const { store, storage, a } = rig();
    storage.full = true;
    store.setSession({ focusId: a, variant: 'oak' });
    expect(store.session()).toMatchObject({ focusId: a, variant: 'oak' });
    expect(store.lastError()).toMatchObject({ code: 'quota' });
  });

  it('report a memory store when storage is blocked from the start', () => {
    const blocked: KeyValueStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      removeItem: () => undefined,
    };
    const store = createStore({ storage: blocked, syncTabs: false });
    expect(store.persistence).toBe('local');
    expect(store.addBookmark({ url: 'a.example.org' }).ok).toBe(false);
    expect(store.persistence).toBe('memory');
    expect(store.bookmarks()).toEqual([]);
  });

  it('hand out a copy of the error', () => {
    const { store, storage } = rig();
    storage.full = true;
    store.addBookmark({ url: 'c.example.org' });
    const error = store.lastError();
    if (error) error.code = 'changed';
    expect(store.lastError()?.code).toBe('quota');
  });
});

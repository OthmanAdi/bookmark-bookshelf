import { describe, expect, it } from 'vitest';
import { DEFAULT_STORAGE_KEY, createMemoryStorage, createStore } from './index';
import { counterIds, makeRig, testClock } from './test-helpers';

function newerDocument(): string {
  return JSON.stringify({
    format: 'bookmark-bookshelf',
    version: 3,
    shelves: [{ id: 's1', name: 'From the future', order: 0 }],
    bookmarks: [
      {
        id: 'b1',
        url: 'https://example.org/one',
        title: 'One',
        shelfId: 's1',
        order: 0,
        futureField: { anything: true },
      },
    ],
    progress: {},
    done: {},
    notes: {},
    session: {},
    somethingNew: [1, 2, 3],
  });
}

function openNewer() {
  const text = newerDocument();
  const storage = createMemoryStorage({ [DEFAULT_STORAGE_KEY]: text });
  const store = createStore({ storage, now: testClock().now, idFactory: counterIds('n'), syncTabs: false });
  return { store, storage, text };
}

describe('a library from a newer version', () => {
  it('opens read-only and shows what it can read', () => {
    const { store } = openNewer();
    expect(store.readOnly).toBe(true);
    expect(store.shelves().map((shelf) => shelf.name)).toEqual(['From the future']);
    expect(store.bookmarks().map((link) => link.title)).toEqual(['One']);
  });

  it('answers every change with a read-only error and leaves memory alone', () => {
    const { store } = openNewer();
    const before = store.snapshot();
    const id = store.bookmarks()[0]!.id;
    const shelfId = store.shelves()[0]!.id;
    const results = [
      store.addBookmark({ url: 'new.example.org' }),
      store.updateBookmark(id, { title: 'Changed' }),
      store.moveBookmark(id, { index: 0 }),
      store.addShelf('Another'),
      store.renameShelf(shelfId, 'Renamed'),
      store.updateShelf(shelfId, { author: 'Someone' }),
      store.removeShelf(shelfId),
      store.setDone(id, true),
      store.setNote(id, 'note'),
      store.importLibrary([{ url: 'x.example.org' }], 'merge'),
      store.importLibrary([{ url: 'x.example.org' }], 'replace'),
    ];
    for (const result of results) {
      expect(result).toMatchObject({ ok: false, error: { code: 'read-only' } });
      if (!result.ok) expect(result.error.message).toMatch(/newer version/);
    }
    expect(store.removeBookmark(id)).toBeUndefined();
    store.restoreBookmark({ bookmark: before.bookmarks[0]! });
    expect(store.snapshot()).toEqual(before);
  });

  it('never writes to storage, however it is used', () => {
    const { store, storage, text } = openNewer();
    const id = store.bookmarks()[0]!.id;
    store.addBookmark({ url: 'new.example.org' });
    store.setProgress(id, { block: 1, ratio: 0.2, percent: 0.1 });
    store.setSession({ focusId: id, variant: 'oak' });
    store.clearProgress(id);
    store.flush();
    store.destroy();
    expect(storage.getItem(DEFAULT_STORAGE_KEY)).toBe(text);
    expect(storage.keys()).toEqual([DEFAULT_STORAGE_KEY]);
  });

  it('lets the person look around: position and session work for this visit', () => {
    const { store } = openNewer();
    const id = store.bookmarks()[0]!.id;
    store.setProgress(id, { block: 1, ratio: 0.2, percent: 0.1 });
    store.setSession({ focusId: id, view: 'list' });
    expect(store.progress(id)).toMatchObject({ block: 1 });
    expect(store.session()).toMatchObject({ focusId: id, view: 'list' });
  });

  it('can still be exported', () => {
    const { store } = openNewer();
    const exported = JSON.parse(store.exportLibrary()) as { bookmarks: unknown[] };
    expect(exported.bookmarks).toHaveLength(1);
  });

  it('is opened again, and not replaced, on every visit', () => {
    const { storage, text } = openNewer();
    for (let visit = 0; visit < 3; visit += 1) {
      const again = createStore({ storage, syncTabs: false });
      expect(again.readOnly).toBe(true);
    }
    expect(storage.getItem(DEFAULT_STORAGE_KEY)).toBe(text);
  });

  it('opens as an empty read-only library when nothing in it can be read', () => {
    const storage = createMemoryStorage({
      [DEFAULT_STORAGE_KEY]: JSON.stringify({ format: 'bookmark-bookshelf', version: 9 }),
    });
    const store = createStore({ storage, syncTabs: false });
    expect(store.readOnly).toBe(true);
    expect(store.bookmarks()).toEqual([]);
    expect(store.addShelf('X').ok).toBe(false);
  });
});

describe('an ordinary library', () => {
  it('is not read-only', () => {
    const { store } = makeRig();
    expect(store.readOnly).toBe(false);
    expect(store.addBookmark({ url: 'a.example.org' }).ok).toBe(true);
  });
});

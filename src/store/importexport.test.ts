import { describe, expect, it } from 'vitest';
import { createStore, createMemoryStorage } from './index';
import { addAll, counterIds, firstShelfId, makeRig, testClock, titles } from './test-helpers';

function filledRig() {
  const rig = makeRig();
  const { store } = rig;
  const shelf = store.addShelf('Essays');
  if (!shelf.ok) throw new Error('shelf');
  const [a = ''] = addAll(store, ['a.com', 'b.com']);
  addAll(store, ['c.com'], shelf.value.id);
  store.updateBookmark(a, { title: 'Alpha', note: 'n', tags: ['t'], readingText: 'body', author: 'Ada' });
  store.setProgress(a, { block: 4, ratio: 0.25, percent: 0.5 });
  store.setSession({ shelfId: shelf.value.id, focusId: a, openId: a, view: 'list', variant: 'night' });
  return { ...rig, a, essays: shelf.value.id };
}

describe('exportLibrary', () => {
  it('is pretty JSON of the snapshot with a trailing newline', () => {
    const { store } = filledRig();
    const text = store.exportLibrary();
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toBe(`${JSON.stringify(store.snapshot(), null, 2)}\n`);
    expect(text).toContain('\n  "version": 2');
  });

  it('round trips through importLibrary replace into an equal snapshot', () => {
    const { store } = filledRig();
    const text = store.exportLibrary();
    const other = makeRig().store;
    const summary = other.importLibrary(text, 'replace');
    expect(summary).toEqual({ ok: true, value: { added: 3, updated: 0, shelvesAdded: 2 } });
    expect(other.snapshot()).toEqual(store.snapshot());
    expect(other.exportLibrary()).toBe(text);
  });

  it('accepts a parsed value as well as text', () => {
    const { store } = filledRig();
    const other = makeRig().store;
    expect(other.importLibrary(store.snapshot(), 'replace').ok).toBe(true);
    expect(other.snapshot()).toEqual(store.snapshot());
  });
});

describe('importLibrary replace', () => {
  it('swaps the whole library, persists it, and emits replace', () => {
    const { store, storage } = makeRig();
    addAll(store, ['old.com']);
    const events: string[] = [];
    store.subscribe((event) => events.push(event.reason));
    const result = store.importLibrary([{ url: 'new.com', title: 'New' }], 'replace');
    expect(result).toEqual({ ok: true, value: { added: 1, updated: 0, shelvesAdded: 1 } });
    expect(titles(store)).toEqual(['New']);
    expect(events).toEqual(['replace']);
    expect(createStore({ storage, syncTabs: false }).snapshot()).toEqual(store.snapshot());
  });

  it('leaves the library alone when the input is bad', () => {
    const { store } = makeRig();
    addAll(store, ['keep.com']);
    const before = store.snapshot();
    expect(store.importLibrary('nonsense', 'replace')).toMatchObject({ ok: false, error: { code: 'invalid-format' } });
    expect(store.importLibrary({ format: 'bookmark-bookshelf', version: 3 }, 'merge')).toMatchObject({
      ok: false,
      error: { code: 'unsupported-version' },
    });
    expect(store.snapshot()).toEqual(before);
  });
});

describe('importLibrary merge', () => {
  it('adds shelves by name and bookmarks by normalised URL', () => {
    const { store, a, essays } = filledRig();
    const incoming = makeRig({ idFactory: counterIds('in') }).store;
    const reading = firstShelfId(incoming);
    const essaysIn = incoming.addShelf('essays');
    const poems = incoming.addShelf('Poems');
    if (!essaysIn.ok || !poems.ok) throw new Error('shelves');
    incoming.addBookmark({ url: 'a.com', title: 'Alpha renamed', note: 'new note', tags: ['x', 'y'], readingText: 'new body', shelfId: reading });
    incoming.addBookmark({ url: 'https://new.example/', title: 'Fresh', shelfId: essaysIn.value.id });
    incoming.addBookmark({ url: 'poem.org', shelfId: poems.value.id });
    const progressBefore = store.progress(a);

    const result = store.importLibrary(incoming.exportLibrary(), 'merge');
    expect(result).toEqual({ ok: true, value: { added: 2, updated: 1, shelvesAdded: 1 } });

    expect(store.shelves().map((s) => s.name)).toEqual(['Reading list', 'Essays', 'Poems']);
    const merged = store.get(a);
    expect(merged).toMatchObject({
      id: a,
      title: 'Alpha renamed',
      note: 'new note',
      tags: ['x', 'y'],
      author: 'Ada',
      reading: { text: 'new body' },
    });
    expect(store.progress(a)).toEqual(progressBefore);
    expect(titles(store, essays)).toEqual(['c.com', 'Fresh']);
    const poemsShelf = store.shelves().find((s) => s.name === 'Poems');
    expect(titles(store, poemsShelf?.id)).toEqual(['poem.org']);
    expect(store.bookmarks().map((b) => b.order)).toEqual([0, 1, 0, 1, 0]);
    expect(store.session().view).toBe('list');
  });

  it('keeps existing tags, note and reading text when the incoming volume has none', () => {
    const { store, a } = filledRig();
    store.importLibrary([{ url: 'a.com', title: 'Only title' }], 'merge');
    expect(store.get(a)).toMatchObject({ title: 'Only title', note: 'n', tags: ['t'], reading: { text: 'body' } });
  });

  it('does not duplicate when the same library is merged twice', () => {
    const { store } = filledRig();
    const text = store.exportLibrary();
    const result = store.importLibrary(text, 'merge');
    expect(result).toEqual({ ok: true, value: { added: 0, updated: 3, shelvesAdded: 0 } });
    expect(store.bookmarks()).toHaveLength(3);
    expect(store.shelves()).toHaveLength(2);
  });

  it('gives imported volumes a fresh id when theirs is taken', () => {
    const storage = createMemoryStorage();
    const first = createStore({ storage, now: testClock().now, idFactory: counterIds('x'), syncTabs: false });
    const [mine = ''] = addAll(first, ['mine.com']);
    const other = createStore({ storage: createMemoryStorage(), now: testClock().now, idFactory: counterIds('x'), syncTabs: false });
    addAll(other, ['theirs.com']);
    expect(other.bookmarks()[0]?.id).toBe(mine);

    first.importLibrary(other.exportLibrary(), 'merge');
    const ids = first.bookmarks().map((b) => b.id);
    expect(new Set(ids).size).toBe(2);
    expect(titles(first)).toEqual(['mine.com', 'theirs.com']);
  });
});

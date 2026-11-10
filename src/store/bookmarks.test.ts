import { describe, expect, it } from 'vitest';
import { defaultCover } from './index';
import { addAll, firstShelfId, makeRig, titles } from './test-helpers';

describe('addBookmark', () => {
  it('normalises the URL, defaults the title and appends to the shelf', () => {
    const { store, clock } = makeRig();
    const result = store.addBookmark({ url: 'www.Example.com/a' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      url: 'https://www.example.com/a',
      title: 'example.com',
      tags: [],
      order: 0,
      shelfId: firstShelfId(store),
      addedAt: clock.now().toISOString(),
      updatedAt: clock.now().toISOString(),
    });
    expect(result.value.cover).toEqual(defaultCover('https://www.example.com/a'));
    expect(store.get(result.value.id)).toEqual(result.value);
  });

  it('lets input.cover override single fields', () => {
    const { store } = makeRig();
    const result = store.addBookmark({ url: 'example.com', cover: { cloth: 'teal' } });
    expect(result.ok && result.value.cover).toEqual({ ...defaultCover('https://example.com/'), cloth: 'teal' });
  });

  it('keeps optional fields, normalises tags and stores reading text', () => {
    const { store, clock } = makeRig();
    const result = store.addBookmark({
      url: 'example.com',
      title: '  A title ',
      author: 'Ada',
      note: 'Worth it',
      tags: [' Go ', 'go', '', 'Rust'],
      readingText: '# Hello',
    });
    expect(result.ok && result.value).toMatchObject({
      title: 'A title',
      author: 'Ada',
      note: 'Worth it',
      tags: ['Go', 'Rust'],
      reading: { format: 'markdown-lite', text: '# Hello', savedAt: clock.now().toISOString() },
    });
  });

  it('caps tags at 12 and 40 characters', () => {
    const { store } = makeRig();
    const tags = Array.from({ length: 20 }, (_, i) => `tag-${i}`);
    const many = store.addBookmark({ url: 'example.com', tags });
    expect(many.ok && many.value.tags).toHaveLength(12);
    const long = store.addBookmark({ url: 'example.org', tags: ['y'.repeat(60)] });
    expect(long.ok && long.value.tags[0]).toHaveLength(40);
  });

  it.each([
    ['title', { title: 'x'.repeat(301) }],
    ['author', { author: 'x'.repeat(201) }],
    ['note', { note: 'x'.repeat(5001) }],
    ['readingText', { readingText: 'x'.repeat(500001) }],
  ])('rejects an over-limit %s without adding anything', (field, extra) => {
    const { store } = makeRig();
    const result = store.addBookmark({ url: 'example.com', ...extra });
    expect(result).toMatchObject({ ok: false, error: { code: 'too-long', field } });
    expect(store.bookmarks()).toEqual([]);
  });

  it('accepts text exactly at the limit', () => {
    const { store } = makeRig();
    const result = store.addBookmark({ url: 'example.com', title: 'x'.repeat(300), note: 'n'.repeat(5000) });
    expect(result.ok).toBe(true);
  });

  it('rejects bad URLs and unknown shelves', () => {
    const { store } = makeRig();
    expect(store.addBookmark({ url: 'javascript:alert(1)' })).toMatchObject({ ok: false, error: { code: 'invalid-url' } });
    expect(store.addBookmark({ url: 'example.com', shelfId: 'nope' })).toMatchObject({
      ok: false,
      error: { code: 'not-found', field: 'shelfId' },
    });
  });
});

describe('updateBookmark', () => {
  it('changes fields, removes empty ones and stamps updatedAt', () => {
    const { store, clock } = makeRig();
    const [id = ''] = addAll(store, ['example.com']);
    store.updateBookmark(id, { note: 'first', author: 'Ada', readingText: 'text' });
    clock.advance(1000);
    const result = store.updateBookmark(id, { title: 'New', note: '', readingText: '', tags: ['a', 'A', 'b'] });
    expect(result.ok).toBe(true);
    const updated = store.get(id);
    expect(updated?.title).toBe('New');
    expect(updated?.author).toBe('Ada');
    expect(updated).not.toHaveProperty('note');
    expect(updated).not.toHaveProperty('reading');
    expect(updated?.tags).toEqual(['a', 'b']);
    expect(updated?.updatedAt).toBe(clock.now().toISOString());
    expect(updated?.addedAt).not.toBe(updated?.updatedAt);
  });

  it('is atomic: a failing patch changes nothing', () => {
    const { store } = makeRig();
    const [id = ''] = addAll(store, ['example.com']);
    const before = store.get(id);
    const result = store.updateBookmark(id, { title: 'Changed', note: 'x'.repeat(5001) });
    expect(result.ok).toBe(false);
    expect(store.get(id)).toEqual(before);
  });

  it('validates the URL and the id', () => {
    const { store } = makeRig();
    const [id = ''] = addAll(store, ['example.com']);
    expect(store.updateBookmark(id, { url: 'file:///x' })).toMatchObject({ ok: false, error: { code: 'invalid-url' } });
    expect(store.updateBookmark('missing', { title: 'x' })).toMatchObject({ ok: false, error: { code: 'not-found' } });
    const changed = store.updateBookmark(id, { url: 'other.org' });
    expect(changed.ok && changed.value.url).toBe('https://other.org/');
  });

  it('moves to the end of another shelf when shelfId changes', () => {
    const { store } = makeRig();
    const second = store.addShelf('Second');
    if (!second.ok) throw new Error('shelf');
    const [a = '', b = ''] = addAll(store, ['a.com', 'b.com']);
    addAll(store, ['c.com'], second.value.id);
    store.updateBookmark(a, { shelfId: second.value.id });
    expect(titles(store, second.value.id)).toEqual(['c.com', 'a.com']);
    expect(store.get(b)?.order).toBe(0);
  });
});

describe('removeBookmark and restoreBookmark', () => {
  it('clears session pointers and progress, and restore puts both back in place', () => {
    const { store } = makeRig();
    const [a = '', b = '', c = ''] = addAll(store, ['a.com', 'b.com', 'c.com']);
    store.setProgress(b, { block: 4, ratio: 0.5, percent: 0.25 });
    store.setSession({ focusId: b, openId: b });

    const entry = store.removeBookmark(b);
    expect(entry?.bookmark.id).toBe(b);
    expect(entry?.progress?.block).toBe(4);
    expect(store.get(b)).toBeUndefined();
    expect(store.progress(b)).toBeUndefined();
    expect(store.session()).toMatchObject({ focusId: null, openId: null });
    expect(store.bookmarks().map((x) => x.order)).toEqual([0, 1]);

    if (!entry) throw new Error('nothing removed');
    store.restoreBookmark(entry);
    expect(store.bookmarks().map((x) => x.id)).toEqual([a, b, c]);
    expect(store.bookmarks().map((x) => x.order)).toEqual([0, 1, 2]);
    expect(store.progress(b)?.block).toBe(4);
  });

  it('returns undefined for an unknown id and ignores a restore of a present id', () => {
    const { store } = makeRig();
    const [a = ''] = addAll(store, ['a.com']);
    expect(store.removeBookmark('missing')).toBeUndefined();
    const present = store.get(a);
    if (!present) throw new Error('missing bookmark');
    store.restoreBookmark({ bookmark: present });
    expect(store.bookmarks()).toHaveLength(1);
  });

  it('restores onto the first shelf when the old shelf is gone', () => {
    const { store } = makeRig();
    const second = store.addShelf('Second');
    if (!second.ok) throw new Error('shelf');
    const [a = ''] = addAll(store, ['a.com'], second.value.id);
    const entry = store.removeBookmark(a);
    if (!entry) throw new Error('nothing removed');
    store.removeShelf(second.value.id);
    store.restoreBookmark(entry);
    expect(store.get(a)?.shelfId).toBe(firstShelfId(store));
  });
});

describe('ordering and moveBookmark', () => {
  it('appends new volumes and lists all shelves by shelf then volume order', () => {
    const { store } = makeRig();
    const second = store.addShelf('Second');
    if (!second.ok) throw new Error('shelf');
    addAll(store, ['b1.com'], second.value.id);
    addAll(store, ['a1.com', 'a2.com']);
    expect(titles(store, null)).toEqual(['a1.com', 'a2.com', 'b1.com']);
    expect(titles(store)).toEqual(['a1.com', 'a2.com', 'b1.com']);
    expect(titles(store, second.value.id)).toEqual(['b1.com']);
  });

  it('reorders inside a shelf', () => {
    const { store } = makeRig();
    const [a = '', , c = ''] = addAll(store, ['a.com', 'b.com', 'c.com']);
    store.moveBookmark(c, { index: 0 });
    expect(titles(store)).toEqual(['c.com', 'a.com', 'b.com']);
    store.moveBookmark(a, { index: 99 });
    expect(titles(store)).toEqual(['c.com', 'b.com', 'a.com']);
    expect(store.bookmarks().map((x) => x.order)).toEqual([0, 1, 2]);
  });

  it('moves across shelves and re-indexes both', () => {
    const { store } = makeRig();
    const second = store.addShelf('Second');
    if (!second.ok) throw new Error('shelf');
    const [a = '', b = ''] = addAll(store, ['a.com', 'b.com', 'c.com']);
    addAll(store, ['x.com', 'y.com'], second.value.id);

    const moved = store.moveBookmark(a, { shelfId: second.value.id, index: 1 });
    expect(moved.ok && moved.value.shelfId).toBe(second.value.id);
    expect(titles(store, firstShelfId(store))).toEqual(['b.com', 'c.com']);
    expect(titles(store, second.value.id)).toEqual(['x.com', 'a.com', 'y.com']);
    expect(store.bookmarks(firstShelfId(store)).map((x) => x.order)).toEqual([0, 1]);
    expect(store.bookmarks(second.value.id).map((x) => x.order)).toEqual([0, 1, 2]);

    store.moveBookmark(b, { shelfId: second.value.id });
    expect(titles(store, second.value.id)).toEqual(['x.com', 'a.com', 'y.com', 'b.com']);
  });

  it('reports unknown ids and shelves', () => {
    const { store } = makeRig();
    const [a = ''] = addAll(store, ['a.com']);
    expect(store.moveBookmark('missing', {})).toMatchObject({ ok: false, error: { code: 'not-found' } });
    expect(store.moveBookmark(a, { shelfId: 'nope' })).toMatchObject({ ok: false, error: { code: 'not-found' } });
  });
});

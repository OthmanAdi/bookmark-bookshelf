import { describe, expect, it } from 'vitest';
import { addAll, makeRig } from './test-helpers';

describe('findByUrl', () => {
  it('finds a link by the address it was saved under', () => {
    const { store } = makeRig();
    const [a = ''] = addAll(store, ['https://example.org/page']);
    expect(store.findByUrl('https://example.org/page')?.id).toBe(a);
  });

  it('treats other spellings of the address as the same page', () => {
    const { store } = makeRig();
    const [a = ''] = addAll(store, ['https://example.org/page?b=2&a=1']);
    for (const spelling of [
      'HTTPS://Example.org/page?a=1&b=2',
      'example.org/page/?a=1&b=2',
      'https://www.example.org/page?utm_source=news&a=1&b=2#intro',
      '  https://example.org/page?a=1&b=2  ',
    ]) {
      expect(store.findByUrl(spelling)?.id).toBe(a);
    }
  });

  it('finds links saved before tracking parameters were removed', () => {
    const { store } = makeRig();
    const [a = ''] = addAll(store, ['https://example.org/page']);
    store.importLibrary(
      {
        format: 'bookmark-bookshelf',
        version: 2,
        shelves: [{ id: 'x', name: 'Other', order: 0 }],
        bookmarks: [],
        progress: {},
        done: {},
        notes: {},
        session: {},
      },
      'merge',
    );
    expect(store.findByUrl('https://example.org/page?fbclid=abc')?.id).toBe(a);
  });

  it('does not confuse different pages', () => {
    const { store } = makeRig();
    addAll(store, ['https://example.org/page?a=1']);
    expect(store.findByUrl('https://example.org/page?a=2')).toBeUndefined();
    expect(store.findByUrl('https://example.org/other')).toBeUndefined();
    expect(store.findByUrl('https://example.net/page?a=1')).toBeUndefined();
  });

  it('answers undefined for text that is not an address', () => {
    const { store } = makeRig();
    addAll(store, ['https://example.org/page']);
    expect(store.findByUrl('')).toBeUndefined();
    expect(store.findByUrl('just words')).toBeUndefined();
    expect(store.findByUrl('javascript:alert(1)')).toBeUndefined();
  });

  it('can leave out the link being edited', () => {
    const { store } = makeRig();
    const [a = '', b = ''] = addAll(store, ['https://example.org/page', 'https://example.org/page/']);
    expect(store.findByUrl('https://example.org/page', a)?.id).toBe(b);
    expect(store.findByUrl('https://example.org/page', b)?.id).toBe(a);
    const only = makeRig();
    const [c = ''] = addAll(only.store, ['https://example.org/solo']);
    expect(only.store.findByUrl('https://example.org/solo', c)).toBeUndefined();
  });

  it('finds links on any shelf and hands back a copy', () => {
    const { store } = makeRig();
    const shelf = store.addShelf('Second');
    if (!shelf.ok) throw new Error('shelf failed');
    const [a = ''] = addAll(store, ['https://example.org/page'], shelf.value.id);
    const found = store.findByUrl('https://example.org/page');
    expect(found?.id).toBe(a);
    if (found) found.title = 'changed';
    expect(store.get(a)?.title).not.toBe('changed');
  });
});

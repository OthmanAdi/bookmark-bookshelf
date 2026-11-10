import { describe, expect, it } from 'vitest';
import { addAll, firstShelfId, makeRig, titles } from './test-helpers';

describe('shelves', () => {
  it('trims names and enforces 1 to 60 characters', () => {
    const { store } = makeRig();
    const added = store.addShelf('  Essays  ');
    expect(added.ok && added.value.name).toBe('Essays');
    expect(store.addShelf('   ')).toMatchObject({ ok: false, error: { code: 'invalid-name' } });
    expect(store.addShelf('x'.repeat(61))).toMatchObject({ ok: false, error: { code: 'too-long' } });
    expect(store.addShelf('x'.repeat(60)).ok).toBe(true);
  });

  it('keeps names unique ignoring case', () => {
    const { store } = makeRig();
    expect(store.addShelf('Essays').ok).toBe(true);
    expect(store.addShelf('essays')).toMatchObject({ ok: false, error: { code: 'duplicate-shelf' } });
    expect(store.addShelf('reading LIST')).toMatchObject({ ok: false, error: { code: 'duplicate-shelf' } });
  });

  it('renames, allows a case-only change, and refuses the name of another shelf', () => {
    const { store } = makeRig();
    const a = store.addShelf('Alpha');
    const b = store.addShelf('Beta');
    if (!a.ok || !b.ok) throw new Error('shelves');
    expect(store.renameShelf(a.value.id, 'ALPHA')).toMatchObject({ ok: true, value: { name: 'ALPHA' } });
    expect(store.renameShelf(b.value.id, 'alpha')).toMatchObject({ ok: false, error: { code: 'duplicate-shelf' } });
    expect(store.renameShelf('missing', 'Gamma')).toMatchObject({ ok: false, error: { code: 'not-found' } });
  });

  it('refuses to remove the last shelf', () => {
    const { store } = makeRig();
    expect(store.removeShelf(firstShelfId(store))).toMatchObject({ ok: false, error: { code: 'last-shelf' } });
    expect(store.shelves()).toHaveLength(1);
  });

  it('moves volumes to the first remaining shelf and resets the session filter', () => {
    const { store } = makeRig();
    const first = firstShelfId(store);
    const second = store.addShelf('Second');
    if (!second.ok) throw new Error('shelf');
    addAll(store, ['a.com'], first);
    addAll(store, ['b.com', 'c.com'], second.value.id);
    store.setSession({ shelfId: second.value.id });

    expect(store.removeShelf(second.value.id).ok).toBe(true);
    expect(store.shelves().map((s) => s.id)).toEqual([first]);
    expect(titles(store, first)).toEqual(['a.com', 'b.com', 'c.com']);
    expect(store.bookmarks().map((x) => x.order)).toEqual([0, 1, 2]);
    expect(store.session().shelfId).toBeNull();
  });

  it('moves volumes to a chosen shelf and keeps shelf orders contiguous', () => {
    const { store } = makeRig();
    const first = firstShelfId(store);
    const b = store.addShelf('B');
    const c = store.addShelf('C');
    if (!b.ok || !c.ok) throw new Error('shelves');
    addAll(store, ['x.com'], b.value.id);
    expect(store.removeShelf(b.value.id, c.value.id).ok).toBe(true);
    expect(titles(store, c.value.id)).toEqual(['x.com']);
    expect(store.shelves().map((s) => [s.id, s.order])).toEqual([
      [first, 0],
      [c.value.id, 1],
    ]);
    expect(store.removeShelf(c.value.id, c.value.id)).toMatchObject({ ok: false, error: { code: 'not-found' } });
  });
});

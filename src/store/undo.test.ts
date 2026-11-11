import { describe, expect, it } from 'vitest';
import type { Store } from './index';
import { addAll, firstShelfId, makeRig, titles } from './test-helpers';

function filled() {
  const rig = makeRig();
  const { store } = rig;
  const ids = addAll(store, ['a.example.org', 'b.example.org', 'c.example.org', 'd.example.org', 'e.example.org']);
  return { ...rig, ids };
}

function order(store: Store, shelfId?: string): string[] {
  return store.bookmarks(shelfId ?? null).map((link) => link.id);
}

describe('removeBookmarks', () => {
  it('removes several links in one step and announces it once', () => {
    const { store, ids } = filled();
    const events: string[] = [];
    store.subscribe((event) => events.push(event.reason));
    const removed = store.removeBookmarks([ids[1]!, ids[3]!]);
    expect(removed.map((entry) => entry.bookmark.id)).toEqual([ids[1], ids[3]]);
    expect(order(store)).toEqual([ids[0], ids[2], ids[4]]);
    expect(events).toEqual(['bookmarks']);
  });

  it('hands back each link with the place it had before any of them went', () => {
    const { store, ids } = filled();
    const removed = store.removeBookmarks([ids[1]!, ids[3]!]);
    expect(removed.map((entry) => entry.bookmark.order)).toEqual([1, 3]);
  });

  it('carries progress, done marks and notes for undo', () => {
    const { store, ids } = filled();
    store.setProgress(ids[1]!, { block: 2, ratio: 0.5, percent: 0.4 });
    store.setDone(ids[1]!, true);
    store.setNote(ids[3]!, 'keep');
    const removed = store.removeBookmarks([ids[1]!, ids[3]!]);
    expect(removed[0]).toMatchObject({ done: '2026-01-01T00:00:00.000Z', progress: { block: 2 } });
    expect(removed[1]).toMatchObject({ note: 'keep' });
    expect(store.snapshot().done).toEqual({});
    expect(store.snapshot().notes).toEqual({});
  });

  it('skips ids that do not exist and repeated ids', () => {
    const { store, ids } = filled();
    const removed = store.removeBookmarks(['missing', ids[0]!, ids[0]!, 'constructor']);
    expect(removed).toHaveLength(1);
    expect(store.removeBookmarks([])).toEqual([]);
    expect(store.removeBookmarks(['missing'])).toEqual([]);
  });

  it('clears the focus when the focused link goes', () => {
    const { store, ids } = filled();
    store.setSession({ focusId: ids[2]!, openId: ids[2]! });
    store.removeBookmarks([ids[2]!]);
    expect(store.session()).toMatchObject({ focusId: null, openId: null });
  });
});

describe('restoreBookmarks', () => {
  it('puts every link back in its old place with everything personal', () => {
    const { store, ids } = filled();
    store.setProgress(ids[1]!, { block: 2, ratio: 0.5, percent: 0.4 });
    store.setDone(ids[3]!, true);
    store.setNote(ids[3]!, 'keep');
    const before = store.snapshot();

    const removed = store.removeBookmarks([ids[3]!, ids[1]!, ids[0]!]);
    expect(store.restoreBookmarks(removed)).toEqual({ ok: true, value: undefined });
    const after = store.snapshot();
    expect(order(store)).toEqual(ids);
    expect(after.progress).toEqual(before.progress);
    expect(after.done).toEqual(before.done);
    expect(after.notes).toEqual(before.notes);
    expect(after.bookmarks.map((link) => link.order)).toEqual([0, 1, 2, 3, 4]);
  });

  it('works across shelves', () => {
    const { store, ids } = filled();
    const second = store.addShelf('Second');
    if (!second.ok) throw new Error('shelf failed');
    const [x = '', y = ''] = addAll(store, ['x.example.org', 'y.example.org'], second.value.id);
    const before = store.snapshot().bookmarks;
    const removed = store.removeBookmarks([ids[2]!, x, ids[0]!, y]);
    store.restoreBookmarks(removed);
    expect(store.snapshot().bookmarks).toEqual(before);
  });

  it('works from a copy turned into text and back', () => {
    const { store, ids } = filled();
    const removed = store.removeBookmarks([ids[1]!]);
    const copy = JSON.parse(JSON.stringify(removed)) as typeof removed;
    expect(store.restoreBookmarks(copy).ok).toBe(true);
    expect(order(store)).toEqual(ids);
  });

  it('puts a link on the first shelf when its own shelf is gone', () => {
    const { store, ids } = filled();
    const second = store.addShelf('Second');
    if (!second.ok) throw new Error('shelf failed');
    const [x = ''] = addAll(store, ['x.example.org'], second.value.id);
    const removed = store.removeBookmarks([x]);
    store.removeShelf(second.value.id);
    store.restoreBookmarks(removed);
    expect(store.get(x)?.shelfId).toBe(firstShelfId(store));
    expect(order(store)).toContain(ids[0]);
  });

  it('leaves out a link whose id is already back, and says so when nothing came back', () => {
    const { store, ids } = filled();
    const removed = store.removeBookmarks([ids[0]!]);
    expect(store.restoreBookmarks(removed).ok).toBe(true);
    expect(store.restoreBookmarks(removed)).toMatchObject({ ok: false, error: { code: 'not-restored' } });
    expect(order(store)).toEqual(ids);
  });

  it('accepts an empty list', () => {
    const { store } = filled();
    expect(store.restoreBookmarks([]).ok).toBe(true);
  });
});

describe('removeShelf and restoreShelf', () => {
  function threeShelves() {
    const rig = makeRig();
    const { store } = rig;
    const first = firstShelfId(store);
    const middle = store.addShelf('Middle');
    const last = store.addShelf('Last');
    if (!middle.ok || !last.ok) throw new Error('shelf failed');
    const home = addAll(store, ['h1.example.org', 'h2.example.org'], first);
    const mid = addAll(store, ['m1.example.org', 'm2.example.org', 'm3.example.org'], middle.value.id);
    const end = addAll(store, ['l1.example.org'], last.value.id);
    return { ...rig, first, middle: middle.value.id, last: last.value.id, home, mid, end };
  }

  it('hands back what an undo needs', () => {
    const { store, middle, first, mid } = threeShelves();
    const result = store.removeShelf(middle, first);
    if (!result.ok) throw new Error('remove failed');
    expect(result.value).toMatchObject({ shelf: { id: middle, name: 'Middle', order: 1 }, moveTo: first, wasActive: false });
    expect(result.value.links).toEqual(mid.map((id, index) => ({ id, order: index })));
  });

  it('puts the shelf back at its old place with its links in their old order', () => {
    const { store, middle, first, last, home, mid, end } = threeShelves();
    const before = store.snapshot();
    const result = store.removeShelf(middle, first);
    if (!result.ok) throw new Error('remove failed');
    expect(order(store, first)).toEqual([...home, ...mid]);

    expect(store.restoreShelf(result.value)).toEqual({ ok: true, value: undefined });
    expect(store.shelves().map((shelf) => shelf.id)).toEqual([first, middle, last]);
    expect(order(store, middle)).toEqual(mid);
    expect(order(store, first)).toEqual(home);
    expect(order(store, last)).toEqual(end);
    expect(store.snapshot().bookmarks).toEqual(before.bookmarks);
    expect(store.snapshot().shelves).toEqual(before.shelves);
  });

  it('restores the first shelf of several to the front', () => {
    const { store, first, middle } = threeShelves();
    const result = store.removeShelf(first, middle);
    if (!result.ok) throw new Error('remove failed');
    expect(store.shelves()[0]?.id).toBe(middle);
    store.restoreShelf(result.value);
    expect(store.shelves().map((shelf) => shelf.order)).toEqual([0, 1, 2]);
    expect(store.shelves()[0]?.id).toBe(first);
  });

  it('keeps links that were added to the shelf they moved to in the meantime', () => {
    const { store, middle, first, home, mid } = threeShelves();
    const result = store.removeShelf(middle, first);
    if (!result.ok) throw new Error('remove failed');
    const [added = ''] = addAll(store, ['new.example.org'], first);
    store.restoreShelf(result.value);
    expect(order(store, first)).toEqual([...home, added]);
    expect(order(store, middle)).toEqual(mid);
  });

  it('leaves a link where it is if the person moved it after the shelf was removed', () => {
    const { store, middle, first, last, mid } = threeShelves();
    const result = store.removeShelf(middle, first);
    if (!result.ok) throw new Error('remove failed');
    store.moveBookmark(mid[0]!, { shelfId: last });
    store.restoreShelf(result.value);
    expect(store.get(mid[0]!)?.shelfId).toBe(last);
    expect(order(store, middle)).toEqual([mid[1], mid[2]]);
  });

  it('shows the shelf again when it was the one being shown', () => {
    const { store, middle, first } = threeShelves();
    store.setSession({ shelfId: middle });
    const result = store.removeShelf(middle, first);
    if (!result.ok) throw new Error('remove failed');
    expect(result.value.wasActive).toBe(true);
    expect(store.session().shelfId).toBeNull();
    store.restoreShelf(result.value);
    expect(store.session().shelfId).toBe(middle);
  });

  it('does not take the view back from a shelf the person chose since', () => {
    const { store, middle, first, last } = threeShelves();
    store.setSession({ shelfId: middle });
    const result = store.removeShelf(middle, first);
    if (!result.ok) throw new Error('remove failed');
    store.setSession({ shelfId: last });
    store.restoreShelf(result.value);
    expect(store.session().shelfId).toBe(last);
  });

  it('keeps the details of the shelf', () => {
    const { store, middle, first } = threeShelves();
    store.updateShelf(middle, { description: 'Kept', author: 'Ms Example', due: '2026-03-31', lang: 'de' });
    const result = store.removeShelf(middle, first);
    if (!result.ok) throw new Error('remove failed');
    store.restoreShelf(result.value);
    expect(store.shelves().find((shelf) => shelf.id === middle)).toMatchObject({
      description: 'Kept',
      author: 'Ms Example',
      due: '2026-03-31',
      lang: 'de',
    });
  });

  it('refuses to restore twice, or over a shelf with the same name', () => {
    const { store, middle, first } = threeShelves();
    const result = store.removeShelf(middle, first);
    if (!result.ok) throw new Error('remove failed');
    expect(store.restoreShelf(result.value).ok).toBe(true);
    expect(store.restoreShelf(result.value).ok).toBe(false);

    const again = store.removeShelf(middle, first);
    if (!again.ok) throw new Error('remove failed');
    store.addShelf('middle');
    expect(store.restoreShelf(again.value)).toMatchObject({ ok: false, error: { code: 'duplicate-shelf' } });
  });

  it('survives a trip through storage as plain data', () => {
    const { store, middle, first, mid } = threeShelves();
    const result = store.removeShelf(middle, first);
    if (!result.ok) throw new Error('remove failed');
    const copy = JSON.parse(JSON.stringify(result.value)) as typeof result.value;
    expect(store.restoreShelf(copy).ok).toBe(true);
    expect(order(store, middle)).toEqual(mid);
    expect(titles(store, middle)).toHaveLength(3);
  });

  it('still refuses to remove the last shelf and a shelf that does not exist', () => {
    const { store } = makeRig();
    expect(store.removeShelf(firstShelfId(store))).toMatchObject({ ok: false, error: { code: 'last-shelf' } });
    expect(store.removeShelf('missing')).toMatchObject({ ok: false, error: { code: 'not-found' } });
  });
});

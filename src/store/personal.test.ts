import { describe, expect, it } from 'vitest';
import { createMemoryStorage, createStore } from './index';
import { addAll, firstShelfId, makeRig } from './test-helpers';

function rigWithLinks() {
  const rig = makeRig();
  const [a = '', b = ''] = addAll(rig.store, ['a.example.org', 'b.example.org']);
  return { ...rig, a, b };
}

describe('done marks', () => {
  it('start unmarked, can be set and cleared, and keep the time of the first mark', () => {
    const { store, clock, a } = rigWithLinks();
    expect(store.isDone(a)).toBe(false);
    expect(store.setDone(a, true)).toEqual({ ok: true, value: undefined });
    expect(store.isDone(a)).toBe(true);
    const first = store.snapshot().done[a];
    expect(first).toBe('2026-01-01T00:00:00.000Z');

    clock.advance(60_000);
    store.setDone(a, true);
    expect(store.snapshot().done[a]).toBe(first);

    store.setDone(a, false);
    expect(store.isDone(a)).toBe(false);
    expect(store.snapshot().done).toEqual({});
  });

  it('say not found for a link that does not exist', () => {
    const { store } = rigWithLinks();
    expect(store.setDone('missing', true)).toMatchObject({ ok: false, error: { code: 'not-found' } });
    expect(store.isDone('missing')).toBe(false);
    expect(store.isDone('constructor')).toBe(false);
  });

  it('are saved, and announced only when they change', () => {
    const { store, storage, a } = rigWithLinks();
    const events: string[] = [];
    store.subscribe((event) => events.push(event.reason));
    store.setDone(a, false);
    expect(events).toEqual([]);
    store.setDone(a, true);
    store.setDone(a, true);
    expect(events).toEqual(['done']);
    expect(createStore({ storage, syncTabs: false }).isDone(a)).toBe(true);
  });
});

describe('private notes', () => {
  it('start empty, can be set, changed and removed', () => {
    const { store, a } = rigWithLinks();
    expect(store.note(a)).toBe('');
    store.setNote(a, '  Check the second table.  ');
    expect(store.note(a)).toBe('Check the second table.');
    store.setNote(a, 'Check the third table.');
    expect(store.note(a)).toBe('Check the third table.');
    store.setNote(a, '   ');
    expect(store.note(a)).toBe('');
    expect(store.snapshot().notes).toEqual({});
  });

  it('refuse a note over 2,000 characters and keep the old one', () => {
    const { store, a } = rigWithLinks();
    store.setNote(a, 'short');
    expect(store.setNote(a, 'n'.repeat(2001))).toMatchObject({
      ok: false,
      error: { code: 'too-long', field: 'note' },
    });
    expect(store.note(a)).toBe('short');
    expect(store.setNote(a, 'n'.repeat(2000)).ok).toBe(true);
  });

  it('say not found for a link that does not exist', () => {
    const { store } = rigWithLinks();
    expect(store.setNote('missing', 'x')).toMatchObject({ ok: false, error: { code: 'not-found' } });
    expect(store.note('toString')).toBe('');
  });

  it('are announced as notes, and not when the text is the same', () => {
    const { store, a } = rigWithLinks();
    const events: string[] = [];
    store.subscribe((event) => events.push(event.reason));
    store.setNote(a, 'x');
    store.setNote(a, 'x');
    expect(events).toEqual(['notes']);
  });
});

describe('removing a link', () => {
  it('removes its done mark and note and hands them back for undo', () => {
    const { store, a, b } = rigWithLinks();
    store.setProgress(a, { block: 1, ratio: 0.5, percent: 0.2 });
    store.setDone(a, true);
    store.setNote(a, 'keep me');
    store.setDone(b, true);

    const removed = store.removeBookmark(a);
    expect(removed).toMatchObject({ bookmark: { id: a }, done: '2026-01-01T00:00:00.000Z', note: 'keep me' });
    expect(removed?.progress).toMatchObject({ block: 1 });
    expect(store.snapshot().done).toEqual({ [b]: '2026-01-01T00:00:00.000Z' });
    expect(store.snapshot().notes).toEqual({});
    expect(store.isDone(a)).toBe(false);

    store.restoreBookmark(removed!);
    expect(store.isDone(a)).toBe(true);
    expect(store.note(a)).toBe('keep me');
    expect(store.progress(a)).toMatchObject({ block: 1 });
  });

  it('hands back only what the link had', () => {
    const { store, a } = rigWithLinks();
    const removed = store.removeBookmark(a);
    expect(Object.keys(removed ?? {})).toEqual(['bookmark']);
  });
});

describe('updateShelf', () => {
  it('changes several fields in one step', () => {
    const { store } = makeRig();
    const id = firstShelfId(store);
    const result = store.updateShelf(id, {
      name: 'Week 4',
      description: 'Read these before Thursday.',
      lang: 'de-AT',
      author: 'Ms Example',
      due: '2026-03-31',
    });
    expect(result).toMatchObject({
      ok: true,
      value: { name: 'Week 4', description: 'Read these before Thursday.', lang: 'de-AT', author: 'Ms Example', due: '2026-03-31' },
    });
    expect(createStore({ storage: createMemoryStorage(), syncTabs: false }).shelves()).toHaveLength(1);
  });

  it('removes an optional field with an empty string and leaves the others alone', () => {
    const { store } = makeRig();
    const id = firstShelfId(store);
    store.updateShelf(id, { description: 'text', author: 'Someone' });
    const result = store.updateShelf(id, { description: '' });
    expect(result.ok && result.value).toMatchObject({ author: 'Someone' });
    expect(result.ok && result.value).not.toHaveProperty('description');
  });

  it('changes nothing when one field is wrong', () => {
    const { store } = makeRig();
    const id = firstShelfId(store);
    const before = store.shelves();
    expect(store.updateShelf(id, { name: 'New', due: '2026-02-30' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-due', field: 'due' },
    });
    expect(store.updateShelf(id, { name: 'New', lang: 'not valid!' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-lang', field: 'lang' },
    });
    expect(store.updateShelf(id, { description: 'd'.repeat(501) })).toMatchObject({
      ok: false,
      error: { code: 'too-long', field: 'description' },
    });
    expect(store.updateShelf(id, { author: 'a'.repeat(81) })).toMatchObject({
      ok: false,
      error: { code: 'too-long', field: 'author' },
    });
    expect(store.shelves()).toEqual(before);
  });

  it('keeps shelf names unique and answers not found for a missing shelf', () => {
    const { store } = makeRig();
    const other = store.addShelf('Second');
    if (!other.ok) throw new Error('shelf');
    expect(store.updateShelf(other.value.id, { name: 'reading LIST' })).toMatchObject({
      ok: false,
      error: { code: 'duplicate-shelf' },
    });
    expect(store.updateShelf('missing', { name: 'X' })).toMatchObject({ ok: false, error: { code: 'not-found' } });
  });

  it('is what renameShelf does', () => {
    const { store } = makeRig();
    const id = firstShelfId(store);
    store.updateShelf(id, { description: 'kept' });
    const renamed = store.renameShelf(id, 'Renamed');
    expect(renamed.ok && renamed.value).toMatchObject({ name: 'Renamed', description: 'kept' });
  });

  it('is announced as a shelf change', () => {
    const { store } = makeRig();
    const events: string[] = [];
    store.subscribe((event) => events.push(event.reason));
    store.updateShelf(firstShelfId(store), { author: 'Someone' });
    expect(events).toEqual(['shelves']);
  });
});

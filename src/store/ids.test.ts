import { describe, expect, it } from 'vitest';
import { createMemoryStorage, createStore, migrateLibrary } from './index';
import { isValidId, ownValue } from './ids';
import { addAll, counterIds, makeRig, testClock } from './test-helpers';

const AWKWARD = ['constructor', 'toString', 'hasOwnProperty', 'valueOf'];

function libraryWithIds(ids: string[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: 'bookmark-bookshelf',
    version: 1,
    shelves: [{ id: 'shelf-a', name: 'Reading list', order: 0 }],
    bookmarks: ids.map((id, index) => ({
      id,
      url: `https://example.org/${index}`,
      title: `Page ${index}`,
      shelfId: 'shelf-a',
      order: index,
    })),
    progress: Object.fromEntries(ids.map((id) => [id, { block: 3, ratio: 0.5, percent: 0.4 }])),
    session: { shelfId: null, focusId: ids[0] ?? null, openId: null, view: 'shelf', variant: 'paper' },
    ...extra,
  };
}

describe('isValidId', () => {
  it('accepts letters, digits, underscore and hyphen up to 64 characters', () => {
    for (const id of ['a', 'bm-1', 'Shelf_2', 'x'.repeat(64), ...AWKWARD]) expect(isValidId(id)).toBe(true);
  });

  it('refuses everything else, including the prototype key', () => {
    for (const id of ['', ' ', 'a b', 'a.b', 'a/b', 'x'.repeat(65), '__proto__', 'é', 7, null, undefined, {}]) {
      expect(isValidId(id)).toBe(false);
    }
  });
});

describe('ownValue', () => {
  it('does not answer with inherited members', () => {
    const record: Record<string, number> = { mine: 1 };
    expect(ownValue(record, 'mine')).toBe(1);
    for (const id of [...AWKWARD, '__proto__']) expect(ownValue(record, id)).toBeUndefined();
  });
});

describe('ids that exist on every object', () => {
  it('can be used for volumes and keep their own progress', () => {
    const { store } = makeRig();
    const imported = store.importLibrary(libraryWithIds(AWKWARD), 'replace');
    expect(imported.ok).toBe(true);
    expect(store.bookmarks().map((b) => b.id)).toEqual(AWKWARD);
    for (const id of AWKWARD) expect(store.progress(id)).toMatchObject({ block: 3, ratio: 0.5 });
    expect(() => store.snapshot()).not.toThrow();
    expect(() => store.exportLibrary()).not.toThrow();
  });

  it('report no progress for a volume that has none', () => {
    const { store } = makeRig();
    const [id = ''] = addAll(store, ['a.example.org']);
    expect(store.progress(id)).toBeUndefined();
    for (const name of [...AWKWARD, '__proto__']) expect(store.progress(name)).toBeUndefined();
  });

  it('can be set and cleared as progress of a real volume', () => {
    const { store } = makeRig({ idFactory: () => 'constructor' });
    const [id = ''] = addAll(store, ['a.example.org']);
    expect(id).toBe('constructor');
    store.setProgress(id, { block: 2, ratio: 0.1, percent: 0.2 });
    expect(store.progress(id)).toMatchObject({ block: 2 });
    store.clearProgress(id);
    expect(store.progress(id)).toBeUndefined();
    store.clearProgress('toString');
    expect(store.removeBookmark(id)?.bookmark.id).toBe('constructor');
  });

  it('load from storage without throwing', () => {
    const storage = createMemoryStorage({ 'bookmark-bookshelf:library': JSON.stringify(libraryWithIds(AWKWARD)) });
    const store = createStore({ storage, syncTabs: false });
    expect(store.bookmarks()).toHaveLength(AWKWARD.length);
    expect(store.progress('toString')).toBeDefined();
  });
});

describe('ids that cannot be kept', () => {
  const options = () => ({ now: testClock().now, idFactory: counterIds('n') });

  it('are replaced with fresh ones and everything pointing at them follows', () => {
    const doc = libraryWithIds(['__proto__', 'has space', 'x'.repeat(65), 'good']);
    const result = migrateLibrary(doc, options());
    if (!result.ok) throw new Error('migration failed');
    const ids = result.value.bookmarks.map((b) => b.id);
    expect(ids).toEqual(['n-1', 'n-2', 'n-3', 'good']);
    expect(Object.keys(result.value.progress).sort()).toEqual([...ids].sort());
    expect(result.value.session.focusId).toBe('n-1');
    expect(Object.getPrototypeOf(result.value.progress)).toBe(Object.prototype);
  });

  it('replace the id of a shelf and move its volumes with it', () => {
    const doc = libraryWithIds(['b1']);
    (doc.shelves as Array<Record<string, unknown>>)[0]!.id = 'bad id!';
    (doc.bookmarks as Array<Record<string, unknown>>)[0]!.shelfId = 'bad id!';
    (doc.session as Record<string, unknown>).shelfId = 'bad id!';
    const result = migrateLibrary(doc, options());
    if (!result.ok) throw new Error('migration failed');
    expect(result.value.shelves[0]?.id).toBe('n-1');
    expect(result.value.bookmarks[0]?.shelfId).toBe('n-1');
    expect(result.value.session.shelfId).toBe('n-1');
  });

  it('keep a volume whose id repeats an earlier one', () => {
    const result = migrateLibrary(libraryWithIds(['same', 'same']), options());
    if (!result.ok) throw new Error('migration failed');
    expect(result.value.bookmarks.map((b) => b.id)).toEqual(['same', 'n-1']);
  });
});

describe('importLibrary never throws', () => {
  it('answers with an error result when reading the document throws', () => {
    const { store } = makeRig();
    const hostile = {
      get format(): string {
        throw new Error('no');
      },
    };
    expect(store.importLibrary(hostile, 'merge')).toMatchObject({ ok: false, error: { code: 'invalid-format' } });
    expect(store.importLibrary(hostile, 'replace').ok).toBe(false);
  });

  it('answers with an error result for a hostile list entry', () => {
    const { store } = makeRig();
    const doc = libraryWithIds(['a']);
    (doc.bookmarks as unknown[]).push({
      id: 'b',
      get url(): string {
        throw new Error('no');
      },
    });
    expect(store.importLibrary(doc, 'merge').ok).toBe(false);
    expect(store.bookmarks()).toEqual([]);
  });

  it('survives text, numbers and nesting that is not a library', () => {
    const { store } = makeRig();
    for (const input of ['', '{', 'null', '7', '[[[]]]', { format: 'bookmark-bookshelf', version: 1 }, undefined, null]) {
      expect(() => store.importLibrary(input, 'merge')).not.toThrow();
    }
  });
});

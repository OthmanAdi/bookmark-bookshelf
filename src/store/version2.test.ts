import { describe, expect, it } from 'vitest';
import { LIBRARY_VERSION, defaultCover, migrateLibrary } from './index';
import type { LibraryV2 } from './index';
import { applySessionPatch } from './session-ops';
import { counterIds, makeRig, testClock } from './test-helpers';

const options = () => ({ now: testClock().now, idFactory: counterIds('m') });

const STAMP = '2026-01-01T00:00:00.000Z';
const FULL = { tags: [], addedAt: STAMP, updatedAt: STAMP, cover: { cloth: 'ink', pattern: 'arcs', seed: 5 } };

function document(): Record<string, unknown> {
  return {
    format: 'bookmark-bookshelf',
    version: 2,
    shelves: [
      {
        id: 's1',
        name: 'Week 4',
        order: 0,
        description: 'Read these before Thursday.',
        lang: 'de-AT',
        author: 'Ms Example',
        due: '2026-03-31',
        origin: { shelfId: 'class-shelf', revision: 3 },
      },
    ],
    bookmarks: [
      {
        ...FULL,
        id: 'b1',
        url: 'https://example.org/one',
        title: 'One',
        shelfId: 's1',
        order: 0,
        required: false,
        minutes: 12,
        origin: { shelfId: 'class-shelf', volumeId: 'v1' },
      },
      { ...FULL, id: 'b2', url: 'https://example.org/two', title: 'Two', shelfId: 's1', order: 1 },
    ],
    progress: {},
    done: { b1: '2026-02-01T10:00:00.000Z' },
    notes: { b2: 'Ask about the second figure.' },
    session: { shelfId: 's1', focusId: 'b1', openId: null, view: 'list', variant: 'oak', textScale: 3, sort: 'title' },
  };
}

function read(raw: unknown): LibraryV2 {
  const result = migrateLibrary(raw, options());
  if (!result.ok) throw new Error(`migration failed: ${result.error.code}`);
  return result.value;
}

describe('library version 2', () => {
  it('is the version this build writes', () => {
    expect(LIBRARY_VERSION).toBe(2);
  });

  it('keeps every new field of a valid document', () => {
    expect(read(document())).toEqual(document());
  });

  it('upgrades version 1 by adding empty done marks and notes and changing nothing else', () => {
    const v1: Record<string, unknown> = { ...document(), version: 1 };
    delete v1.done;
    delete v1.notes;
    const upgraded = read(v1);
    expect(upgraded.version).toBe(2);
    expect(upgraded.done).toEqual({});
    expect(upgraded.notes).toEqual({});
    expect({ ...upgraded, version: 2, done: {}, notes: {} }).toEqual({ ...document(), done: {}, notes: {} });
  });

  it('ignores done marks and notes written into a version 1 document', () => {
    const upgraded = read({ ...document(), version: 1 });
    expect(upgraded.done).toEqual({});
    expect(upgraded.notes).toEqual({});
  });

  it('answers unsupported-version for version 3', () => {
    expect(migrateLibrary({ ...document(), version: 3 })).toMatchObject({
      ok: false,
      error: { code: 'unsupported-version' },
    });
  });

  it('survives a round trip through export and import', () => {
    const { store } = makeRig();
    expect(store.importLibrary(document(), 'replace').ok).toBe(true);
    const text = store.exportLibrary();
    const other = makeRig().store;
    expect(other.importLibrary(text, 'replace').ok).toBe(true);
    expect(other.snapshot()).toEqual(store.snapshot());
    expect(other.snapshot().done).toEqual({ b1: '2026-02-01T10:00:00.000Z' });
  });
});

describe('limits of the new fields', () => {
  it('cut a long description and author and drop a bad language or due date', () => {
    const doc = document();
    const shelf = (doc.shelves as Array<Record<string, unknown>>)[0]!;
    shelf.description = 'd'.repeat(900);
    shelf.author = 'a'.repeat(200);
    shelf.lang = 'not a language';
    shelf.due = '2026-02-31';
    const result = read(doc).shelves[0]!;
    expect(result.description).toHaveLength(500);
    expect(result.author).toHaveLength(80);
    expect(result).not.toHaveProperty('lang');
    expect(result).not.toHaveProperty('due');
  });

  it('keep minutes between 1 and 600 as a whole number', () => {
    const doc = document();
    const links = doc.bookmarks as Array<Record<string, unknown>>;
    links[0]!.minutes = 9000;
    links[1]!.minutes = 0;
    const result = read(doc).bookmarks;
    expect(result[0]?.minutes).toBe(600);
    expect(result[1]).not.toHaveProperty('minutes');
    links[0]!.minutes = 7.6;
    expect(read(doc).bookmarks[0]?.minutes).toBe(8);
  });

  it('store required only when it is false', () => {
    const doc = document();
    const links = doc.bookmarks as Array<Record<string, unknown>>;
    links[0]!.required = true;
    links[1]!.required = 'no';
    for (const bookmark of read(doc).bookmarks) expect(bookmark).not.toHaveProperty('required');
  });

  it('cut a private note at 2,000 characters and drop empty ones and notes for missing links', () => {
    const doc = document();
    doc.notes = { b1: 'n'.repeat(2500), b2: '   ', ghost: 'lost' };
    const { notes } = read(doc);
    expect(Object.keys(notes)).toEqual(['b1']);
    expect(notes.b1).toHaveLength(2000);
  });

  it('drop done marks for missing links and repair a time that is not a date', () => {
    const doc = document();
    doc.done = { b1: 'yesterday', ghost: '2026-02-01T10:00:00.000Z' };
    const { done } = read(doc);
    expect(Object.keys(done)).toEqual(['b1']);
    expect(done.b1).toBe('2026-01-01T00:00:00.000Z');
  });

  it('drop an origin that is malformed', () => {
    const doc = document();
    (doc.shelves as Array<Record<string, unknown>>)[0]!.origin = { shelfId: 'x', revision: 0 };
    (doc.bookmarks as Array<Record<string, unknown>>)[0]!.origin = { shelfId: 'x' };
    const result = read(doc);
    expect(result.shelves[0]).not.toHaveProperty('origin');
    expect(result.bookmarks[0]).not.toHaveProperty('origin');
  });

  it('limit the text size step and refuse an unknown sort in the session', () => {
    const doc = document();
    doc.session = { shelfId: null, focusId: null, openId: null, view: 'shelf', variant: 'paper', textScale: 99, sort: 'random' };
    const { session } = read(doc);
    expect(session.textScale).toBe(4);
    expect(session).not.toHaveProperty('sort');
  });

  it('apply the same limits to session patches', () => {
    const { store } = makeRig();
    store.setSession({ textScale: -3, sort: 'shortest' });
    expect(store.session()).toMatchObject({ textScale: 0, sort: 'shortest' });
    store.setSession({ sort: 'bogus' as never, textScale: Number.NaN });
    expect(store.session()).toMatchObject({ textScale: 0, sort: 'shortest' });
    const lib = store.snapshot();
    expect(applySessionPatch(lib, { sort: 'title' })).toBe(true);
    expect(applySessionPatch(lib, { sort: 'title' })).toBe(false);
  });
});

describe('cover fields', () => {
  it('clamp cloth and pattern to lower-case letters, digits and hyphens, 24 at most', () => {
    const doc = document();
    (doc.bookmarks as Array<Record<string, unknown>>)[0]!.cover = {
      cloth: 'Deep Blue!!',
      pattern: 'x'.repeat(40),
      seed: 5,
    };
    const { cover } = read(doc).bookmarks[0]!;
    expect(cover.cloth).toBe('deepblue');
    expect(cover.pattern).toBe('x'.repeat(24));
  });

  it('keep the seed an integer from 0 to 2,147,483,647', () => {
    const doc = document();
    const links = doc.bookmarks as Array<Record<string, unknown>>;
    links[0]!.cover = { cloth: 'ink', pattern: 'arcs', seed: 4294967295.7 };
    links[1]!.cover = { cloth: 'ink', pattern: 'arcs', seed: -12.4 };
    const [first, second] = read(doc).bookmarks;
    expect(first?.cover.seed).toBeGreaterThanOrEqual(0);
    expect(first?.cover.seed).toBeLessThanOrEqual(2147483647);
    expect(Number.isInteger(first?.cover.seed)).toBe(true);
    expect(second?.cover.seed).toBe(12);
  });

  it('give new links a default cover inside those bounds', () => {
    for (const text of ['', 'a', 'https://example.org/', 'https://example.com/long/path?x=1']) {
      const cover = defaultCover(text);
      expect(cover.seed).toBeGreaterThanOrEqual(0);
      expect(cover.seed).toBeLessThanOrEqual(2147483647);
    }
  });

  it('clamp a cover given when a link is added', () => {
    const { store } = makeRig();
    const added = store.addBookmark({ url: 'a.example.org', cover: { cloth: 'INK ', seed: 9e12 } });
    if (!added.ok) throw new Error('add failed');
    expect(added.value.cover.cloth).toBe('ink');
    expect(added.value.cover.seed).toBeLessThanOrEqual(2147483647);
  });
});

describe('required and minutes on a link', () => {
  it('can be set, changed and cleared', () => {
    const { store } = makeRig();
    const added = store.addBookmark({ url: 'a.example.org', required: false, minutes: 15 });
    if (!added.ok) throw new Error('add failed');
    expect(added.value).toMatchObject({ required: false, minutes: 15 });

    const back = store.updateBookmark(added.value.id, { required: true, minutes: null });
    if (!back.ok) throw new Error('update failed');
    expect(back.value).not.toHaveProperty('required');
    expect(back.value).not.toHaveProperty('minutes');
  });

  it('refuse a reading time that is not a whole number from 1 to 600', () => {
    const { store } = makeRig();
    for (const minutes of [0, 601, 2.5, Number.NaN]) {
      expect(store.addBookmark({ url: 'a.example.org', minutes })).toMatchObject({
        ok: false,
        error: { code: 'invalid-minutes', field: 'minutes' },
      });
    }
    expect(store.bookmarks()).toEqual([]);
  });
});

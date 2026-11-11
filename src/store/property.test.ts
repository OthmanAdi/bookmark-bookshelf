import { describe, expect, it } from 'vitest';
import { LIBRARY_VERSION, createMemoryStorage, createStore, migrateLibrary, urlKey } from './index';
import type { LibraryV1, LibraryV2, Store } from './index';
import { counterIds, testClock } from './test-helpers';

/** Small seeded generator (mulberry32), so a failing run can be repeated from its seed. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Dice {
  int(max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
}

function dice(seed: number): Dice {
  const next = random(seed);
  return {
    int: (max) => Math.floor(next() * max),
    chance: (probability) => next() < probability,
    pick: (items) => items[Math.floor(next() * items.length)] as (typeof items)[number],
  };
}

const WORDS = ['river', 'Zürich', '東京', 'paper', 'Über', 'method', 'notes', 'a-b', 'x', 'Écho', 'data', 'tide'];
const HOSTS = ['example.org', 'www.example.com', 'example.net', 'docs.example.org', 'Example.EDU'];
const CLOTHS = ['ink', 'bone', 'rust', 'moss', 'plum', 'ochre', 'slate', 'teal'];
const PATTERNS = ['arcs', 'bars', 'dots', 'rays', 'tiles', 'waves'];
const MODES = ['manual', 'added-new', 'added-old', 'title', 'source', 'unread-first', 'shortest'] as const;

function words(d: Dice, count: number): string {
  return Array.from({ length: count }, () => d.pick(WORDS)).join(' ');
}

function address(d: Dice, index: number): string {
  const path = `/p${index}${d.chance(0.3) ? '/' : ''}`;
  const query = d.chance(0.3) ? `?id=${d.int(5)}${d.chance(0.4) ? '&utm_source=mail' : ''}` : '';
  return `https://${d.pick(HOSTS)}${path}${query}`;
}

function makeStore(seed: number, storage = createMemoryStorage()): Store {
  return createStore({
    storage,
    now: testClock().now,
    idFactory: counterIds(`g${seed}`),
    syncTabs: false,
    progressDelay: 60_000,
  });
}

/** A library with a bit of everything, built only through the store's own operations. */
function generate(seed: number): Store {
  const d = dice(seed);
  const store = makeStore(seed);
  const shelfIds = store.shelves().map((shelf) => shelf.id);
  for (let i = 0; i < d.int(4); i += 1) {
    const shelf = store.addShelf(`${words(d, 1 + d.int(2))} ${i}`);
    if (!shelf.ok) continue;
    shelfIds.push(shelf.value.id);
    if (d.chance(0.6)) {
      store.updateShelf(shelf.value.id, {
        description: words(d, 6),
        author: words(d, 2),
        lang: d.pick(['en', 'de', 'de-AT']),
        due: '2026-03-31',
      });
    }
  }
  const ids: string[] = [];
  for (let i = 0; i < 3 + d.int(14); i += 1) {
    const added = store.addBookmark({
      url: address(d, i),
      title: d.chance(0.8) ? words(d, 1 + d.int(4)) : '',
      shelfId: d.pick(shelfIds),
      ...(d.chance(0.5) ? { note: words(d, 5) } : {}),
      ...(d.chance(0.4) ? { author: words(d, 2) } : {}),
      ...(d.chance(0.5) ? { tags: [words(d, 1), words(d, 1)] } : {}),
      ...(d.chance(0.4) ? { readingText: `${words(d, 30)}\n\n${words(d, 40)}` } : {}),
      ...(d.chance(0.3) ? { required: false } : {}),
      ...(d.chance(0.3) ? { minutes: 1 + d.int(600) } : {}),
      ...(d.chance(0.5) ? { cover: { cloth: d.pick(CLOTHS), pattern: d.pick(PATTERNS), seed: d.int(2147483647) } } : {}),
    });
    if (added.ok) ids.push(added.value.id);
  }
  for (const id of ids) {
    if (d.chance(0.4)) store.setProgress(id, { block: d.int(30), ratio: d.int(100) / 100, percent: d.int(100) / 100 });
    if (d.chance(0.3)) store.setDone(id, true);
    if (d.chance(0.3)) store.setNote(id, words(d, 8));
  }
  for (let i = 0; i < d.int(4); i += 1) {
    const id = d.pick(ids);
    store.moveBookmark(id, { shelfId: d.pick(shelfIds), index: d.int(5) });
  }
  if (ids.length > 0 && d.chance(0.5)) store.removeBookmarks([d.pick(ids)]);
  store.setSession({
    shelfId: d.chance(0.5) ? d.pick(shelfIds) : null,
    focusId: ids.length > 0 && d.chance(0.7) ? d.pick(ids) : null,
    view: d.pick(['shelf', 'list'] as const),
    variant: d.pick(['paper', 'oak', 'night', 'pocket']),
    textScale: d.int(5),
    sort: d.pick(MODES),
  });
  return store;
}

const SEEDS = Array.from({ length: 60 }, (_, index) => index + 1);

describe('any library survives export and import in replace mode unchanged', () => {
  it.each(SEEDS)('seed %i', (seed) => {
    const source = generate(seed);
    const text = source.exportLibrary();

    const target = makeStore(seed + 1000);
    const added = target.addBookmark({ url: 'https://unrelated.example/one', title: 'Unrelated' });
    expect(added.ok).toBe(true);
    const result = target.importLibrary(text, 'replace');
    expect(result.ok).toBe(true);

    expect(target.snapshot()).toEqual(source.snapshot());
    expect(JSON.parse(target.exportLibrary())).toEqual(JSON.parse(text));

    const again = makeStore(seed + 2000);
    again.importLibrary(target.exportLibrary(), 'replace');
    expect(again.exportLibrary()).toBe(target.exportLibrary());
  });

  it.each(SEEDS.slice(0, 20))('seed %i, through storage and a new store', (seed) => {
    const storage = createMemoryStorage();
    const source = generate(seed);
    const target = makeStore(seed, storage);
    target.importLibrary(source.exportLibrary(), 'replace');
    target.flush();
    expect(createStore({ storage, syncTabs: false }).snapshot()).toEqual(source.snapshot());
  });
});

describe('merge never changes a link that is already saved', () => {
  it.each(SEEDS)('seed %i', (seed) => {
    const d = dice(seed * 7919);
    const mine = generate(seed);
    const before = mine.snapshot();

    const theirs = generate(seed + 5000);
    const incoming = theirs.snapshot();
    // Some of their links are mine under another spelling, with different details.
    for (const link of incoming.bookmarks) {
      if (d.chance(0.35) && before.bookmarks.length > 0) {
        const target = d.pick(before.bookmarks);
        link.url = `${target.url.replace('https://', 'https://www.')}#section`;
        link.title = 'Different title';
        link.note = 'Different note';
        delete link.reading;
      }
    }
    const result = mine.importLibrary(incoming, 'merge');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = mine.snapshot();
    const byId = new Map(after.bookmarks.map((link) => [link.id, link]));
    for (const link of before.bookmarks) expect(byId.get(link.id)).toEqual(link);

    expect(after.progress).toEqual(before.progress);
    expect(after.done).toEqual(before.done);
    expect(after.notes).toEqual(before.notes);
    expect(after.session).toEqual(before.session);
    for (const shelf of before.shelves) {
      expect(after.shelves.find((item) => item.id === shelf.id)).toEqual(shelf);
    }
    expect(after.bookmarks.length).toBe(before.bookmarks.length + result.value.added);

    const knownBefore = new Set(before.bookmarks.map((link) => urlKey(link.url)));
    const added = after.bookmarks.filter((link) => !before.bookmarks.some((old) => old.id === link.id));
    expect(added.every((link) => !knownBefore.has(urlKey(link.url)))).toBe(true);
    expect(result.value.added + result.value.unchanged + result.value.skipped.length).toBe(incoming.bookmarks.length);

    expect(mine.importLibrary(incoming, 'merge')).toMatchObject({ ok: true });
  });
});

/** Rules every library the store holds has to satisfy, whatever went into it. */
function expectValid(library: LibraryV2): void {
  expect(library.format).toBe('bookmark-bookshelf');
  expect(library.version).toBe(LIBRARY_VERSION);
  expect(library.shelves.length).toBeGreaterThan(0);

  const shelfIds = library.shelves.map((shelf) => shelf.id);
  const linkIds = library.bookmarks.map((link) => link.id);
  expect(new Set(shelfIds).size).toBe(shelfIds.length);
  expect(new Set(linkIds).size).toBe(linkIds.length);
  for (const id of [...shelfIds, ...linkIds]) expect(id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  expect(library.shelves.map((shelf) => shelf.order)).toEqual(library.shelves.map((_, index) => index));
  expect(new Set(library.shelves.map((shelf) => shelf.name.toLowerCase())).size).toBe(shelfIds.length);

  for (const shelf of library.shelves) {
    const links = library.bookmarks.filter((link) => link.shelfId === shelf.id);
    expect(links.map((link) => link.order)).toEqual(links.map((_, index) => index));
    if (shelf.description !== undefined) expect(shelf.description.length).toBeLessThanOrEqual(500);
    if (shelf.author !== undefined) expect(shelf.author.length).toBeLessThanOrEqual(80);
    if (shelf.lang !== undefined) expect(shelf.lang).toMatch(/^[A-Za-z0-9-]{1,12}$/);
    if (shelf.due !== undefined) expect(shelf.due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }
  for (const link of library.bookmarks) {
    expect(shelfIds).toContain(link.shelfId);
    expect(link.url).toMatch(/^https?:\/\//);
    expect(link.url.length).toBeLessThanOrEqual(2048);
    expect(link.title.length).toBeGreaterThan(0);
    expect(link.title.length).toBeLessThanOrEqual(300);
    expect(link.cover.cloth).toMatch(/^[a-z0-9-]{1,24}$/);
    expect(link.cover.pattern).toMatch(/^[a-z0-9-]{1,24}$/);
    expect(Number.isInteger(link.cover.seed)).toBe(true);
    expect(link.cover.seed).toBeGreaterThanOrEqual(0);
    expect(link.cover.seed).toBeLessThanOrEqual(2147483647);
    if (link.minutes !== undefined) {
      expect(Number.isInteger(link.minutes) && link.minutes >= 1 && link.minutes <= 600).toBe(true);
    }
    if (link.required !== undefined) expect(link.required).toBe(false);
    expect(Number.isNaN(Date.parse(link.addedAt))).toBe(false);
  }
  for (const map of [library.progress, library.done, library.notes]) {
    for (const id of Object.keys(map)) expect(linkIds).toContain(id);
  }
  for (const note of Object.values(library.notes)) {
    expect(note.length).toBeGreaterThan(0);
    expect(note.length).toBeLessThanOrEqual(2000);
  }
  for (const at of Object.values(library.done)) expect(Number.isNaN(Date.parse(at))).toBe(false);
  const { session } = library;
  if (session.shelfId !== null) expect(shelfIds).toContain(session.shelfId);
  if (session.focusId !== null) expect(linkIds).toContain(session.focusId);
  if (session.openId !== null) expect(linkIds).toContain(session.openId);
  if (session.textScale !== undefined) expect([0, 1, 2, 3, 4]).toContain(session.textScale);
}

/** What the version 1 build wrote: no field that did not exist then. */
function asVersion1(library: LibraryV2): LibraryV1 {
  const { done: _done, notes: _notes, ...rest } = library;
  return {
    ...rest,
    version: 1,
    shelves: library.shelves.map(({ id, name, order }) => ({ id, name, order })),
    bookmarks: library.bookmarks.map((link) => {
      const { required: _r, minutes: _m, origin: _o, ...old } = link;
      return old;
    }),
    session: {
      shelfId: library.session.shelfId,
      focusId: library.session.focusId,
      openId: library.session.openId,
      view: library.session.view,
      variant: library.session.variant,
    },
  };
}

describe('migration of a valid version 1 library gives a valid version 2 library', () => {
  it.each(SEEDS)('seed %i', (seed) => {
    const v1 = asVersion1(generate(seed).snapshot());
    const options = { now: testClock().now, idFactory: counterIds('m') };
    const result = migrateLibrary(JSON.parse(JSON.stringify(v1)) as unknown, options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expectValid(result.value);
    expect(result.value).toEqual({ ...v1, version: 2, done: {}, notes: {} });

    const again = migrateLibrary(result.value, options);
    expect(again.ok && again.value).toEqual(result.value);
  });
});

describe('migration of damaged libraries still gives a valid library', () => {
  it.each(SEEDS)('seed %i', (seed) => {
    const d = dice(seed * 31);
    const doc = JSON.parse(JSON.stringify(asVersion1(generate(seed).snapshot()))) as Record<string, unknown>;
    const links = doc.bookmarks as Array<Record<string, unknown>>;
    const shelves = doc.shelves as Array<Record<string, unknown>>;
    for (const link of links) {
      if (d.chance(0.15)) link.id = d.pick(['constructor', '__proto__', 'bad id', '', 'x'.repeat(80), 7]);
      if (d.chance(0.1)) link.shelfId = 'gone';
      if (d.chance(0.1)) link.url = d.pick(['javascript:alert(1)', 'nonsense', 'https://u:p@example.org/', 42]);
      if (d.chance(0.1)) link.cover = { cloth: 'Deep Blue!', pattern: 'x'.repeat(50), seed: 9e15 };
      if (d.chance(0.1)) link.order = d.pick([NaN, -4, 'last', 1e9]);
      if (d.chance(0.1)) link.minutes = d.pick([0, 9999, 'long']);
    }
    if (shelves.length > 0 && d.chance(0.5)) shelves[0] = { ...shelves[0], id: d.pick(['bad id', '__proto__']) };
    if (d.chance(0.3)) links.push(...links.slice(0, 2));
    doc.version = 2;
    doc.done = { [String(links[0]?.id)]: 'sometime', ghost: '2026-01-01T00:00:00.000Z' };
    doc.notes = { [String(links[0]?.id)]: 'n'.repeat(3000), ghost: 'lost' };
    doc.session = { shelfId: 'gone', focusId: String(links[0]?.id), openId: 'gone', view: 'carousel', textScale: 99, sort: 'random' };

    const result = migrateLibrary(doc, { now: testClock().now, idFactory: counterIds('m') });
    expect(result.ok).toBe(true);
    if (result.ok) expectValid(result.value);
  });
});

describe('the generated libraries are varied enough to mean something', () => {
  it('cover links, text, done marks, notes, progress, shelf details and optional links', () => {
    const libraries = SEEDS.map((seed) => generate(seed).snapshot());
    const sum = (count: (library: LibraryV2) => number): number => libraries.reduce((total, library) => total + count(library), 0);
    expect(sum((library) => library.bookmarks.length)).toBeGreaterThan(300);
    expect(sum((library) => library.bookmarks.filter((link) => link.reading).length)).toBeGreaterThan(50);
    expect(sum((library) => library.bookmarks.filter((link) => link.required === false).length)).toBeGreaterThan(20);
    expect(sum((library) => library.bookmarks.filter((link) => link.minutes !== undefined).length)).toBeGreaterThan(20);
    expect(sum((library) => Object.keys(library.done).length)).toBeGreaterThan(30);
    expect(sum((library) => Object.keys(library.notes).length)).toBeGreaterThan(30);
    expect(sum((library) => Object.keys(library.progress).length)).toBeGreaterThan(30);
    expect(sum((library) => library.shelves.filter((shelf) => shelf.description !== undefined).length)).toBeGreaterThan(20);
    expect(sum((library) => library.shelves.length)).toBeGreaterThan(120);
  });
});

import { describe, expect, it } from 'vitest';
import type { Bookmark, Shelf } from './types';
import type { FoldersPatchOptions, ImportFolder } from './folders-to-library';
import { IMPORT_LIMIT, foldersToLibraryPatch } from './folders-to-library';
import { defaultCover } from './cover';
import { counterIds } from './test-helpers';

const NOW = new Date('2026-06-01T12:00:00.000Z');

function options(extra: Partial<FoldersPatchOptions> = {}): FoldersPatchOptions {
  return { now: NOW, newId: counterIds('new'), coverFor: defaultCover, mergeIntoExistingShelfNames: true, ...extra };
}

function link(n: number, extra: Partial<ImportFolder['links'][number]> = {}) {
  return { url: `https://example.org/${n}`, title: `Link ${n}`, ...extra };
}

function existingBookmark(id: string, url: string, shelfId: string, order: number): Bookmark {
  return {
    id,
    url,
    title: id,
    tags: [],
    shelfId,
    order,
    addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    cover: defaultCover(url),
  };
}

const EXISTING_SHELVES: Shelf[] = [
  { id: 's1', name: 'Reading', order: 0 },
  { id: 's2', name: 'Later', order: 1 },
];

const EXISTING_BOOKMARKS: Bookmark[] = [
  existingBookmark('b1', 'https://example.org/1', 's1', 0),
  existingBookmark('b2', 'https://example.org/2', 's1', 1),
];

const existing = { shelves: EXISTING_SHELVES, bookmarks: EXISTING_BOOKMARKS };
const empty = { shelves: [] as Shelf[], bookmarks: [] as Bookmark[] };

describe('foldersToLibraryPatch', () => {
  it('turns folders into new shelves and volumes in file order', () => {
    const patch = foldersToLibraryPatch(
      [
        { name: 'Alpha', links: [link(1, { addedAt: '2024-05-05T10:00:00.000Z' }), link(2)] },
        { name: 'Beta', links: [link(3)] },
      ],
      empty,
      options(),
    );
    expect(patch.shelves).toEqual([
      { id: 'new-1', name: 'Alpha', order: 0 },
      { id: 'new-4', name: 'Beta', order: 1 },
    ]);
    expect(patch.bookmarks.map((item) => [item.id, item.title, item.shelfId, item.order])).toEqual([
      ['new-2', 'Link 1', 'new-1', 0],
      ['new-3', 'Link 2', 'new-1', 1],
      ['new-5', 'Link 3', 'new-4', 0],
    ]);
    expect(patch.summary).toEqual({ added: 3, unchanged: 0, shelvesAdded: 2, skipped: [] });
  });

  it('fills in the fields of a volume from the file, the clock and the cover function', () => {
    const patch = foldersToLibraryPatch([{ name: 'A', links: [link(1, { addedAt: '2024-05-05T10:00:00.000Z' }), link(2)] }], empty, options());
    expect(patch.bookmarks[0]).toEqual({
      id: 'new-2',
      url: 'https://example.org/1',
      title: 'Link 1',
      tags: [],
      shelfId: 'new-1',
      order: 0,
      addedAt: '2024-05-05T10:00:00.000Z',
      updatedAt: NOW.toISOString(),
      cover: defaultCover('https://example.org/1'),
    });
    expect(patch.bookmarks[1]?.addedAt).toBe(NOW.toISOString());
  });

  it('uses the cover function it is given', () => {
    const patch = foldersToLibraryPatch([{ name: 'A', links: [link(1)] }], empty, options({ coverFor: (text) => ({ cloth: 'ink', pattern: 'dots', seed: text.length }) }));
    expect(patch.bookmarks[0]?.cover).toEqual({ cloth: 'ink', pattern: 'dots', seed: 'https://example.org/1'.length });
  });

  it('puts a folder on the existing shelf with the same name, in any case, after what is there', () => {
    const patch = foldersToLibraryPatch([{ name: 'reading', links: [link(10), link(11)] }], existing, options());
    expect(patch.shelves).toEqual([]);
    expect(patch.bookmarks.map((item) => [item.shelfId, item.order])).toEqual([
      ['s1', 2],
      ['s1', 3],
    ]);
    expect(patch.summary.shelvesAdded).toBe(0);
  });

  it('starts a new shelf for every folder when merging into existing names is off, renaming clashes', () => {
    const patch = foldersToLibraryPatch(
      [
        { name: 'Reading', links: [link(10)] },
        { name: 'READING', links: [link(11)] },
        { name: 'Later', links: [link(12)] },
      ],
      existing,
      options({ mergeIntoExistingShelfNames: false }),
    );
    expect(patch.shelves.map((shelf) => shelf.name)).toEqual(['Reading (2)', 'READING (3)', 'Later (2)']);
    expect(patch.shelves.map((shelf) => shelf.order)).toEqual([2, 3, 4]);
    expect(patch.bookmarks.every((item) => item.order === 0)).toBe(true);
  });

  it('keeps a renamed shelf within the 60 character limit', () => {
    const name = 'n'.repeat(60);
    const patch = foldersToLibraryPatch(
      [{ name, links: [link(1)] }],
      { shelves: [{ id: 'x', name, order: 0 }], bookmarks: [] },
      options({ mergeIntoExistingShelfNames: false }),
    );
    expect(patch.shelves[0]?.name).toHaveLength(60);
    expect(patch.shelves[0]?.name.endsWith(' (2)')).toBe(true);
  });

  it('leaves a volume whose address exists anywhere in the library, and counts it unchanged', () => {
    const patch = foldersToLibraryPatch([{ name: 'Later', links: [link(1, { title: 'Changed title' }), link(20)] }], existing, options());
    expect(patch.bookmarks.map((item) => item.url)).toEqual(['https://example.org/20']);
    expect(patch.summary).toMatchObject({ added: 1, unchanged: 1 });
    expect(EXISTING_BOOKMARKS[0]?.title).toBe('b1');
  });

  it('does not create a shelf when every volume of its folder already exists', () => {
    const patch = foldersToLibraryPatch([{ name: 'Brand new', links: [link(1), link(2)] }], existing, options());
    expect(patch.shelves).toEqual([]);
    expect(patch.bookmarks).toEqual([]);
    expect(patch.summary).toEqual({ added: 0, unchanged: 2, shelvesAdded: 0, skipped: [] });
  });

  it('adds an address that appears twice in the file once', () => {
    const patch = foldersToLibraryPatch(
      [
        { name: 'A', links: [link(5), link(5, { title: 'Again' })] },
        { name: 'B', links: [link(5), link(6)] },
      ],
      empty,
      options(),
    );
    expect(patch.bookmarks.map((item) => item.url)).toEqual(['https://example.org/5', 'https://example.org/6']);
    expect(patch.summary).toMatchObject({ added: 2, unchanged: 2, shelvesAdded: 2 });
  });

  it('removes tracking parameters, and sees through them when looking for duplicates', () => {
    const patch = foldersToLibraryPatch(
      [{ name: 'A', links: [{ url: 'https://example.org/1?utm_source=news&fbclid=x', title: 'Tracked' }, { url: 'https://example.org/p?a=1&gclid=2', title: 'P' }] }],
      existing,
      options(),
    );
    expect(patch.bookmarks.map((item) => item.url)).toEqual(['https://example.org/p?a=1']);
    expect(patch.summary.unchanged).toBe(1);
  });

  it('sees through tracking parameters on a volume already in the library', () => {
    const tracked = { shelves: EXISTING_SHELVES, bookmarks: [existingBookmark('t', 'https://example.org/9?utm_medium=x', 's1', 0)] };
    const patch = foldersToLibraryPatch([{ name: 'A', links: [link(9)] }], tracked, options());
    expect(patch.summary).toMatchObject({ added: 0, unchanged: 1 });
  });

  it('takes at most 5,000 volumes and reports the rest as skipped', () => {
    const links = Array.from({ length: IMPORT_LIMIT + 120 }, (_value, i) => link(1000 + i));
    const patch = foldersToLibraryPatch([{ name: 'Big', links: [...links, link(1), link(1000)] }], existing, options());
    expect(patch.bookmarks).toHaveLength(5000);
    expect(patch.summary.added).toBe(5000);
    expect(patch.summary.skipped).toHaveLength(120);
    expect(patch.summary.skipped[0]).toEqual({ title: 'Link 6000', url: 'https://example.org/6000', reason: 'over the limit of 5,000' });
    expect(patch.summary.unchanged).toBe(2);
  });

  it('does not start a shelf for a folder that only holds volumes over the limit', () => {
    const first = Array.from({ length: IMPORT_LIMIT }, (_value, i) => link(1000 + i));
    const patch = foldersToLibraryPatch([{ name: 'A', links: first }, { name: 'B', links: [link(9000)] }], empty, options());
    expect(patch.shelves.map((shelf) => shelf.name)).toEqual(['A']);
    expect(patch.summary.skipped).toHaveLength(1);
  });

  it('clamps a date in the future to now and ignores one that cannot be read', () => {
    const patch = foldersToLibraryPatch(
      [{ name: 'A', links: [link(1, { addedAt: '2030-01-01T00:00:00.000Z' }), link(2, { addedAt: 'later' })] }],
      empty,
      options(),
    );
    expect(patch.bookmarks.map((item) => item.addedAt)).toEqual([NOW.toISOString(), NOW.toISOString()]);
  });

  it('falls back to the host for an empty title and clips a long one to 300 characters', () => {
    const patch = foldersToLibraryPatch(
      [{ name: 'A', links: [{ url: 'https://www.example.org/x', title: '' }, link(2, { title: 't'.repeat(500) })] }],
      empty,
      options(),
    );
    expect(patch.bookmarks[0]?.title).toBe('example.org');
    expect(patch.bookmarks[1]?.title).toHaveLength(300);
  });

  it('names an unnamed folder Imported and clips a long folder name to 60 characters', () => {
    const patch = foldersToLibraryPatch(
      [{ name: '  ', links: [link(1)] }, { name: 'f'.repeat(100), links: [link(2)] }],
      empty,
      options(),
    );
    expect(patch.shelves.map((shelf) => shelf.name)).toEqual(['Imported', 'f'.repeat(60)]);
  });

  it('skips an address that is not valid with a reason', () => {
    const patch = foldersToLibraryPatch([{ name: 'A', links: [{ url: 'javascript:alert(1)', title: 'Bad' }, link(1)] }], empty, options());
    expect(patch.summary.skipped).toEqual([{ title: 'Bad', url: 'javascript:alert(1)', reason: 'not a valid address' }]);
    expect(patch.summary.added).toBe(1);
  });

  it('returns nothing for no folders and for empty folders', () => {
    expect(foldersToLibraryPatch([], existing, options())).toEqual({
      shelves: [],
      bookmarks: [],
      summary: { added: 0, unchanged: 0, shelvesAdded: 0, skipped: [] },
    });
    expect(foldersToLibraryPatch([{ name: 'Empty', links: [] }], existing, options()).shelves).toEqual([]);
  });

  it('does not change the library it is given', () => {
    const snapshot = structuredClone(existing);
    foldersToLibraryPatch([{ name: 'Reading', links: [link(30)] }, { name: 'New', links: [link(31)] }], existing, options());
    expect(existing).toEqual(snapshot);
  });

  it('gives every new shelf and volume its own id', () => {
    const patch = foldersToLibraryPatch(
      [{ name: 'A', links: [link(1), link(2)] }, { name: 'B', links: [link(3)] }],
      empty,
      options(),
    );
    const ids = [...patch.shelves.map((shelf) => shelf.id), ...patch.bookmarks.map((item) => item.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

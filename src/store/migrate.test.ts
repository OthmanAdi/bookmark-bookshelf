import { describe, expect, it } from 'vitest';
import { emptyLibrary, migrateLibrary } from './index';
import type { LibraryV1 } from './index';
import { counterIds, testClock } from './test-helpers';

const options = () => ({ now: testClock().now, idFactory: counterIds('m') });

function validV1(): LibraryV1 {
  return {
    format: 'bookmark-bookshelf',
    version: 1,
    shelves: [
      { id: 's1', name: 'First', order: 0 },
      { id: 's2', name: 'Second', order: 1 },
    ],
    bookmarks: [
      {
        id: 'b1',
        url: 'https://example.com/',
        title: 'Example',
        note: 'hello',
        tags: ['a'],
        shelfId: 's2',
        order: 0,
        addedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        cover: { cloth: 'ink', pattern: 'arcs', seed: 5 },
        reading: { format: 'markdown-lite', text: 'body', savedAt: '2026-01-02T00:00:00.000Z' },
      },
    ],
    progress: { b1: { block: 2, ratio: 0.5, percent: 0.3, updatedAt: '2026-01-03T00:00:00.000Z' } },
    session: { shelfId: 's2', focusId: 'b1', openId: 'b1', view: 'list', variant: 'night' },
  };
}

function migrated(raw: unknown): LibraryV1 {
  const result = migrateLibrary(raw, options());
  if (!result.ok) throw new Error(`migration failed: ${result.error.code}`);
  return result.value;
}

describe('migrateLibrary version 1', () => {
  it('keeps a valid document unchanged', () => {
    const doc = validV1();
    expect(migrated(doc)).toEqual(doc);
  });

  it('accepts JSON text of a document', () => {
    const doc = validV1();
    expect(migrated(JSON.stringify(doc))).toEqual(doc);
  });

  it('does not mutate its input', () => {
    const doc = validV1();
    const copy = structuredClone(doc);
    migrateLibrary({ ...doc, session: { ...doc.session, focusId: 'nope' } }, options());
    expect(doc).toEqual(copy);
  });

  it('drops unknown fields at every level', () => {
    const doc = validV1() as unknown as Record<string, unknown>;
    doc.extra = 1;
    (doc.shelves as Record<string, unknown>[])[0]!.color = 'red';
    (doc.bookmarks as Record<string, unknown>[])[0]!.secret = 'x';
    ((doc.bookmarks as Record<string, Record<string, unknown>>[])[0]!.cover as Record<string, unknown>).extra = 1;
    const result = migrated(doc);
    expect(result).toEqual(validV1());
    expect(result).not.toHaveProperty('extra');
  });

  it('skips bad bookmarks and keeps good ones', () => {
    const doc = validV1() as unknown as { bookmarks: unknown[] };
    doc.bookmarks.push(
      null,
      'text',
      { id: 'x1', url: 'javascript:alert(1)' },
      { id: 'x2' },
      { url: 'https://no-id.com' },
      { id: 'x3', url: 'https://long.com', title: 't'.repeat(301) },
      { id: 'b1', url: 'https://duplicate-id.com' },
    );
    const result = migrated(doc);
    expect(result.bookmarks.map((b) => b.id)).toEqual(['b1']);
  });

  it('reassigns dangling shelf ids to the first shelf and re-indexes', () => {
    const doc = validV1();
    doc.bookmarks[0]!.shelfId = 'gone';
    doc.bookmarks.push({ ...doc.bookmarks[0]!, id: 'b2', url: 'https://two.com/', order: 7 });
    const result = migrated(doc);
    expect(result.bookmarks.map((b) => [b.id, b.shelfId, b.order])).toEqual([
      ['b1', 's1', 0],
      ['b2', 's1', 1],
    ]);
  });

  it('resets session ids that point nowhere', () => {
    const doc = validV1();
    doc.session = { shelfId: 'gone', focusId: 'gone', openId: 'b1', view: 'list', variant: 'night' };
    expect(migrated(doc).session).toEqual({ shelfId: null, focusId: null, openId: 'b1', view: 'list', variant: 'night' });
  });

  it('drops progress for missing volumes, clamps it, and defaults a bad view', () => {
    const doc = validV1() as unknown as Record<string, unknown>;
    doc.progress = {
      b1: { block: -4, ratio: 3, percent: 'x', updatedAt: 'not a date' },
      ghost: { block: 1, ratio: 0, percent: 0, updatedAt: '2026-01-01T00:00:00.000Z' },
    };
    (doc.session as Record<string, unknown>).view = 'carousel';
    const result = migrated(doc);
    expect(Object.keys(result.progress)).toEqual(['b1']);
    expect(result.progress.b1).toMatchObject({ block: 0, ratio: 1, percent: 0 });
    expect(result.session.view).toBe('shelf');
  });

  it('repairs shelves: skips duplicates by name, creates a shelf when none are usable', () => {
    const doc = validV1();
    doc.shelves.push({ id: 's3', name: 'FIRST', order: 2 }, { id: 's1', name: 'Again', order: 3 });
    expect(migrated(doc).shelves.map((s) => s.id)).toEqual(['s1', 's2']);

    const empty = { ...validV1(), shelves: [] };
    const result = migrated(empty);
    expect(result.shelves).toHaveLength(1);
    expect(result.bookmarks[0]?.shelfId).toBe(result.shelves[0]?.id);
  });

  it('fills a missing title with the host name and normalises the URL', () => {
    const doc = validV1();
    doc.bookmarks[0] = { ...doc.bookmarks[0]!, url: 'www.example.org/x', title: '' };
    expect(migrated(doc).bookmarks[0]).toMatchObject({ url: 'https://www.example.org/x', title: 'example.org' });
  });
});

describe('migrateLibrary version 0', () => {
  it('turns a plain array into one Reading list shelf', () => {
    const result = migrated([
      { url: 'example.com', title: 'One', note: 'n', tags: ['a', 'A', 'b'] },
      { url: 'https://two.org/path' },
      { url: 'javascript:alert(1)', title: 'bad' },
      'plain.example.net',
      42,
    ]);
    expect(result.format).toBe('bookmark-bookshelf');
    expect(result.version).toBe(1);
    expect(result.shelves).toHaveLength(1);
    expect(result.shelves[0]?.name).toBe('Reading list');
    expect(result.bookmarks.map((b) => [b.title, b.url, b.order])).toEqual([
      ['One', 'https://example.com/', 0],
      ['two.org', 'https://two.org/path', 1],
      ['plain.example.net', 'https://plain.example.net/', 2],
    ]);
    expect(result.bookmarks[0]).toMatchObject({ note: 'n', tags: ['a', 'b'] });
    expect(result.bookmarks.every((b) => b.shelfId === result.shelves[0]?.id)).toBe(true);
    expect(new Set(result.bookmarks.map((b) => b.id)).size).toBe(3);
    expect(result.progress).toEqual({});
  });

  it('accepts JSON text and an empty array', () => {
    expect(migrated('[{"url":"a.com"}]').bookmarks).toHaveLength(1);
    const empty = migrated([]);
    expect(empty.bookmarks).toEqual([]);
    expect(empty.shelves).toHaveLength(1);
  });
});

describe('migrateLibrary errors', () => {
  it('rejects a higher version as unsupported-version', () => {
    const result = migrateLibrary({ ...validV1(), version: 2 });
    expect(result).toMatchObject({ ok: false, error: { code: 'unsupported-version' } });
    expect(migrateLibrary(JSON.stringify({ ...validV1(), version: 9 }))).toMatchObject({
      ok: false,
      error: { code: 'unsupported-version' },
    });
  });

  it.each([
    ['null', null],
    ['a number', 7],
    ['an object without format', { shelves: [], bookmarks: [] }],
    ['wrong format name', { ...validV1(), format: 'other' }],
    ['version zero as an object', { ...validV1(), version: 0 }],
    ['missing lists', { format: 'bookmark-bookshelf', version: 1 }],
    ['invalid JSON text', '{oops'],
    ['an empty string', ''],
    ['a JSON string', '"hello"'],
  ])('rejects %s as invalid-format', (_label, input) => {
    expect(migrateLibrary(input)).toMatchObject({ ok: false, error: { code: 'invalid-format' } });
  });
});

describe('emptyLibrary', () => {
  it('has one empty shelf and a default session', () => {
    const library = emptyLibrary(new Date('2026-01-01T00:00:00.000Z'));
    expect(library).toMatchObject({ format: 'bookmark-bookshelf', version: 1, bookmarks: [], progress: {} });
    expect(library.shelves).toHaveLength(1);
    expect(library.session).toEqual({ shelfId: null, focusId: null, openId: null, view: 'shelf', variant: 'default' });
    expect(migrated(library)).toEqual(library);
  });
});

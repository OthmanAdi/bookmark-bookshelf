import { describe, expect, it } from 'vitest';
import type { ShelfFile, ShelfFileSource } from './shelf-file';
import { SHELF_FILE_FORMAT, SHELF_FILE_VERSION, readShelfFile, shelfFileName, toShelfFile } from './shelf-file';

const OVERRIDE = String.fromCodePoint(0x202e);
const ZERO_WIDTH = String.fromCodePoint(0x200b);

function volume(n: number, extra: Partial<ShelfFileSource> = {}): ShelfFileSource {
  return {
    id: `v${n}`,
    url: `https://example.org/page/${n}`,
    title: `Page ${n}`,
    cover: { cloth: 'ink', pattern: 'arcs', seed: n },
    ...extra,
  };
}

function baseFile(volumes: unknown[] = [volume(1)]): Record<string, unknown> {
  return {
    format: SHELF_FILE_FORMAT,
    version: SHELF_FILE_VERSION,
    shelf: { id: 's1', name: 'Week 3', revision: 1 },
    volumes,
  };
}

function read(value: unknown) {
  return readShelfFile(value);
}

function readOk(value: unknown) {
  const result = readShelfFile(value);
  if (!result.ok) throw new Error(`expected a valid file, got ${result.error.code}: ${result.error.message}`);
  return result.value;
}

function errorOf(value: unknown): { code: string; field?: string } {
  const result = readShelfFile(value);
  if (result.ok) throw new Error('expected an error');
  return result.error;
}

describe('toShelfFile', () => {
  const shelf = { id: 's1', name: 'Week 3', description: 'Reading for class', lang: 'de', author: 'A. Teacher', due: '2026-03-31' };

  it('builds a file with the format, version and shelf details', () => {
    const file = toShelfFile({ shelf, bookmarks: [volume(1)], includeTexts: false, revision: 4 });
    expect(file.format).toBe('bookmark-bookshelf-shelf');
    expect(file.version).toBe(1);
    expect(file.shelf).toEqual({ ...shelf, revision: 4 });
  });

  it('defaults the revision to 1 and leaves out empty details', () => {
    const file = toShelfFile({ shelf: { id: 's1', name: 'Plain', description: '' }, bookmarks: [], includeTexts: false });
    expect(file.shelf).toEqual({ id: 's1', name: 'Plain', revision: 1 });
  });

  it('keeps only the listed shareable keys, whatever else a volume carries', () => {
    const personal = {
      ...volume(1, { author: 'Au', note: 'N', tags: ['a'], required: false, minutes: 9, reading: { text: 'T' } }),
      addedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      order: 0,
      shelfId: 's1',
      progress: { block: 3 },
      done: '2026-01-03T00:00:00.000Z',
      privateNote: 'for my eyes only',
      origin: { shelfId: 'x', volumeId: 'y' },
    };
    const file = toShelfFile({ shelf, bookmarks: [personal], includeTexts: true });
    const allowed = ['id', 'url', 'title', 'author', 'note', 'tags', 'required', 'minutes', 'cover', 'text'];
    expect(Object.keys(file.volumes[0] ?? {}).sort()).toEqual([...allowed].sort());
    expect(Object.keys(file.volumes[0]?.cover ?? {}).sort()).toEqual(['cloth', 'pattern', 'seed']);
    const json = JSON.stringify(file);
    for (const leaked of ['addedAt', 'updatedAt', 'progress', 'done', 'privateNote', 'origin', 'shelfId', 'for my eyes']) {
      expect(json).not.toContain(leaked);
    }
  });

  it('copies a cover instead of sharing the object', () => {
    const source = volume(1);
    const file = toShelfFile({ shelf, bookmarks: [source], includeTexts: false });
    expect(file.volumes[0]?.cover).toEqual(source.cover);
    expect(file.volumes[0]?.cover).not.toBe(source.cover);
  });

  it('includes reading texts only when asked', () => {
    const withText = volume(1, { reading: { text: 'Body text' } });
    expect(toShelfFile({ shelf, bookmarks: [withText], includeTexts: false }).volumes[0]).not.toHaveProperty('text');
    expect(toShelfFile({ shelf, bookmarks: [withText], includeTexts: true }).volumes[0]?.text).toBe('Body text');
  });

  it('keeps the order it is given and leaves out volumes of other shelves', () => {
    const file = toShelfFile({
      shelf,
      bookmarks: [
        volume(1, { shelfId: 's1', order: 2 }),
        volume(2, { shelfId: 's2', order: 0 }),
        volume(3, { shelfId: 's1', order: 0 }),
        volume(4, { shelfId: 's1', order: 1 }),
      ],
      includeTexts: false,
    });
    expect(file.volumes.map((item) => item.id)).toEqual(['v3', 'v4', 'v1']);
    const unordered = toShelfFile({ shelf, bookmarks: [volume(5), volume(4), volume(6)], includeTexts: false });
    expect(unordered.volumes.map((item) => item.id)).toEqual(['v5', 'v4', 'v6']);
  });

  it('does not change what it is given', () => {
    const source = volume(1, { tags: ['a', 'b'] });
    const copy = structuredClone(source);
    const file = toShelfFile({ shelf, bookmarks: [source], includeTexts: false });
    file.volumes[0]?.tags?.push('c');
    expect(source).toEqual(copy);
  });
});

describe('round trip', () => {
  it('reads back exactly what was written, through JSON text', () => {
    const file = toShelfFile({
      shelf: { id: 's1', name: 'Grüße aus Ägypten', description: 'Zeile 1\nZeile 2', lang: 'de-DE', author: 'Dr. Müller', due: '2026-12-31' },
      bookmarks: [
        volume(1, {
          author: 'Writer',
          note: 'Read this first',
          tags: ['history', 'week-3'],
          minutes: 20,
          required: true,
          reading: { text: '# Heading\n\nParagraph with „quotes“ and 🚀.' },
        }),
        volume(2, { required: false }),
        volume(3),
      ],
      includeTexts: true,
      revision: 7,
    });
    const result = readOk(JSON.stringify(file));
    expect(result.skipped).toEqual([]);
    expect(result.file).toEqual(file);
    expect(readOk(JSON.stringify(result.file, null, 2)).file).toEqual(file);
  });

  it('accepts an already parsed value', () => {
    const file = toShelfFile({ shelf: { id: 's1', name: 'N' }, bookmarks: [volume(1)], includeTexts: false });
    expect(readOk(file).file).toEqual(file);
    expect(readOk(JSON.parse(JSON.stringify(file))).file).toEqual(file);
  });

  it('accepts a leading byte order mark', () => {
    const text = String.fromCharCode(0xfeff) + JSON.stringify(baseFile());
    expect(read(text).ok).toBe(true);
  });
});

describe('readShelfFile problems with the file', () => {
  it('reports text that is not JSON', () => {
    expect(errorOf('this is not json').code).toBe('invalid-file');
    expect(errorOf('').code).toBe('invalid-file');
    expect(errorOf('{"format":').code).toBe('invalid-file');
  });

  it.each([null, undefined, 42, true, [], ['a'], 'null', '[]', '{}', '"text"'])('rejects %j', (value) => {
    expect(errorOf(value).code).toBe('not-a-shelf-file');
  });

  it('rejects another kind of file', () => {
    expect(errorOf({ format: 'bookmark-bookshelf', version: 2, shelves: [], bookmarks: [] }).code).toBe('not-a-shelf-file');
    expect(errorOf({ ...baseFile(), format: 'other' }).code).toBe('not-a-shelf-file');
  });

  it('answers unsupported-version for a higher version', () => {
    expect(errorOf({ ...baseFile(), version: 2 })).toMatchObject({ code: 'unsupported-version', field: 'version' });
    expect(errorOf({ ...baseFile(), version: 99 }).code).toBe('unsupported-version');
  });

  it.each([undefined, 0, -1, 1.5, '1', null])('rejects the version %j', (version) => {
    expect(errorOf({ ...baseFile(), version }).code).toBe('not-a-shelf-file');
  });

  it('needs a shelf with an id and a name', () => {
    expect(errorOf({ ...baseFile(), shelf: undefined }).code).toBe('invalid-shelf');
    expect(errorOf({ ...baseFile(), shelf: { name: 'N' } }).code).toBe('invalid-shelf');
    expect(errorOf({ ...baseFile(), shelf: { id: 's', name: '   ' } })).toMatchObject({ code: 'invalid-name', field: 'name' });
    expect(errorOf({ ...baseFile(), shelf: { id: 's', name: ZERO_WIDTH + OVERRIDE } }).code).toBe('invalid-name');
    expect(errorOf({ ...baseFile(), shelf: { id: '__proto__', name: 'N' } }).code).toBe('invalid-shelf');
    expect(errorOf({ ...baseFile(), shelf: { id: 'x'.repeat(101), name: 'N' } }).code).toBe('invalid-shelf');
  });

  it('needs a list of volumes', () => {
    const file = baseFile();
    delete file.volumes;
    expect(errorOf(file).code).toBe('invalid-file');
    expect(errorOf({ ...baseFile(), volumes: {} }).code).toBe('invalid-file');
  });
});

describe('readShelfFile bounds', () => {
  it('accepts 500 volumes and refuses 501', () => {
    const make = (count: number) => baseFile(Array.from({ length: count }, (_value, i) => volume(i)));
    expect(readOk(make(500)).file.volumes).toHaveLength(500);
    expect(errorOf(make(501))).toMatchObject({ code: 'too-many-volumes', field: 'volumes' });
  });

  it('refuses a file over 5 MB of JSON before parsing it', () => {
    const text = ` ${'x'.repeat(5 * 1024 * 1024)}`;
    expect(errorOf(text).code).toBe('file-too-large');
    const multibyte = ' '.repeat(10) + 'ü'.repeat(3 * 1024 * 1024);
    expect(errorOf(multibyte).code).toBe('file-too-large');
  });

  it('accepts a file just under the size limit', () => {
    const text = JSON.stringify(toShelfFile({ shelf: { id: 's', name: 'N' }, bookmarks: [volume(1, { reading: { text: 'word '.repeat(39000) } })], includeTexts: true }));
    expect(text.length).toBeLessThan(5 * 1024 * 1024);
    expect(read(text).ok).toBe(true);
  });

  it('limits the reading text per volume to 200,000 characters', () => {
    const exact = readOk(baseFile([{ ...volume(1), text: 'x'.repeat(200000) }]));
    expect(exact.file.volumes[0]?.text).toHaveLength(200000);
    const over = readOk(baseFile([{ ...volume(1), text: 'x'.repeat(200001) }, volume(2)]));
    expect(over.file.volumes.map((item) => item.id)).toEqual(['v2']);
    expect(over.skipped).toEqual([
      { title: 'Page 1', url: 'https://example.org/page/1', reason: 'reading text is longer than 200,000 characters' },
    ]);
  });

  it('limits the description to 500 and the author to 80 characters', () => {
    const shelf = (extra: Record<string, unknown>) => ({ ...baseFile(), shelf: { id: 's', name: 'N', ...extra } });
    expect(read(shelf({ description: 'd'.repeat(500) })).ok).toBe(true);
    expect(errorOf(shelf({ description: 'd'.repeat(501) }))).toMatchObject({ code: 'too-long', field: 'description' });
    expect(read(shelf({ author: 'a'.repeat(80) })).ok).toBe(true);
    expect(errorOf(shelf({ author: 'a'.repeat(81) }))).toMatchObject({ code: 'too-long', field: 'author' });
  });

  it('limits the shelf name to 60 characters', () => {
    expect(read({ ...baseFile(), shelf: { id: 's', name: 'n'.repeat(60) } }).ok).toBe(true);
    expect(errorOf({ ...baseFile(), shelf: { id: 's', name: 'n'.repeat(61) } }).code).toBe('too-long');
  });

  it('limits the language to 12 letters, digits and hyphens', () => {
    const shelf = (lang: unknown) => ({ ...baseFile(), shelf: { id: 's', name: 'N', lang } });
    expect(readOk(shelf('zh-Hant-TW')).file.shelf.lang).toBe('zh-Hant-TW');
    expect(readOk(shelf('')).file.shelf).not.toHaveProperty('lang');
    for (const bad of ['a'.repeat(13), 'de DE', 'de_DE', '"><b>', 5]) {
      expect(errorOf(shelf(bad)).code).toBe('invalid-lang');
    }
  });

  it('checks the due date is a real calendar day', () => {
    const shelf = (due: unknown) => ({ ...baseFile(), shelf: { id: 's', name: 'N', due } });
    expect(readOk(shelf('2028-02-29')).file.shelf.due).toBe('2028-02-29');
    for (const bad of ['2027-02-29', '2026-13-01', '31.03.2026', '2026-3-1', '2026-03-31T10:00:00Z', 20260331]) {
      expect(errorOf(shelf(bad)).code).toBe('invalid-due');
    }
  });

  it('checks the revision', () => {
    const shelf = (revision: unknown) => ({ ...baseFile(), shelf: { id: 's', name: 'N', revision } });
    expect(readOk(shelf(12)).file.shelf.revision).toBe(12);
    for (const bad of [0, -1, 1.5, '2', Number.NaN, 1e12]) {
      expect(errorOf(shelf(bad)).code).toBe('invalid-revision');
    }
    const file = baseFile();
    file.shelf = { id: 's', name: 'N' };
    expect(readOk(file).file.shelf.revision).toBe(1);
  });

  it('limits minutes to whole numbers from 1 to 600', () => {
    const one = (minutes: unknown) => readOk(baseFile([{ ...volume(1), minutes }]));
    expect(one(1).file.volumes[0]?.minutes).toBe(1);
    expect(one(600).file.volumes[0]?.minutes).toBe(600);
    for (const bad of [0, 601, 2.5, -3, '10', Number.NaN]) {
      const result = one(bad);
      expect(result.file.volumes).toEqual([]);
      expect(result.skipped[0]?.reason).toContain('minutes');
    }
  });

  it('limits title, author and note per volume', () => {
    expect(readOk(baseFile([{ ...volume(1), title: 't'.repeat(300) }])).file.volumes).toHaveLength(1);
    expect(readOk(baseFile([{ ...volume(1), title: 't'.repeat(301) }])).file.volumes).toHaveLength(0);
    expect(readOk(baseFile([{ ...volume(1), author: 'a'.repeat(200) }])).file.volumes).toHaveLength(1);
    expect(readOk(baseFile([{ ...volume(1), author: 'a'.repeat(201) }])).file.volumes).toHaveLength(0);
    expect(readOk(baseFile([{ ...volume(1), note: 'n'.repeat(5000) }])).file.volumes).toHaveLength(1);
    expect(readOk(baseFile([{ ...volume(1), note: 'n'.repeat(5001) }])).file.volumes).toHaveLength(0);
  });

  it('keeps at most 12 tags of at most 40 characters', () => {
    const tags = Array.from({ length: 20 }, (_value, i) => `tag${i}-${'x'.repeat(50)}`);
    const out = readOk(baseFile([{ ...volume(1), tags }])).file.volumes[0]?.tags ?? [];
    expect(out).toHaveLength(12);
    expect(out.every((tag) => tag.length <= 40)).toBe(true);
  });
});

describe('readShelfFile volumes', () => {
  it.each([
    ['javascript:alert(1)', 'address is not an http or https address'],
    ['data:text/html,<b>x</b>', 'address is not an http or https address'],
    ['file:///etc/passwd', 'address is not an http or https address'],
    ['ftp://example.org/x', 'address is not an http or https address'],
    ['example.org/no-scheme', 'address is not an http or https address'],
    ['https://user:secret@example.org/', 'address contains a user name or password'],
    ['https://', 'address is not valid'],
    ['', 'address is missing'],
    [`https://example.org/${'a'.repeat(100000)}`, 'address is longer than 2048 characters'],
    [`https://example.org/${'a'.repeat(2048)}`, 'address is longer than 2048 characters'],
  ])('skips the address %#', (url, reason) => {
    const result = readOk(baseFile([{ ...volume(1), url }, volume(2)]));
    expect(result.file.volumes.map((item) => item.id)).toEqual(['v2']);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toBe(reason);
    expect(result.skipped[0]?.title).toBe('Page 1');
    expect(result.skipped[0]?.url.length).toBeLessThanOrEqual(2048);
  });

  it('keeps an address of exactly 2,048 characters', () => {
    const base = 'https://example.org/';
    const url = base + 'a'.repeat(2048 - base.length);
    expect(readOk(baseFile([{ ...volume(1), url }])).file.volumes[0]?.url).toBe(url);
  });

  it('writes addresses in their canonical form', () => {
    expect(readOk(baseFile([{ ...volume(1), url: ' HTTPS://Example.org ' }])).file.volumes[0]?.url).toBe('https://example.org/');
  });

  it('skips entries that are not volumes or have no usable id, and repeated ids', () => {
    const result = readOk(baseFile([null, 'text', 5, [], { url: 'https://example.org/x', title: 'No id' }, volume(1), volume(1)]));
    expect(result.file.volumes.map((item) => item.id)).toEqual(['v1']);
    expect(result.skipped.map((item) => item.reason)).toEqual([
      'entry is not a volume',
      'entry is not a volume',
      'entry is not a volume',
      'entry is not a volume',
      'volume has no usable id',
      'id is used by an earlier volume',
    ]);
  });

  it('allows the same address twice, so a class shelf arrives whole', () => {
    const result = readOk(baseFile([volume(1), { ...volume(2), url: volume(1).url }]));
    expect(result.file.volumes).toHaveLength(2);
  });

  it('falls back to the host name for an empty title', () => {
    const out = readOk(baseFile([{ ...volume(1), title: ZERO_WIDTH }, { ...volume(2), title: undefined }]));
    expect(out.file.volumes.map((item) => item.title)).toEqual(['example.org', 'example.org']);
  });

  it('removes direction overrides and invisible characters from every text field', () => {
    const dirty = (text: string) => text.replace('#', OVERRIDE).replace('@', ZERO_WIDTH);
    const result = readOk({
      ...baseFile([
        {
          ...volume(1),
          title: dirty('gp#j@.txt'),
          author: dirty('Au#th@or'),
          note: dirty('No#te @here'),
          tags: [dirty('ta#g@')],
          text: dirty('Bo#dy @text'),
        },
      ]),
      shelf: { id: 's', name: dirty('Sh#el@f'), description: dirty('De#sc @ription'), author: dirty('Te#ac@her') },
    });
    expect(result.file.shelf).toMatchObject({ name: 'Shelf', description: 'Desc ription', author: 'Teacher' });
    expect(result.file.volumes[0]).toMatchObject({
      title: 'gpj.txt',
      author: 'Author',
      note: 'Note here',
      tags: ['tag'],
      text: 'Body text',
    });
    expect(JSON.stringify(result.file)).not.toContain(OVERRIDE);
    expect(JSON.stringify(result.file)).not.toContain(ZERO_WIDTH);
  });

  it('turns line breaks in a title into spaces but keeps them in a note and the text', () => {
    const out = readOk(baseFile([{ ...volume(1), title: 'Two\nlines', note: 'a\nb', text: 'x\n\ny' }])).file.volumes[0];
    expect(out).toMatchObject({ title: 'Two lines', note: 'a\nb', text: 'x\n\ny' });
  });

  it('checks the type of required', () => {
    const out = readOk(baseFile([{ ...volume(1), required: 'yes' }, { ...volume(2), required: false }]));
    expect(out.file.volumes.map((item) => item.id)).toEqual(['v2']);
    expect(out.file.volumes[0]?.required).toBe(false);
  });

  it('drops keys it does not know, including personal ones', () => {
    const out = readOk({
      ...baseFile([{ ...volume(1), addedAt: 'x', done: 'x', privateNote: 'x', progress: { block: 3 }, ['__proto__']: { polluted: true } }]),
      session: { focusId: 'v1' },
      notes: { v1: 'private' },
    });
    expect(Object.keys(out.file).sort()).toEqual(['format', 'shelf', 'version', 'volumes']);
    expect(Object.keys(out.file.volumes[0] ?? {}).sort()).toEqual(['cover', 'id', 'title', 'url']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('readShelfFile hostile cover values', () => {
  const coverOf = (cover: unknown) => readOk(baseFile([{ ...volume(1), cover }])).file.volumes[0]?.cover;

  it('keeps a valid cover as it is', () => {
    expect(coverOf({ cloth: 'moss', pattern: 'rays', seed: 42 })).toEqual({ cloth: 'moss', pattern: 'rays', seed: 42 });
  });

  it('clamps cloth and pattern to [a-z0-9-]{1,24}', () => {
    const cover = coverOf({ cloth: '"><b>', pattern: 'A'.repeat(40) + '<script>', seed: 1 });
    expect(cover?.cloth).toMatch(/^[a-z0-9-]{1,24}$/);
    expect(cover?.pattern).toMatch(/^[a-z0-9-]{1,24}$/);
    expect(cover?.cloth).toBe('b');
  });

  it('clamps the seed to an integer from 0 to 2,147,483,647', () => {
    expect(coverOf({ cloth: 'ink', pattern: 'arcs', seed: 1e308 })?.seed).toBe(2147483647);
    expect(coverOf({ cloth: 'ink', pattern: 'arcs', seed: Number.POSITIVE_INFINITY })?.seed).toBe(2147483647);
    expect(coverOf({ cloth: 'ink', pattern: 'arcs', seed: -5 })?.seed).toBe(0);
    expect(coverOf({ cloth: 'ink', pattern: 'arcs', seed: Number.NEGATIVE_INFINITY })?.seed).toBe(0);
    expect(coverOf({ cloth: 'ink', pattern: 'arcs', seed: 12.9 })?.seed).toBe(12);
    expect(coverOf({ cloth: 'ink', pattern: 'arcs', seed: 2147483648 })?.seed).toBe(2147483647);
  });

  it.each([
    ['not an object', 'ink'],
    ['an array', ['ink', 'arcs', 1]],
    ['no seed', { cloth: 'ink', pattern: 'arcs' }],
    ['a text seed', { cloth: 'ink', pattern: 'arcs', seed: '5' }],
    ['a NaN seed', { cloth: 'ink', pattern: 'arcs', seed: Number.NaN }],
    ['a cloth with no usable characters', { cloth: '<<>>', pattern: 'arcs', seed: 1 }],
    ['a missing pattern', { cloth: 'ink', seed: 1 }],
  ])('leaves the cover out for %s so the app derives one', (_label, cover) => {
    expect(coverOf(cover)).toBeUndefined();
  });
});

describe('shelfFileName', () => {
  it.each([
    ['Week 3', 'week-3.shelf.json'],
    ['Reading list (week 3)', 'reading-list-week-3.shelf.json'],
    ['Größe & Maße', 'grosse-masse.shelf.json'],
    ['  --Café au lait--  ', 'cafe-au-lait.shelf.json'],
    ['a/b\\c:d*e?f"g<h>i|j', 'a-b-c-d-e-f-g-h-i-j.shelf.json'],
    ['日本語の本', '日本語の本.shelf.json'],
    ['', 'shelf.shelf.json'],
    ['!!!', 'shelf.shelf.json'],
    ['con', 'con-shelf.shelf.json'],
    ['NUL', 'nul-shelf.shelf.json'],
    ['x'.repeat(100), `${'x'.repeat(60)}.shelf.json`],
  ])('names %j as %j', (name, expected) => {
    expect(shelfFileName(name)).toBe(expected);
  });

  it('never leaves a dash at the cut', () => {
    const name = `${'x'.repeat(59)} tail`;
    expect(shelfFileName(name)).toBe(`${'x'.repeat(59)}.shelf.json`);
  });
});

describe('type of the result', () => {
  it('is a ShelfFile that can be written straight back', () => {
    const { file }: { file: ShelfFile } = readOk(baseFile());
    expect(JSON.parse(JSON.stringify(file))).toEqual(file);
  });
});

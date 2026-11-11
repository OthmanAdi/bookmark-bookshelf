import { describe, expect, it } from 'vitest';
import type { ExportBookmark, ExportShelf } from './export-formats';
import { toMarkdownList, toNetscapeBookmarks } from './export-formats';
import { parseLinkList } from './link-list';
import { isNetscapeBookmarks, parseNetscapeBookmarks } from './netscape';

const SHELVES: ExportShelf[] = [
  { id: 's2', name: 'Second & last', order: 1 },
  { id: 's1', name: 'Reading <list> "one"', order: 0 },
  { id: 's3', name: 'Empty', order: 2 },
];

const BOOKMARKS: ExportBookmark[] = [
  { shelfId: 's1', url: 'https://example.org/b?x=1&y=2', title: 'Second', order: 1, addedAt: '2026-01-02T00:00:00.000Z' },
  {
    shelfId: 's1',
    url: 'https://example.org/a',
    title: '<b>Tom</b> & "Jerry" \'s #1',
    order: 0,
    addedAt: '2026-01-01T10:00:00.000Z',
    note: 'A note with <tags> & "quotes"',
  },
  { shelfId: 's2', url: 'https://example.com/caf\u00e9', title: 'Gr\u00fc\u00dfe aus \u00c4gypten \ud83d\ude80', order: 0, addedAt: '2026-02-01T00:00:00.000Z' },
];

describe('toNetscapeBookmarks', () => {
  const html = toNetscapeBookmarks({ shelves: SHELVES, bookmarks: BOOKMARKS });

  it('writes a file a browser accepts as a bookmarks file', () => {
    expect(html.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>')).toBe(true);
    expect(html).toContain('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">');
    expect(html).toContain('<TITLE>Bookmarks</TITLE>');
    expect(isNetscapeBookmarks(html)).toBe(true);
    expect(html.match(/<DL><p>/g)).toHaveLength(4);
    expect(html.match(/<\/DL><p>/g)).toHaveLength(4);
    expect(html.endsWith('\n')).toBe(true);
  });

  it('writes one folder per shelf in shelf order, links in stored order', () => {
    const result = parseNetscapeBookmarks(html);
    expect(result.folders.map((folder) => folder.name)).toEqual(['Reading <list> "one"', 'Second & last']);
    expect(result.folders[0]?.links.map((link) => link.title)).toEqual(['<b>Tom</b> & "Jerry" \'s #1', 'Second']);
    expect(html.indexOf('Reading')).toBeLessThan(html.indexOf('Second &amp; last'));
  });

  it('writes ADD_DATE in Unix seconds', () => {
    expect(html).toContain('ADD_DATE="1767261600"');
    expect(html).toContain(`ADD_DATE="${Date.parse('2026-02-01T00:00:00.000Z') / 1000}"`);
  });

  it('escapes all text so nothing in a title can become markup', () => {
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<list>');
    expect(html).not.toContain('<tags>');
    expect(html).toContain('&lt;b&gt;Tom&lt;/b&gt; &amp; &quot;Jerry&quot; &#39;s #1');
    expect(html).toContain('HREF="https://example.org/b?x=1&amp;y=2"');
  });

  it('round trips folders, titles, addresses and dates through the reader', () => {
    const result = parseNetscapeBookmarks(html);
    expect(result.skipped).toEqual([]);
    expect(result.folders).toEqual([
      {
        name: 'Reading <list> "one"',
        links: [
          { url: 'https://example.org/a', title: '<b>Tom</b> & "Jerry" \'s #1', addedAt: '2026-01-01T10:00:00.000Z' },
          { url: 'https://example.org/b?x=1&y=2', title: 'Second', addedAt: '2026-01-02T00:00:00.000Z' },
        ],
      },
      {
        name: 'Second & last',
        links: [{ url: 'https://example.com/caf%C3%A9', title: 'Gr\u00fc\u00dfe aus \u00c4gypten \ud83d\ude80', addedAt: '2026-02-01T00:00:00.000Z' }],
      },
    ]);
  });

  it('writes an empty folder for a shelf without volumes, which the reader drops', () => {
    expect(html).toContain('>Empty</H3>');
    expect(parseNetscapeBookmarks(html).folders.some((folder) => folder.name === 'Empty')).toBe(false);
  });

  it('leaves the date out when a volume has none, and falls back to the host for an empty title', () => {
    const out = toNetscapeBookmarks({
      shelves: [{ id: 's', name: 'S' }],
      bookmarks: [{ shelfId: 's', url: 'https://www.example.org/x', title: '  ' }],
    });
    expect(out).toContain('<DT><A HREF="https://www.example.org/x">example.org</A>');
    expect(out).not.toContain('ADD_DATE');
  });

  it('writes an empty library as a valid empty file', () => {
    const out = toNetscapeBookmarks({ shelves: [], bookmarks: [] });
    expect(isNetscapeBookmarks(out)).toBe(true);
    expect(parseNetscapeBookmarks(out)).toEqual({ folders: [], skipped: [] });
  });

  it('keeps nested style shelf names whole', () => {
    const out = toNetscapeBookmarks({
      shelves: [{ id: 's', name: 'Parent / Child' }],
      bookmarks: [{ shelfId: 's', url: 'https://example.org/', title: 'T' }],
    });
    expect(parseNetscapeBookmarks(out).folders[0]?.name).toBe('Parent / Child');
  });

  it('removes hostile characters from names and titles', () => {
    const override = String.fromCodePoint(0x202e);
    const out = toNetscapeBookmarks({
      shelves: [{ id: 's', name: `Sh${override}elf` }],
      bookmarks: [{ shelfId: 's', url: 'https://example.org/', title: `Ti${override}tle` }],
    });
    expect(out.includes(override)).toBe(false);
  });

  it('puts a volume of an unknown shelf nowhere rather than guessing', () => {
    const out = toNetscapeBookmarks({
      shelves: [{ id: 's', name: 'S' }],
      bookmarks: [{ shelfId: 'gone', url: 'https://example.org/', title: 'Lost' }],
    });
    expect(out).not.toContain('Lost');
  });
});

describe('toMarkdownList', () => {
  const volumes = [
    { url: 'https://example.org/a', title: 'First' },
    { url: 'https://example.org/b?x=1&y=2', title: 'Second', note: 'worth a look' },
    { url: 'https://example.com/c', title: 'Third', minutes: 12, required: false },
  ];

  it('writes a heading and numbered lines', () => {
    expect(toMarkdownList({ shelfName: 'Week 3', volumes })).toBe(
      [
        '# Week 3',
        '',
        '1. [First](https://example.org/a)',
        '2. [Second](https://example.org/b?x=1&y=2) - worth a look',
        '3. [Third](https://example.com/c) ~12 min (optional)',
        '',
      ].join('\n'),
    );
  });

  it('escapes Markdown characters in titles', () => {
    const text = toMarkdownList({
      shelfName: 'A_B',
      volumes: [{ url: 'https://example.org/', title: 'Use *stars*, _scores_, [brackets], `ticks` and a \\ slash | pipe <x> ~' }],
    });
    expect(text).toContain('# A\\_B');
    expect(text).toContain(
      '1. [Use \\*stars\\*, \\_scores\\_, \\[brackets\\], \\`ticks\\` and a \\\\ slash \\| pipe \\<x\\> \\~](https://example.org/)',
    );
  });

  it('keeps parentheses in an address from closing the link', () => {
    const text = toMarkdownList({ shelfName: 'S', volumes: [{ url: 'https://example.org/wiki/Foo_(bar)', title: 'Foo' }] });
    expect(text).toContain('(https://example.org/wiki/Foo_%28bar%29)');
  });

  it('keeps a note on one line and falls back to the host for an empty title', () => {
    const text = toMarkdownList({ shelfName: 'S', volumes: [{ url: 'https://www.example.org/', title: '', note: 'two\nlines' }] });
    expect(text).toContain('1. [example.org](https://www.example.org/) - two lines');
  });

  it('writes just a heading for an empty shelf', () => {
    expect(toMarkdownList({ shelfName: 'Empty', volumes: [] })).toBe('# Empty\n\n');
  });

  it('round trips addresses, titles, notes and markers through parseLinkList', () => {
    const awkward = [
      { url: 'https://example.org/a', title: 'Plain title' },
      { url: 'https://example.org/b?x=1&y=2#frag', title: 'Tom & Jerry: [part 1] *bold* _it_ `code` | pipe #1 <x> ~ + !', note: 'a note' },
      { url: 'https://example.com/caf%C3%A9', title: 'Gr\u00fc\u00dfe aus \u00c4gypten \ud83d\ude80 (brackets) {braces}', minutes: 5 },
      { url: 'https://example.net/', title: 'Back\\slash and trailing backslash\\', required: false },
    ];
    const result = parseLinkList(toMarkdownList({ shelfName: 'Round trip', volumes: awkward }));
    expect(result.unreadable).toEqual([]);
    expect(result.entries).toEqual([
      { url: 'https://example.org/a', title: 'Plain title' },
      { url: 'https://example.org/b?x=1&y=2#frag', title: awkward[1]?.title, note: 'a note' },
      { url: 'https://example.com/caf%C3%A9', title: awkward[2]?.title, minutes: 5 },
      { url: 'https://example.net/', title: awkward[3]?.title, required: false },
    ]);
  });
});

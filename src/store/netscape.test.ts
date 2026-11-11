import { describe, expect, it } from 'vitest';
import { isNetscapeBookmarks, parseNetscapeBookmarks } from './netscape';

const CHROME_EXPORT = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000" LAST_MODIFIED="1700000100" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><A HREF="https://example.org/one" ADD_DATE="1700000001" ICON="data:image/png;base64,AAAA">First &amp; best</A>
        <DT><A HREF="https://example.org/two?a=1&amp;b=2" ADD_DATE="1700000002">Second &quot;page&quot;</A>
        <DT><H3 ADD_DATE="1700000003" LAST_MODIFIED="1700000004">Reading</H3>
        <DL><p>
            <DT><A HREF="https://example.com/essay" ADD_DATE="1700000005">An essay</A>
            <DT><A HREF="javascript:void(0)" ADD_DATE="1700000006">Bookmarklet</A>
        </DL><p>
    </DL><p>
    <DT><H3 ADD_DATE="1700000007">Other bookmarks</H3>
    <DL><p>
        <DT><A HREF="https://example.net/" ADD_DATE="1700000008">Net</A>
    </DL><p>
</DL><p>
`;

const FIREFOX_EXPORT = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'none'; img-src data: *; object-src 'none'"></meta>
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks Menu</H1>

<DL><p>
    <DT><A HREF="https://example.org/menu-link" ADD_DATE="1600000000" LAST_MODIFIED="1600000001">Menu link</A>
    <DD>A description that belongs to the link above and is not a title.
    <DT><H3 ADD_DATE="1600000002" LAST_MODIFIED="1600000003" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks Toolbar</H3>
    <DD>Add bookmarks to this folder to see them displayed on the Bookmarks Toolbar
    <DL><p>
        <DT><A HREF="https://example.org/toolbar" ADD_DATE="1600000004">Toolbar link</A>
        <DT><A HREF="place:type=6&amp;sort=14&amp;maxResults=10" ADD_DATE="1600000005">Recent Tags</A>
    </DL><p>
    <DT><H3 ADD_DATE="1600000006" LAST_MODIFIED="1600000007" UNFILED_BOOKMARKS_FOLDER="true">Other Bookmarks</H3>
    <DL><p>
        <DT><A HREF="https://example.com/other" ADD_DATE="1600000008" TAGS="a,b">Other</A>
    </DL><p>
</DL>
`;

const SAFARI_EXPORT = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<HTML>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<Title>Bookmarks</Title>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 FOLDED>Favorites</H3>
    <DL><p>
        <DT><A HREF="https://example.org/fav">Favourite</A>
    </DL><p>
    <DT><H3 FOLDED>Reading List</H3>
    <DL><p>
        <DT><A HREF="https://example.com/article">Article</A>
        <DT><A HREF="file:///Users/someone/notes.html">Local notes</A>
    </DL><p>
</DL><p>
</HTML>
`;

describe('parseNetscapeBookmarks', () => {
  it('reads a Chrome export into folders, nested names and dates', () => {
    const result = parseNetscapeBookmarks(CHROME_EXPORT);
    expect(result.folders).toEqual([
      {
        name: 'Bookmarks bar',
        links: [
          { url: 'https://example.org/one', title: 'First & best', addedAt: '2023-11-14T22:13:21.000Z' },
          { url: 'https://example.org/two?a=1&b=2', title: 'Second "page"', addedAt: '2023-11-14T22:13:22.000Z' },
        ],
      },
      {
        name: 'Bookmarks bar / Reading',
        links: [{ url: 'https://example.com/essay', title: 'An essay', addedAt: '2023-11-14T22:13:25.000Z' }],
      },
      {
        name: 'Other bookmarks',
        links: [{ url: 'https://example.net/', title: 'Net', addedAt: '2023-11-14T22:13:28.000Z' }],
      },
    ]);
    expect(result.skipped).toEqual([
      { title: 'Bookmarklet', url: 'javascript:void(0)', reason: 'not a web address (javascript:)' },
    ]);
  });

  it('reads a Firefox export, ignores descriptions and sends loose links to Imported', () => {
    const result = parseNetscapeBookmarks(FIREFOX_EXPORT);
    expect(result.folders.map((folder) => folder.name)).toEqual(['Imported', 'Bookmarks Toolbar', 'Other Bookmarks']);
    expect(result.folders[0]?.links.map((link) => link.title)).toEqual(['Menu link']);
    expect(result.folders[1]?.links).toEqual([
      { url: 'https://example.org/toolbar', title: 'Toolbar link', addedAt: '2020-09-13T12:26:44.000Z' },
    ]);
    expect(result.skipped).toEqual([
      { title: 'Recent Tags', url: 'place:type=6&sort=14&maxResults=10', reason: 'not a web address (place:)' },
    ]);
  });

  it('reads a Safari export that has no dates and skips file addresses', () => {
    const result = parseNetscapeBookmarks(SAFARI_EXPORT);
    expect(result.folders).toEqual([
      { name: 'Favorites', links: [{ url: 'https://example.org/fav', title: 'Favourite' }] },
      { name: 'Reading List', links: [{ url: 'https://example.com/article', title: 'Article' }] },
    ]);
    expect(result.skipped).toEqual([
      { title: 'Local notes', url: 'file:///Users/someone/notes.html', reason: 'not a web address (file:)' },
    ]);
  });

  it('reads a truncated file as far as it goes', () => {
    const cut = CHROME_EXPORT.slice(0, CHROME_EXPORT.indexOf('An essay') + 4);
    const result = parseNetscapeBookmarks(cut);
    expect(result.folders.map((folder) => folder.name)).toEqual(['Bookmarks bar', 'Bookmarks bar / Reading']);
    expect(result.folders[1]?.links[0]?.title).toBe('An e');
  });

  it('survives a file cut in the middle of a tag', () => {
    const cut = CHROME_EXPORT.slice(0, CHROME_EXPORT.indexOf('HREF="https://example.org/two'));
    expect(() => parseNetscapeBookmarks(cut)).not.toThrow();
    expect(parseNetscapeBookmarks(cut).folders[0]?.links).toHaveLength(1);
    expect(() => parseNetscapeBookmarks('<DL><DT><A HREF="https://exam')).not.toThrow();
  });

  it.each([
    ['empty text', ''],
    ['plain text', 'Just some notes\nabout nothing in particular.'],
    ['a JSON library', '{"format":"bookmark-bookshelf","version":2,"shelves":[],"bookmarks":[]}'],
    ['an unrelated page', '<html><body><p>Hello</p><div><span>no links</span></div></body></html>'],
    ['stray angle brackets', 'a < b > c << d <<< <> </> <-- <!'],
    ['binary noise', String.fromCharCode(0, 1, 2, 60, 65, 255, 254, 60, 47)],
  ])('gives nothing for %s', (_label, text) => {
    expect(parseNetscapeBookmarks(text)).toEqual({ folders: [], skipped: [] });
  });

  it('does not throw for a value that is not a string', () => {
    expect(parseNetscapeBookmarks(undefined as unknown as string)).toEqual({ folders: [], skipped: [] });
  });

  it('accepts lower case tags and single quoted, bare and spaced attributes', () => {
    const html = `<dl><dt><h3>Mixed</h3><dl>
      <dt><a href='https://example.org/single' add_date='1700000000'>Single</a>
      <dt><a href=https://example.org/bare add_date=1700000000>Bare</a>
      <dt><A  HREF = "https://example.org/spaced"   ADD_DATE = "1700000000" >Spaced</A>
      </dl></dl>`;
    const links = parseNetscapeBookmarks(html).folders[0]?.links ?? [];
    expect(links.map((link) => [link.title, link.url])).toEqual([
      ['Single', 'https://example.org/single'],
      ['Bare', 'https://example.org/bare'],
      ['Spaced', 'https://example.org/spaced'],
    ]);
  });

  it('decodes the five named entities and numeric entities in titles and folder names', () => {
    const html = `<DL><DT><H3>Caf&#233; &amp; &#x4F;ffice &lt;1&gt;</H3><DL>
      <DT><A HREF="https://example.org/x">&quot;Quoted&quot; &apos;text&apos; &#128512; &amp;amp;</A></DL></DL>`;
    const folder = parseNetscapeBookmarks(html).folders[0];
    expect(folder?.name).toBe('Café & Office <1>');
    expect(folder?.links[0]?.title).toBe('"Quoted" \'text\' 😀 &amp;');
  });

  it('keeps an invalid numeric entity as written', () => {
    const html = '<DL><DT><A HREF="https://example.org/">a &#0; b &#xD800; c &#99999999; d</A></DL>';
    expect(parseNetscapeBookmarks(html).folders[0]?.links[0]?.title).toBe('a &#0; b &#xD800; c &#99999999; d');
  });

  it('strips inline tags from a title', () => {
    const html = '<DL><DT><A HREF="https://example.org/">Bold <b>move</b> here</A></DL>';
    expect(parseNetscapeBookmarks(html).folders[0]?.links[0]?.title).toBe('Bold move here');
  });

  it('leaves out missing and absurd dates', () => {
    const html = `<DL>
      <DT><A HREF="https://example.org/a" ADD_DATE="0">Zero</A>
      <DT><A HREF="https://example.org/b" ADD_DATE="1700000000000">Milliseconds</A>
      <DT><A HREF="https://example.org/c" ADD_DATE="soon">Words</A>
      <DT><A HREF="https://example.org/d" ADD_DATE="-5">Negative</A>
      <DT><A HREF="https://example.org/e">None</A>
      <DT><A HREF="https://example.org/f" ADD_DATE="1700000000">Fine</A></DL>`;
    const links = parseNetscapeBookmarks(html).folders[0]?.links ?? [];
    expect(links.map((link) => link.addedAt)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      '2023-11-14T22:13:20.000Z',
    ]);
    expect(Object.keys(links[0] ?? {})).toEqual(['url', 'title']);
  });

  it('drops empty folders but keeps the nested name of a folder below an empty one', () => {
    const html = `<DL><DT><H3>Outer</H3><DL>
      <DT><H3>Empty</H3><DL></DL>
      <DT><H3>Inner</H3><DL><DT><A HREF="https://example.org/i">I</A></DL>
    </DL></DL>`;
    expect(parseNetscapeBookmarks(html).folders.map((folder) => folder.name)).toEqual(['Outer / Inner']);
  });

  it('names deeper folders with every level', () => {
    const html = `<DL><DT><H3>A</H3><DL><DT><H3>B</H3><DL><DT><H3>C</H3><DL>
      <DT><A HREF="https://example.org/deep">Deep</A></DL></DL></DL></DL>`;
    expect(parseNetscapeBookmarks(html).folders[0]?.name).toBe('A / B / C');
  });

  it('returns to the parent folder after a nested one closes', () => {
    const html = `<DL><DT><H3>Top</H3><DL>
      <DT><A HREF="https://example.org/1">One</A>
      <DT><H3>Sub</H3><DL><DT><A HREF="https://example.org/2">Two</A></DL>
      <DT><A HREF="https://example.org/3">Three</A>
    </DL></DL>`;
    const folders = parseNetscapeBookmarks(html).folders;
    expect(folders.map((folder) => [folder.name, folder.links.map((link) => link.title)])).toEqual([
      ['Top', ['One', 'Three']],
      ['Top / Sub', ['Two']],
    ]);
  });

  it('merges two folders that end up with the same name', () => {
    const html = `<DL>
      <DT><H3>Same</H3><DL><DT><A HREF="https://example.org/1">One</A></DL>
      <DT><H3>same</H3><DL><DT><A HREF="https://example.org/2">Two</A></DL></DL>`;
    const folders = parseNetscapeBookmarks(html).folders;
    expect(folders).toHaveLength(1);
    expect(folders[0]?.links).toHaveLength(2);
  });

  it('skips credentials, anchors without an address and unreadable addresses, each with a reason', () => {
    const long = `https://example.org/${'x'.repeat(2100)}`;
    const html = `<DL>
      <DT><A HREF="https://user:pass@example.org/">Secret</A>
      <DT><A HREF="">No address</A>
      <DT><A NAME="target">Named target</A>
      <DT><A HREF="not an address">Words</A>
      <DT><A HREF="http://">Nothing</A>
      <DT><A HREF="${long}">Long</A>
      <DT><A HREF="data:text/html,hi">Data</A>
      <DT><A HREF="chrome://settings">Settings</A>
      <DT><A HREF="about:blank">Blank</A>
      <DT><A HREF="https://example.org/ok">Fine</A></DL>`;
    const result = parseNetscapeBookmarks(html);
    expect(result.folders[0]?.links.map((link) => link.title)).toEqual(['Fine']);
    expect(result.skipped.map((item) => [item.title, item.reason])).toEqual([
      ['Secret', 'address contains a user name or password'],
      ['No address', 'has no address'],
      ['Words', 'not a valid address'],
      ['Nothing', 'not a valid address'],
      ['Long', 'address is longer than 2048 characters'],
      ['Data', 'not a web address (data:)'],
      ['Settings', 'not a web address (chrome:)'],
      ['Blank', 'not a web address (about:)'],
    ]);
  });

  it('cleans titles and folder names of direction overrides and line breaks', () => {
    const override = String.fromCodePoint(0x202e);
    const zeroWidth = String.fromCodePoint(0x200b);
    const html = `<DL><DT><H3>Fold${override}er\nname</H3><DL>
      <DT><A HREF="https://example.org/">Ti${zeroWidth}tle\n  across lines${override}</A></DL></DL>`;
    const folder = parseNetscapeBookmarks(html).folders[0];
    expect(folder?.name).toBe('Folder name');
    expect(folder?.links[0]?.title).toBe('Title across lines');
  });

  it('ends an unclosed title at the next structural tag instead of swallowing the rest', () => {
    const html = `<DL><DT><A HREF="https://example.org/1">Never closed
      <DT><A HREF="https://example.org/2">Closed</A></DL>`;
    const links = parseNetscapeBookmarks(html).folders[0]?.links ?? [];
    expect(links.map((link) => link.title)).toEqual(['Never closed', 'Closed']);
  });

  it('skips comments', () => {
    const html = '<!-- <A HREF="https://example.org/hidden">Hidden</A> --><DL><DT><A HREF="https://example.org/seen">Seen</A></DL>';
    expect(parseNetscapeBookmarks(html).folders[0]?.links.map((link) => link.title)).toEqual(['Seen']);
  });

  it('normalises addresses the way the URL parser does', () => {
    const html = '<DL><DT><A HREF="HTTPS://Example.org">Home</A></DL>';
    expect(parseNetscapeBookmarks(html).folders[0]?.links[0]?.url).toBe('https://example.org/');
  });

  it('flattens folders nested beyond a sensible depth without losing links', () => {
    const open = '<DL><DT><H3>L</H3>'.repeat(40);
    const close = '</DL>'.repeat(40);
    const html = `${open}<DL><DT><A HREF="https://example.org/deep">Deep</A></DL>${close}<DL><DT><A HREF="https://example.org/top">Top</A></DL>`;
    const result = parseNetscapeBookmarks(html);
    const titles = result.folders.flatMap((folder) => folder.links.map((link) => link.title));
    expect(titles).toEqual(['Deep', 'Top']);
    expect(Math.max(...result.folders.map((folder) => folder.name.length))).toBeLessThan(200);
  });

  describe('pathological input', () => {
    it('parses a 5 MB export well under a second', () => {
      const lines: string[] = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<DL><p>'];
      let folder = 0;
      for (let i = 0; i < 40000; i += 1) {
        if (i % 100 === 0) {
          if (i > 0) lines.push('</DL><p>');
          lines.push(`<DT><H3 ADD_DATE="1700000000">Folder ${folder}</H3>`, '<DL><p>');
          folder += 1;
        }
        lines.push(`<DT><A HREF="https://example.org/page/${i}?q=${'x'.repeat(40)}" ADD_DATE="1700000000">Title number ${i}</A>`);
      }
      lines.push('</DL><p>', '</DL><p>');
      const html = lines.join('\n');
      expect(html.length).toBeGreaterThan(4_000_000);
      const start = performance.now();
      const result = parseNetscapeBookmarks(html);
      const elapsed = performance.now() - start;
      expect(result.folders).toHaveLength(400);
      expect(result.folders.reduce((sum, item) => sum + item.links.length, 0)).toBe(40000);
      expect(elapsed).toBeLessThan(1000);
    });

    it.each([
      ['unclosed anchors', '<DT><A HREF="https://example.org/">'.repeat(150000)],
      ['unclosed headings', '<H3>'.repeat(300000)],
      ['unclosed lists', '<DL>'.repeat(500000)],
      ['open tags without end', '<a '.repeat(500000)],
      ['quotes without end', '<a href="'.repeat(200000)],
      ['angle brackets', '<'.repeat(1000000)],
      ['many comment starts', '<!--'.repeat(300000)],
      ['entities', `<DL><DT><A HREF="https://example.org/">${'&amp;&#x41;&bogus;&'.repeat(100000)}</A></DL>`],
    ])('stays fast on %s', (_label, text) => {
      const start = performance.now();
      expect(() => parseNetscapeBookmarks(text)).not.toThrow();
      expect(performance.now() - start).toBeLessThan(1000);
    });
  });
});

describe('isNetscapeBookmarks', () => {
  it('recognises the doctype of each export', () => {
    expect(isNetscapeBookmarks(CHROME_EXPORT)).toBe(true);
    expect(isNetscapeBookmarks(FIREFOX_EXPORT)).toBe(true);
    expect(isNetscapeBookmarks(SAFARI_EXPORT)).toBe(true);
  });

  it('ignores case and a leading byte order mark or blank lines', () => {
    expect(isNetscapeBookmarks('\n\n<!doctype netscape-bookmark-file-1>\n<dl>')).toBe(true);
    expect(isNetscapeBookmarks(String.fromCodePoint(0xfeff) + '<!DOCTYPE NETSCAPE-Bookmark-file-1>')).toBe(true);
  });

  it('recognises a file without a doctype by its list of entries', () => {
    expect(isNetscapeBookmarks('<DL><p>\n  <DT><A HREF="https://example.org/">x</A>')).toBe(true);
    expect(isNetscapeBookmarks('<dl>\n<dt><h3>Folder</h3>')).toBe(true);
    expect(isNetscapeBookmarks('<H1>Bookmarks</H1><DL class="x"><DT><A HREF="https://example.org/">x</A>')).toBe(true);
  });

  it('is false for a JSON library, plain text and other pages', () => {
    expect(isNetscapeBookmarks('{"format":"bookmark-bookshelf","version":2,"shelves":[]}')).toBe(false);
    expect(isNetscapeBookmarks('[]')).toBe(false);
    expect(isNetscapeBookmarks('')).toBe(false);
    expect(isNetscapeBookmarks('Some notes about <DL> lists')).toBe(false);
    expect(isNetscapeBookmarks('<html><body><dl><dd>term</dd></dl></body></html>')).toBe(false);
    expect(isNetscapeBookmarks(undefined as unknown as string)).toBe(false);
  });

  it('only looks at the first 2,000 characters', () => {
    expect(isNetscapeBookmarks(' '.repeat(2000) + '<!DOCTYPE NETSCAPE-Bookmark-file-1>')).toBe(false);
    expect(isNetscapeBookmarks(' '.repeat(1900) + '<!DOCTYPE NETSCAPE-Bookmark-file-1>')).toBe(true);
  });

  it('stays fast on repeated near matches', () => {
    const start = performance.now();
    expect(isNetscapeBookmarks('<dl' + ' '.repeat(5000))).toBe(false);
    expect(isNetscapeBookmarks('<dl>'.repeat(1000))).toBe(false);
    expect(performance.now() - start).toBeLessThan(100);
  });
});

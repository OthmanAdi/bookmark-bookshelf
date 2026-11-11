import { describe, expect, it } from 'vitest';
import { parseLinkList } from './link-list';

function only(text: string) {
  const result = parseLinkList(text);
  expect(result.unreadable).toEqual([]);
  expect(result.entries).toHaveLength(1);
  return result.entries[0];
}

describe('parseLinkList formats', () => {
  it('reads a markdown link', () => {
    expect(only('[A good read](https://example.org/a)')).toEqual({ url: 'https://example.org/a', title: 'A good read' });
  });

  it('reads the text after a markdown link as the note', () => {
    expect(only('[A good read](https://example.org/a) - worth a second look')).toEqual({
      url: 'https://example.org/a',
      title: 'A good read',
      note: 'worth a second look',
    });
  });

  it('keeps balanced parentheses in a markdown address and unescapes the title', () => {
    expect(only('[Foo \\[1\\] and \\*bar\\*](https://example.org/wiki/Foo_(bar))')).toEqual({
      url: 'https://example.org/wiki/Foo_(bar)',
      title: 'Foo [1] and *bar*',
    });
  });

  it('reads a markdown link with an angle bracket address', () => {
    expect(only('[Spaced](<https://example.org/a>)')).toEqual({ url: 'https://example.org/a', title: 'Spaced' });
  });

  it('reads Title | url | note', () => {
    expect(only('Chapter two | https://example.org/two | read before class')).toEqual({
      url: 'https://example.org/two',
      title: 'Chapter two',
      note: 'read before class',
    });
  });

  it('reads Title | url without a note', () => {
    expect(only('Chapter two|https://example.org/two')).toEqual({ url: 'https://example.org/two', title: 'Chapter two' });
  });

  it('reads url | Title | note', () => {
    expect(only('https://example.org/two | Chapter two | the note')).toEqual({
      url: 'https://example.org/two',
      title: 'Chapter two',
      note: 'the note',
    });
  });

  it('reads Title - url', () => {
    expect(only('Chapter two - https://example.org/two')).toEqual({ url: 'https://example.org/two', title: 'Chapter two' });
  });

  it('reads Title - url - note', () => {
    expect(only('Chapter two - https://example.org/two - the note')).toEqual({
      url: 'https://example.org/two',
      title: 'Chapter two',
      note: 'the note',
    });
  });

  it('reads an en dash and an em dash as separators too', () => {
    expect(only('Chapter – https://example.org/two')).toEqual({ url: 'https://example.org/two', title: 'Chapter' });
    expect(only('https://example.org/two — Chapter')).toEqual({ url: 'https://example.org/two', title: 'Chapter' });
  });

  it('reads url Title', () => {
    expect(only('https://example.org/two Chapter two')).toEqual({ url: 'https://example.org/two', title: 'Chapter two' });
  });

  it('reads a bare address', () => {
    expect(only('https://example.org/two')).toEqual({ url: 'https://example.org/two' });
  });

  it('adds https:// to an address without a scheme', () => {
    expect(only('example.org/two')).toEqual({ url: 'https://example.org/two' });
    expect(only('Title | www.example.org')).toEqual({ url: 'https://www.example.org/', title: 'Title' });
    expect(only('localhost:5173/app.html')).toEqual({ url: 'https://localhost:5173/app.html' });
  });

  it('keeps an http address as http', () => {
    expect(only('http://example.org/two')).toEqual({ url: 'http://example.org/two' });
  });

  it('reads an address wrapped in angle brackets and drops trailing punctuation', () => {
    expect(only('<https://example.org/two>')).toEqual({ url: 'https://example.org/two' });
    expect(only('See https://example.org/two.')).toEqual({ url: 'https://example.org/two', title: 'See' });
  });
});

describe('parseLinkList list markers', () => {
  it.each(['- ', '* ', '+ ', '1. ', '12. ', '3) ', '• ', '  - '])('ignores the marker %j', (marker) => {
    expect(only(`${marker}[Title](https://example.org/a)`)).toEqual({ url: 'https://example.org/a', title: 'Title' });
    expect(only(`${marker}Title | https://example.org/a`)).toEqual({ url: 'https://example.org/a', title: 'Title' });
    expect(only(`${marker}https://example.org/a`)).toEqual({ url: 'https://example.org/a' });
  });

  it('ignores a markdown heading line and blank lines', () => {
    const result = parseLinkList('# Reading list\n\n1. https://example.org/a\n\n   \n## More\n2. https://example.org/b\n');
    expect(result.entries.map((entry) => entry.url)).toEqual(['https://example.org/a', 'https://example.org/b']);
    expect(result.unreadable).toEqual([]);
  });
});

describe('parseLinkList markers in the text', () => {
  it('marks (optional) as not required, in any case and anywhere in the text', () => {
    expect(only('Extra reading (optional) | https://example.org/a')).toEqual({
      url: 'https://example.org/a',
      title: 'Extra reading',
      required: false,
    });
    expect(only('[Extra](https://example.org/a) ( Optional )')).toEqual({
      url: 'https://example.org/a',
      title: 'Extra',
      required: false,
    });
    expect(only('https://example.org/a Extra (OPTIONAL)')).toEqual({
      url: 'https://example.org/a',
      title: 'Extra',
      required: false,
    });
  });

  it('sets minutes from ~12 min', () => {
    expect(only('Essay | https://example.org/a | ~12 min')).toEqual({
      url: 'https://example.org/a',
      title: 'Essay',
      minutes: 12,
    });
    expect(only('Essay ~7min https://example.org/a')).toEqual({ url: 'https://example.org/a', title: 'Essay', minutes: 7 });
    expect(only('[Essay](https://example.org/a) ~ 90 minutes')).toEqual({
      url: 'https://example.org/a',
      title: 'Essay',
      minutes: 90,
    });
  });

  it('removes a reading time outside 1 to 600 without using it', () => {
    expect(only('Essay ~0 min https://example.org/a')).toEqual({ url: 'https://example.org/a', title: 'Essay' });
    expect(only('Essay ~601 min https://example.org/a')).toEqual({ url: 'https://example.org/a', title: 'Essay' });
  });

  it('reads both markers together and keeps the note', () => {
    expect(only('- Essay | https://example.org/a | long but good ~25 min (optional)')).toEqual({
      url: 'https://example.org/a',
      title: 'Essay',
      note: 'long but good',
      required: false,
      minutes: 25,
    });
  });

  it('does not read markers inside an address', () => {
    expect(only('https://example.org/~12min/(optional)')).toEqual({ url: 'https://example.org/~12min/(optional)' });
  });
});

describe('parseLinkList edge cases', () => {
  it('handles Windows and old Mac line endings', () => {
    const result = parseLinkList('https://example.org/a\r\nTitle | https://example.org/b\r\n\r\nnonsense\rhttps://example.org/c');
    expect(result.entries.map((entry) => entry.url)).toEqual([
      'https://example.org/a',
      'https://example.org/b',
      'https://example.org/c',
    ]);
    expect(result.unreadable).toEqual([{ line: 4, text: 'nonsense' }]);
  });

  it('lets the first address win on a line with two', () => {
    expect(only('https://example.org/a https://example.com/b')).toEqual({
      url: 'https://example.org/a',
      title: 'https://example.com/b',
    });
    expect(only('Title https://example.org/a https://example.com/b')).toEqual({
      url: 'https://example.org/a',
      title: 'Title',
      note: 'https://example.com/b',
    });
  });

  it('returns lines without an address as unreadable with their 1-based line number', () => {
    const result = parseLinkList(
      ['https://example.org/a', '', 'Just a thought', 'Title | not a link', 'ftp://example.org/file', 'javascript:alert(1)', 'https://example.org/b'].join(
        '\n',
      ),
    );
    expect(result.entries.map((entry) => entry.url)).toEqual(['https://example.org/a', 'https://example.org/b']);
    expect(result.unreadable).toEqual([
      { line: 3, text: 'Just a thought' },
      { line: 4, text: 'Title | not a link' },
      { line: 5, text: 'ftp://example.org/file' },
      { line: 6, text: 'javascript:alert(1)' },
    ]);
  });

  it('makes an address with a user name or password unreadable', () => {
    const result = parseLinkList('https://user:secret@example.org/\nTitle | https://user@example.org/');
    expect(result.entries).toEqual([]);
    expect(result.unreadable.map((line) => line.line)).toEqual([1, 2]);
  });

  it('makes an address over 2,048 characters unreadable, and a very long line too', () => {
    const result = parseLinkList(`https://example.org/${'a'.repeat(2100)}\n${'word '.repeat(2000)}https://example.org/`);
    expect(result.entries).toEqual([]);
    expect(result.unreadable).toHaveLength(2);
    expect(result.unreadable[0]?.text.length).toBeLessThanOrEqual(300);
  });

  it('mixes every format in one paste', () => {
    const text = [
      '# Week 3',
      '1. [Intro](https://example.org/intro) - start here ~5 min',
      '2. Reference | https://example.org/ref | keep open',
      '3. Background - https://example.org/bg (optional)',
      '4. https://example.org/talk Conference talk',
      '5. example.org/plain',
      'remember to bring a laptop',
    ].join('\r\n');
    const result = parseLinkList(text);
    expect(result.entries).toEqual([
      { url: 'https://example.org/intro', title: 'Intro', note: 'start here', minutes: 5 },
      { url: 'https://example.org/ref', title: 'Reference', note: 'keep open' },
      { url: 'https://example.org/bg', title: 'Background', required: false },
      { url: 'https://example.org/talk', title: 'Conference talk' },
      { url: 'https://example.org/plain' },
    ]);
    expect(result.unreadable).toEqual([{ line: 7, text: 'remember to bring a laptop' }]);
  });

  it('removes hostile characters from titles and notes', () => {
    const override = String.fromCodePoint(0x202e);
    const zeroWidth = String.fromCodePoint(0x200b);
    expect(only(`Ti${override}tle${zeroWidth} | https://example.org/a | no${zeroWidth}te`)).toEqual({
      url: 'https://example.org/a',
      title: 'Title',
      note: 'note',
    });
  });

  it('gives an empty result for empty text and for a value that is not a string', () => {
    expect(parseLinkList('')).toEqual({ entries: [], unreadable: [] });
    expect(parseLinkList(undefined as unknown as string)).toEqual({ entries: [], unreadable: [] });
  });

  it('reads 5,000 lines quickly', () => {
    const lines = Array.from({ length: 5000 }, (_value, i) => `${i + 1}. Title ${i} | https://example.org/${i} | note ~3 min`);
    const start = performance.now();
    const result = parseLinkList(lines.join('\n'));
    expect(performance.now() - start).toBeLessThan(500);
    expect(result.entries).toHaveLength(5000);
  });

  it('stays fast on bracket heavy lines', () => {
    const start = performance.now();
    parseLinkList(`${'['.repeat(2400)}${'](('.repeat(800)}`);
    parseLinkList('[a]('.repeat(1200));
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

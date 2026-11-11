import { describe, expect, it } from 'vitest';
import { bookmarkletSource, parseAddRequest } from './add-request';

function enc(value: string): string {
  return encodeURIComponent(value);
}

/** Runs a bookmarklet the way a browser would: percent-decode the body, then execute it with a fake page. */
function runBookmarklet(
  source: string,
  page: { href: string; title: string; selection: string },
): { opened: string; target: string; features: string } {
  expect(source.startsWith('javascript:')).toBe(true);
  const body = decodeURIComponent(source.slice('javascript:'.length));
  const calls: string[][] = [];
  const fakeWindow = {
    open: (...args: string[]) => {
      calls.push(args);
      return null;
    },
    getSelection: () => page.selection,
  };
  const fakeDocument = { title: page.title };
  const fakeLocation = { href: page.href };
  new Function('window', 'document', 'location', body)(fakeWindow, fakeDocument, fakeLocation);
  expect(calls).toHaveLength(1);
  const [opened = '', target = '', features = ''] = calls[0] ?? [];
  return { opened, target, features };
}

function locationOf(opened: string): { hash: string; search: string } {
  const url = new URL(opened);
  return { hash: url.hash, search: url.search };
}

describe('parseAddRequest', () => {
  it('reads add, title and text from the fragment', () => {
    const hash = `#add=${enc('https://example.org/a?x=1&y=2')}&title=${enc('A title')}&text=${enc('Some\nselected text')}`;
    expect(parseAddRequest({ hash, search: '' })).toEqual({
      url: 'https://example.org/a?x=1&y=2',
      title: 'A title',
      text: 'Some\nselected text',
    });
  });

  it('reads the same keys from the query string', () => {
    const search = `?add=${enc('https://example.org/q')}&title=${enc('Query title')}`;
    expect(parseAddRequest({ hash: '', search })).toEqual({ url: 'https://example.org/q', title: 'Query title' });
  });

  it('prefers the fragment and falls back to the query per key', () => {
    const request = parseAddRequest({
      hash: `#add=${enc('https://example.org/frag')}&title=${enc('From fragment')}`,
      search: `?add=${enc('https://example.org/query')}&title=${enc('From query')}&text=${enc('Query text')}`,
    });
    expect(request).toEqual({ url: 'https://example.org/frag', title: 'From fragment', text: 'Query text' });
  });

  it('returns only the address when title and text are missing', () => {
    expect(parseAddRequest({ hash: `#add=${enc('https://example.org/')}`, search: '' })).toEqual({
      url: 'https://example.org/',
    });
  });

  it('returns null without an add key', () => {
    expect(parseAddRequest({ hash: '', search: '' })).toBeNull();
    expect(parseAddRequest({ hash: '#title=Only', search: '?text=Only' })).toBeNull();
    expect(parseAddRequest({ hash: '#shelf=1.d.AAAA', search: '' })).toBeNull();
    expect(parseAddRequest({ hash: '#add=', search: '' })).toBeNull();
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,hi',
    'file:///etc/hosts',
    'ftp://example.org/',
    'example.org',
    'hello world',
    'https://',
    'https://user:secret@example.org/',
    `https://example.org/${'a'.repeat(2100)}`,
  ])('returns null for the address %j', (address) => {
    expect(parseAddRequest({ hash: `#add=${enc(address)}`, search: '' })).toBeNull();
  });

  it('accepts a leading question mark or hash in either part and tolerates other keys', () => {
    expect(parseAddRequest({ hash: `add=${enc('https://example.org/')}&shelf=x`, search: '' })).toEqual({
      url: 'https://example.org/',
    });
  });

  it('clamps the title to 300 characters and the text to 500,000', () => {
    const request = parseAddRequest({
      hash: `#add=${enc('https://example.org/')}&title=${enc('t'.repeat(1000))}&text=${enc('x'.repeat(600000))}`,
      search: '',
    });
    expect(request?.title).toHaveLength(300);
    expect(request?.text).toHaveLength(500000);
  });

  it('cleans hostile characters and line breaks out of the title, and hostile characters out of the text', () => {
    const override = String.fromCodePoint(0x202e);
    const zeroWidth = String.fromCodePoint(0x200b);
    const request = parseAddRequest({
      hash: `#add=${enc('https://example.org/')}&title=${enc(`Ti${override}tle\nacross${zeroWidth} lines`)}&text=${enc(`one${override}\ntwo`)}`,
      search: '',
    });
    expect(request).toEqual({ url: 'https://example.org/', title: 'Title across lines', text: 'one\ntwo' });
  });

  it('leaves out a title or text that is only whitespace', () => {
    const request = parseAddRequest({ hash: `#add=${enc('https://example.org/')}&title=%20%20&text=%0A%20`, search: '' });
    expect(request).toEqual({ url: 'https://example.org/' });
  });

  it('survives malformed percent escapes without throwing', () => {
    const request = parseAddRequest({ hash: `#add=${enc('https://example.org/')}&title=100%&text=%E0%A4%A`, search: '' });
    expect(request?.url).toBe('https://example.org/');
    expect(request?.title).toBe('100%');
  });
});

describe('bookmarkletSource', () => {
  const APP = 'https://example.org/bookshelf/app.html';

  it('is one line and does not hold characters that cut a javascript address short', () => {
    const source = bookmarkletSource(APP);
    expect(source).not.toMatch(/[\r\n]/);
    expect(source.includes(String.fromCharCode(0x2028))).toBe(false);
    expect(source.includes(String.fromCharCode(0x2029))).toBe(false);
    expect(source).not.toContain('#');
    expect(source).not.toContain('%');
    expect(source.startsWith('javascript:')).toBe(true);
  });

  it('opens the app with the page address, title and selection, without an opener', () => {
    const page = { href: 'https://example.com/post?id=7#part', title: 'Hello', selection: 'a quote' };
    const result = runBookmarklet(bookmarkletSource(APP), page);
    expect(result.opened.startsWith(`${APP}#add=`)).toBe(true);
    expect(result.target).toBe('_blank');
    expect(result.features).toBe('noopener');
    expect(parseAddRequest(locationOf(result.opened))).toEqual({
      url: 'https://example.com/post?id=7#part',
      title: 'Hello',
      text: 'a quote',
    });
  });

  it('round-trips a title with ampersands, hashes, quotes and umlauts', () => {
    const title = 'Tom & Jerry #1: "Grüße" aus Ägypten, it\'s 100% fun? a=b+c';
    const selection = `Zitat: „Wörter“ & "more" #tag\nsecond line`;
    const page = { href: 'https://example.com/a?b=1&c=2#d', title, selection };
    const result = runBookmarklet(bookmarkletSource(APP), page);
    const request = parseAddRequest(locationOf(result.opened));
    expect(request).toEqual({ url: page.href, title, text: selection });
  });

  it('keeps the app address intact when it contains a quote, a space or a percent sign', () => {
    const app = "https://example.org/my shelf/it's%20here/app.html?lang=de";
    const result = runBookmarklet(bookmarkletSource(app), {
      href: 'https://example.com/',
      title: 'T',
      selection: '',
    });
    const expected = new URL(app);
    expect(result.opened.startsWith(`${expected.origin}${expected.pathname}${expected.search}#add=`)).toBe(true);
    expect(parseAddRequest(locationOf(result.opened))).toEqual({ url: 'https://example.com/', title: 'T' });
  });

  it('drops a fragment from the app address', () => {
    const result = runBookmarklet(bookmarkletSource(`${APP}#shelf=1.d.AAAA`), {
      href: 'https://example.com/',
      title: '',
      selection: '',
    });
    expect(result.opened.startsWith(`${APP}#add=`)).toBe(true);
    expect(result.opened.match(/#/g)).toHaveLength(1);
  });

  it('sends an empty selection and survives a page that refuses getSelection', () => {
    const source = bookmarkletSource(APP);
    const body = decodeURIComponent(source.slice('javascript:'.length));
    const calls: string[][] = [];
    new Function('window', 'document', 'location', body)(
      {
        open: (...args: string[]) => calls.push(args),
        getSelection: () => {
          throw new Error('blocked');
        },
      },
      { title: 'T' },
      { href: 'https://example.com/' },
    );
    expect(parseAddRequest(locationOf(calls[0]?.[0] ?? ''))).toEqual({ url: 'https://example.com/', title: 'T' });
  });

  it('survives a lone surrogate in a title', () => {
    const lone = String.fromCharCode(0xd83d);
    const result = runBookmarklet(bookmarkletSource(APP), {
      href: 'https://example.com/',
      title: `Broken${lone} title`,
      selection: '',
    });
    expect(parseAddRequest(locationOf(result.opened))?.title).toBe('Broken title');
  });

  it('cuts a very long selection', () => {
    const result = runBookmarklet(bookmarkletSource(APP), {
      href: 'https://example.com/',
      title: 'T',
      selection: 'x'.repeat(300000),
    });
    expect(parseAddRequest(locationOf(result.opened))?.text).toHaveLength(100000);
  });

  it.each(['', 'not a url', 'javascript:alert(1)', 'ftp://example.org/app.html', 'https://user:pw@example.org/app.html'])(
    'gives a harmless bookmarklet for the app address %j',
    (app) => {
      expect(bookmarkletSource(app)).toBe('javascript:void(0)');
    },
  );
});

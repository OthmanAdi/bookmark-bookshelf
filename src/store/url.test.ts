import { describe, expect, it } from 'vitest';
import { defaultCover, normalizeUrl } from './index';
import { urlKey } from './url';
import { makeRig } from './test-helpers';

describe('normalizeUrl', () => {
  it.each([
    ['https://example.com', 'https://example.com/'],
    ['  http://Example.com/a b?x=1#top  ', 'http://example.com/a%20b?x=1#top'],
    ['example.com', 'https://example.com/'],
    ['www.example.com/path', 'https://www.example.com/path'],
    ['localhost:3000/app', 'https://localhost:3000/app'],
    ['example.com:8080', 'https://example.com:8080/'],
    ['HTTPS://EXAMPLE.COM', 'https://example.com/'],
  ])('accepts %s', (input, expected) => {
    expect(normalizeUrl(input)).toEqual({ ok: true, value: expected });
  });

  it.each([
    '',
    '   ',
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<b>x</b>',
    'file:///etc/passwd',
    'ftp://example.com',
    'mailto:a@example.com',
    'https://',
    'exa mple.com',
  ])('rejects %j with invalid-url', (input) => {
    const result = normalizeUrl(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid-url');
      expect(result.error.field).toBe('url');
    }
  });
});

describe('normalizeUrl hygiene', () => {
  it.each(['hello', 'my reading list', 'what is this?', 'notes.', 'a.b', 'version 2.0 is out'])(
    'refuses %j, which is not meant as an address',
    (input) => {
      const result = normalizeUrl(input);
      expect(result).toMatchObject({ ok: false, error: { code: 'invalid-url', field: 'url' } });
      if (!result.ok) expect(result.error.message).toContain('does not look like a web address');
    },
  );

  it('still accepts a bare host with a path, a port or an international name', () => {
    for (const input of ['example.org/a?b=1', 'localhost', 'example.org:8080', 'bücher.example']) {
      expect(normalizeUrl(input).ok).toBe(true);
    }
  });

  it.each(['https://user:secret@example.org/', 'http://user@example.org'])(
    'refuses credentials in %s',
    (input) => {
      const result = normalizeUrl(input);
      expect(result).toMatchObject({ ok: false, error: { code: 'invalid-url', field: 'url' } });
      if (!result.ok) expect(result.error.message).toContain('user name or password');
    },
  );

  it('removes tracking parameters and keeps the rest of the query and the fragment', () => {
    expect(normalizeUrl('https://example.org/p?utm_source=a&id=7&fbclid=x&utm_medium=b#part')).toEqual({
      ok: true,
      value: 'https://example.org/p?id=7#part',
    });
    expect(normalizeUrl('https://example.org/p?gclid=1&msclkid=2')).toEqual({ ok: true, value: 'https://example.org/p' });
  });

  it('caps the length at 2,048 characters', () => {
    const fits = `https://example.org/${'a'.repeat(2048 - 'https://example.org/'.length)}`;
    expect(normalizeUrl(fits).ok).toBe(true);
    expect(normalizeUrl(`${fits}a`)).toMatchObject({ ok: false, error: { code: 'too-long', field: 'url' } });
  });

  it('applies to links added, edited and imported', () => {
    const { store } = makeRig();
    expect(store.addBookmark({ url: 'just words' })).toMatchObject({ ok: false, error: { field: 'url' } });
    const added = store.addBookmark({ url: 'https://example.org/p?utm_campaign=x&id=1' });
    if (!added.ok) throw new Error('add failed');
    expect(added.value.url).toBe('https://example.org/p?id=1');
    expect(store.updateBookmark(added.value.id, { url: 'https://u:p@example.org/' }).ok).toBe(false);
    const imported = store.importLibrary([{ url: 'https://u:p@example.org/', title: 'Secret' }], 'merge');
    expect(imported).toMatchObject({ ok: true, value: { added: 0 } });
    expect(imported.ok && imported.value.skipped[0]?.reason).toContain('user name or password');
  });
});

describe('defaultCover', () => {
  it('is deterministic and uses known names', () => {
    const first = defaultCover('https://example.com/');
    expect(defaultCover('https://example.com/')).toEqual(first);
    expect(['ink', 'bone', 'rust', 'moss', 'plum', 'ochre', 'slate', 'teal']).toContain(first.cloth);
    expect(['arcs', 'bars', 'dots', 'rays', 'tiles', 'waves']).toContain(first.pattern);
    expect(Number.isInteger(first.seed)).toBe(true);
    expect(first.seed).toBeGreaterThanOrEqual(0);
  });

  it('matches the FNV-1a 32-bit reference values', () => {
    expect(defaultCover('').seed).toBe(0x811c9dc5 & 0x7fffffff);
    expect(defaultCover('a').seed).toBe(0xe40c292c & 0x7fffffff);
  });

  it('varies with the text', () => {
    const seeds = new Set(['a.com', 'b.com', 'c.com', 'd.com'].map((text) => defaultCover(text).seed));
    expect(seeds.size).toBe(4);
  });
});

describe('urlKey', () => {
  const same = (a: string, b: string): boolean => urlKey(a) === urlKey(b);

  it('ignores case of the host, www, the fragment and one trailing slash', () => {
    expect(same('https://Example.org/page', 'https://www.example.org/page/#intro')).toBe(true);
    expect(same('https://example.org/', 'https://example.org')).toBe(true);
  });

  it('ignores tracking parameters and the order of the rest', () => {
    expect(same('https://example.org/p?b=2&a=1', 'https://example.org/p?utm_source=x&a=1&b=2&fbclid=z')).toBe(true);
  });

  it('keeps pages apart when path, query values, port or case of the path differ', () => {
    expect(same('https://example.org/a', 'https://example.org/b')).toBe(false);
    expect(same('https://example.org/p?a=1', 'https://example.org/p?a=2')).toBe(false);
    expect(same('https://example.org/p', 'https://example.org:8080/p')).toBe(false);
    expect(same('https://example.org/Page', 'https://example.org/page')).toBe(false);
  });

  it('does not throw on text that is not an address', () => {
    expect(urlKey('  not a url ')).toBe('not a url');
  });
});

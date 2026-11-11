import { describe, expect, it } from 'vitest';
import { MAX_URL_LENGTH, hasCredentials, looksLikeAddress, stripTracking } from './url-hygiene';

describe('looksLikeAddress', () => {
  it.each([
    'example.org',
    'www.example.org',
    'sub.example.co.uk/path?x=1',
    'localhost:5173/app.html',
    'localhost',
    'LOCALHOST/x',
    'example.org:8080',
    'example.org#top',
    'https://example.org',
    'HTTP://Example.org/a',
    '  example.org  ',
    'bücher.de/kapitel',
    'xn--80ak6aa92e.com',
    'example.xn--p1ai',
    'a-b.example.org',
  ])('accepts %j', (input) => {
    expect(looksLikeAddress(input)).toBe(true);
  });

  it.each([
    '',
    '   ',
    'hello',
    'hello world',
    'example.org/a b',
    'Read this later.',
    'e.g.',
    'version 1.2',
    'file.x',
    'example.123',
    'example.verylongtoplevelnamethatisnotreal',
    'example..org',
    'example.org.',
    '.org',
    '-bad.example.org',
    'bad-.example.org',
    'name@example.org',
    'user:pass@example.org',
    'mailto:a@example.org',
    'javascript:alert(1)',
    'javascript:alert(document.cookie)',
    'example.org:abc',
    'https://',
    'https:// example.org',
    '192.168.0.1',
  ])('rejects %j', (input) => {
    expect(looksLikeAddress(input)).toBe(false);
  });

  it('rejects a value that is not a string', () => {
    expect(looksLikeAddress(undefined as unknown as string)).toBe(false);
  });

  it('answers quickly on a very long input', () => {
    const start = performance.now();
    expect(looksLikeAddress(`${'a.'.repeat(60000)}`)).toBe(false);
    expect(looksLikeAddress(`example.org/${'x'.repeat(200000)}`)).toBe(true);
    expect(performance.now() - start).toBeLessThan(250);
  });
});

describe('hasCredentials', () => {
  it('finds a user name or a password', () => {
    expect(hasCredentials(new URL('https://user:secret@example.org/'))).toBe(true);
    expect(hasCredentials(new URL('https://user@example.org/'))).toBe(true);
    expect(hasCredentials(new URL('https://:secret@example.org/'))).toBe(true);
  });

  it('is false for a plain address and for an @ outside the authority', () => {
    expect(hasCredentials(new URL('https://example.org/'))).toBe(false);
    expect(hasCredentials(new URL('https://example.org/@user?mail=name@example.org'))).toBe(false);
  });
});

describe('stripTracking', () => {
  it('removes the known parameters', () => {
    const names = [
      'fbclid',
      'gclid',
      'dclid',
      'msclkid',
      'mc_eid',
      'mc_cid',
      'igshid',
      'yclid',
      '_hsenc',
      '_hsmi',
      'vero_id',
      'oly_enc_id',
      'oly_anon_id',
    ];
    for (const name of names) {
      expect(stripTracking(new URL(`https://example.org/a?${name}=1&keep=2`)).href).toBe('https://example.org/a?keep=2');
    }
  });

  it('removes every utm_ parameter by prefix', () => {
    const url = new URL('https://example.org/?utm_source=a&utm_medium=b&utm_custom_thing=c&utmx=keep&q=1');
    expect(stripTracking(url).href).toBe('https://example.org/?utmx=keep&q=1');
  });

  it('matches names without regard to case', () => {
    expect(stripTracking(new URL('https://example.org/?UTM_Source=a&FBCLID=b&q=1')).href).toBe('https://example.org/?q=1');
  });

  it('drops the question mark when nothing remains', () => {
    expect(stripTracking(new URL('https://example.org/a?utm_source=x&gclid=y')).href).toBe('https://example.org/a');
  });

  it('keeps the rest of the query in order and in its exact text', () => {
    const url = new URL('https://example.org/s?z=3&utm_source=x&a=%C3%A4+b&flag&m=1%2B1&fbclid=q&b=2');
    expect(stripTracking(url).href).toBe('https://example.org/s?z=3&a=%C3%A4+b&flag&m=1%2B1&b=2');
  });

  it('keeps the fragment', () => {
    expect(stripTracking(new URL('https://example.org/p?utm_source=x#section-2')).href).toBe('https://example.org/p#section-2');
    expect(stripTracking(new URL('https://example.org/p?a=1&gclid=x#frag?utm_source=y')).href).toBe(
      'https://example.org/p?a=1#frag?utm_source=y',
    );
  });

  it('does not touch an address with nothing to remove', () => {
    const url = new URL('https://example.org/a?x=1&y=2#h');
    expect(stripTracking(url).href).toBe(url.href);
    expect(stripTracking(new URL('https://example.org/')).href).toBe('https://example.org/');
  });

  it('does not change the URL it is given', () => {
    const url = new URL('https://example.org/?utm_source=x&a=1');
    const result = stripTracking(url);
    expect(url.href).toBe('https://example.org/?utm_source=x&a=1');
    expect(result).not.toBe(url);
  });

  it('survives a malformed escape in a name', () => {
    expect(stripTracking(new URL('https://example.org/?%E0%A4%A=1&gclid=2')).href).toBe('https://example.org/?%E0%A4%A=1');
  });
});

describe('MAX_URL_LENGTH', () => {
  it('is 2,048', () => {
    expect(MAX_URL_LENGTH).toBe(2048);
  });
});

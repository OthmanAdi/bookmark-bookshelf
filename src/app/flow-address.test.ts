import { describe, expect, it } from 'vitest';
import { carriesAddress, cleanedAddress, clearAddress, readAddress } from './flow-address';

const at = (hash = '', search = '', pathname = '/app.html') => ({ hash, search, pathname });

describe('reading the address', () => {
  it('finds a link to add in the fragment, with its title and selected text', () => {
    const intent = readAddress(at(`#add=${encodeURIComponent('https://example.org/a b')}&title=${encodeURIComponent('A page')}&text=${encodeURIComponent('Some words.')}`));
    expect(intent).toEqual({ kind: 'add', request: { url: 'https://example.org/a%20b', title: 'A page', text: 'Some words.' } });
  });

  it('finds a link to add in the query string', () => {
    expect(readAddress(at('', `?add=${encodeURIComponent('https://example.org/x')}`))).toMatchObject({ kind: 'add', request: { url: 'https://example.org/x' } });
  });

  it('refuses an address that is not http or https', () => {
    expect(readAddress(at(`#add=${encodeURIComponent('javascript:alert(1)')}`))).toBeNull();
    expect(readAddress(at(`#add=${encodeURIComponent('https://user:pass@example.org/')}`))).toBeNull();
  });

  it('finds one of the person\'s own links', () => {
    expect(readAddress(at('#link=abc-123'))).toEqual({ kind: 'link', id: 'abc-123' });
    expect(readAddress(at('#link='))).toBeNull();
  });

  it('finds a shelf that arrives as a link', () => {
    expect(readAddress(at('#shelf=1.d.AAAA'))).toEqual({ kind: 'shelf', fragment: 'shelf=1.d.AAAA' });
    expect(readAddress(at('#shelf='))).toBeNull();
  });

  it('finds nothing in an ordinary address', () => {
    expect(readAddress(at())).toBeNull();
    expect(readAddress(at('#top', '?x=1'))).toBeNull();
    expect(carriesAddress(at())).toBe(false);
    expect(carriesAddress(at('#shelf=1.r.e30'))).toBe(true);
  });
});

describe('clearing the address', () => {
  it('drops the fragment and the keys that were used, and keeps the rest', () => {
    const location = at('#add=x', `?add=${encodeURIComponent('https://example.org/')}&title=T&text=B&keep=1`);
    expect(cleanedAddress(location)).toBe('/app.html?keep=1');
    expect(cleanedAddress(at('#link=1'))).toBe('/app.html');
  });

  it('replaces the entry instead of adding one', () => {
    const calls: unknown[][] = [];
    clearAddress(at('#link=1'), { replaceState: (...args: unknown[]) => void calls.push(args) });
    expect(calls).toEqual([[null, '', '/app.html']]);
  });
});

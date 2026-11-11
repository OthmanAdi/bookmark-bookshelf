import type { Result } from './types';
import { fail, ok } from './result';
import { MAX_URL_LENGTH, hasCredentials, looksLikeAddress, stripTracking } from './url-hygiene';

const SCHEME = /^([a-z][a-z0-9+.-]*):(.*)$/is;
const PORT_AFTER_HOST = /^\d+(?:[/?#]|$)/;

/** `example.com:8080/x` and `localhost:3000` look like a scheme but are a host with a port. */
function hasScheme(text: string): boolean {
  const match = SCHEME.exec(text);
  if (!match) return false;
  const prefix = (match[1] ?? '').toLowerCase();
  const looksLikeHost = prefix.includes('.') || prefix === 'localhost';
  return !(looksLikeHost && PORT_AFTER_HOST.test(match[2] ?? ''));
}

function tooLong(): ReturnType<typeof fail> {
  return fail('too-long', `A web address can have at most ${MAX_URL_LENGTH} characters.`, 'url');
}

/**
 * Returns the canonical `href` of an http(s) address, without tracking parameters. `https://` is added when no
 * scheme is given and the text looks like a host; a bare word or a sentence is refused, and so is an address
 * that carries a user name or password.
 */
export function normalizeUrl(input: string): Result<string> {
  const text = typeof input === 'string' ? input.trim() : '';
  if (text === '') return fail('invalid-url', 'Enter a web address.', 'url');
  if (text.length > MAX_URL_LENGTH) return tooLong();
  const schemed = hasScheme(text);
  if (!schemed && !looksLikeAddress(text)) {
    return fail('invalid-url', 'That does not look like a web address. Try something like example.org/page.', 'url');
  }
  let parsed: URL;
  try {
    parsed = new URL(schemed ? text : `https://${text}`);
  } catch {
    return fail('invalid-url', 'That is not a valid web address.', 'url');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return fail('invalid-url', 'Only http and https addresses can be saved.', 'url');
  }
  if (parsed.hostname === '') return fail('invalid-url', 'The address has no host name.', 'url');
  if (hasCredentials(parsed)) {
    return fail('invalid-url', 'Addresses with a user name or password are not saved.', 'url');
  }
  const href = stripTracking(parsed).href;
  return href.length > MAX_URL_LENGTH ? tooLong() : ok(href);
}

/**
 * A key that is the same for every spelling of one page: host without `www.`, no fragment, one trailing slash
 * dropped, tracking parameters removed and the remaining query sorted. Used to find a link that is already saved;
 * it is never stored.
 */
export function urlKey(href: string): string {
  let url: URL;
  try {
    url = stripTracking(new URL(href));
  } catch {
    return typeof href === 'string' ? href.trim() : '';
  }
  const host = url.hostname.replace(/^www\./i, '');
  const port = url.port === '' ? '' : `:${url.port}`;
  const path = url.pathname.length > 1 && url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
  const query = url.search === '' ? [] : url.search.slice(1).split('&').filter((part) => part !== '').sort();
  return `${host}${port}${path}${query.length > 0 ? `?${query.join('&')}` : ''}`;
}

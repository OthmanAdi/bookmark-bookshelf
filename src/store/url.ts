import type { Result } from './types';
import { fail, ok } from './result';
import { stripTracking } from './url-hygiene';

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

/** Returns the canonical `href` of an http(s) address, adding `https://` when no scheme is given. */
export function normalizeUrl(input: string): Result<string> {
  const text = typeof input === 'string' ? input.trim() : '';
  if (text === '') return fail('invalid-url', 'Enter a web address.', 'url');
  const candidate = hasScheme(text) ? text : `https://${text}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return fail('invalid-url', 'That is not a valid web address.', 'url');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return fail('invalid-url', 'Only http and https addresses can be saved.', 'url');
  }
  if (parsed.hostname === '') return fail('invalid-url', 'The address has no host name.', 'url');
  return ok(parsed.href);
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

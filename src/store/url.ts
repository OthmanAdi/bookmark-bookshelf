import type { Result } from './types';
import { fail, ok } from './result';

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

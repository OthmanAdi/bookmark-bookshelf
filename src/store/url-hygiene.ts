/**
 * Address hygiene: deciding whether text is meant as an address, refusing credentials in one, and removing
 * tracking parameters. `normalizeUrl` in `url.ts` stays the single place that builds a stored address.
 */

export const MAX_URL_LENGTH = 2048;

const HTTP_SCHEME = /^https?:\/\/[^/?#]/i;
const PORT = /^\d{1,5}$/;
const LABEL_CHARS = /^[\p{L}\p{N}-]+$/u;
const TLD_LETTERS = /^\p{L}{2,24}$/u;
const TLD_PUNYCODE = /^xn--[a-z0-9-]{2,20}$/i;

const TRACKING_NAMES = new Set([
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
]);

function isLabel(label: string): boolean {
  return (
    label.length >= 1 &&
    label.length <= 63 &&
    LABEL_CHARS.test(label) &&
    !label.startsWith('-') &&
    !label.endsWith('-')
  );
}

function isHost(host: string): boolean {
  const labels = host.split('.');
  if (labels.length < 2 || !labels.every(isLabel)) return false;
  const last = labels[labels.length - 1] ?? '';
  return TLD_LETTERS.test(last) || TLD_PUNYCODE.test(last);
}

/**
 * True when text typed without a scheme is plausibly a web address: no whitespace and either `localhost`
 * or a dotted host whose last label is 2 to 24 letters. A bare word or a sentence is not an address.
 * Text that already starts with an http(s) scheme counts as one.
 */
export function looksLikeAddress(input: string): boolean {
  if (typeof input !== 'string') return false;
  const text = input.trim();
  if (text === '' || /\s/u.test(text)) return false;
  if (HTTP_SCHEME.test(text)) return true;

  const end = text.search(/[/?#]/);
  const authority = end === -1 ? text : text.slice(0, end);
  const colon = authority.indexOf(':');
  const host = colon === -1 ? authority : authority.slice(0, colon);
  if (colon !== -1 && !PORT.test(authority.slice(colon + 1))) return false;
  return host.toLowerCase() === 'localhost' || isHost(host);
}

/** True when the address carries a user name or password (`https://user:pass@host/`). */
export function hasCredentials(url: URL): boolean {
  return url.username !== '' || url.password !== '';
}

function isTracking(name: string): boolean {
  let decoded = name;
  try {
    decoded = decodeURIComponent(name);
  } catch {
    // A malformed escape cannot be a tracking name, so the raw text is compared.
  }
  const lower = decoded.toLowerCase();
  return lower.startsWith('utm_') || TRACKING_NAMES.has(lower);
}

/**
 * A copy of the address without known tracking parameters. The remaining query keeps its exact text and
 * order (it is not re-encoded) and the fragment is kept. The given URL is not changed.
 */
export function stripTracking(url: URL): URL {
  const copy = new URL(url.href);
  if (copy.search === '') return copy;
  const parts = copy.search.slice(1).split('&');
  const kept = parts.filter((part) => {
    const equals = part.indexOf('=');
    return !isTracking(equals === -1 ? part : part.slice(0, equals));
  });
  if (kept.length === parts.length) return copy;
  copy.search = kept.length === 0 ? '' : `?${kept.join('&')}`;
  return copy;
}

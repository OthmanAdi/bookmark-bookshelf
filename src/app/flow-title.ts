/**
 * A readable title for a link saved without one. It comes from the address, never from the page (the app
 * does not load pages): the last meaningful part of the path, cleaned up. An address with no usable path
 * gives an empty string, and the store names the link after its site.
 */

const EXTENSION = /\.(?:html?|php|aspx?|jsp|md|txt)$/i;
const ONLY_DIGITS = /^\d+$/;
const IDENTIFIER = /^[0-9a-f]{12,}$/i;
const SKIPPED = new Set(['index', 'default', 'home', 'main', 'amp', 'print']);
const MAX_LENGTH = 120;

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function clean(segment: string): string {
  const words = decode(segment)
    .replace(EXTENSION, '')
    .split(/[-_+\s]+/)
    .filter(Boolean);
  // A trailing identifier such as `-1a2b3c4d5e6f` is how some sites keep a slug unique.
  while (words.length > 1 && IDENTIFIER.test(words[words.length - 1] ?? '')) words.pop();
  return words.join(' ').trim();
}

function usable(segment: string): boolean {
  const bare = decode(segment).replace(EXTENSION, '');
  if (bare === '' || ONLY_DIGITS.test(bare) || IDENTIFIER.test(bare)) return false;
  return !SKIPPED.has(bare.toLowerCase());
}

export function titleFromAddress(address: string): string {
  const text = address.trim();
  if (text === '') return '';
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return '';
  }
  const segments = url.pathname.split('/').filter(Boolean);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index] as string;
    if (!usable(segment)) continue;
    const words = clean(segment);
    if (words === '') continue;
    const title = words.charAt(0).toUpperCase() + words.slice(1);
    return title.length > MAX_LENGTH ? `${title.slice(0, MAX_LENGTH - 1).trimEnd()}…` : title;
  }
  return '';
}

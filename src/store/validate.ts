import type { Result } from './types';
import { fail, ok } from './result';

export const LIMITS = {
  title: 300,
  author: 200,
  note: 5000,
  readingText: 500000,
  tags: 12,
  tagLength: 40,
  shelfName: 60,
} as const;

function tooLong(field: string, max: number): ReturnType<typeof fail> {
  return fail('too-long', `The ${field} can have at most ${max} characters.`, field);
}

export function hostnameTitle(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '') || url;
  } catch {
    return url;
  }
}

/** An empty title falls back to the host name of the (already normalised) URL. */
export function checkTitle(raw: string, url: string): Result<string> {
  const title = raw.trim() || hostnameTitle(url);
  return title.length > LIMITS.title ? tooLong('title', LIMITS.title) : ok(title);
}

/** Empty text means "not set" and comes back as `undefined`. */
export function checkOptionalText(raw: string, field: 'author' | 'note'): Result<string | undefined> {
  const text = raw.trim();
  if (text.length > LIMITS[field]) return tooLong(field, LIMITS[field]);
  return ok(text === '' ? undefined : text);
}

export function checkReadingText(raw: string): Result<string | undefined> {
  if (raw.length > LIMITS.readingText) return tooLong('readingText', LIMITS.readingText);
  return ok(raw.trim() === '' ? undefined : raw);
}

/** Tags are normalised rather than rejected: trimmed, de-duplicated, capped in length and count. */
export function normalizeTags(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const tag = item.trim().slice(0, LIMITS.tagLength).trim();
    const folded = tag.toLowerCase();
    if (tag === '' || seen.has(folded)) continue;
    seen.add(folded);
    tags.push(tag);
    if (tags.length === LIMITS.tags) break;
  }
  return tags;
}

export function checkShelfName(raw: string): Result<string> {
  const name = raw.trim();
  if (name === '') return fail('invalid-name', 'A shelf needs a name.', 'name');
  if (name.length > LIMITS.shelfName) return tooLong('name', LIMITS.shelfName);
  return ok(name);
}

import type { Result } from './types';
import { cleanLine, cleanText } from './clean-text';
import { fail, ok } from './result';

export const LIMITS = {
  title: 300,
  author: 200,
  note: 5000,
  readingText: 500000,
  tags: 12,
  tagLength: 40,
  shelfName: 60,
  shelfDescription: 500,
  shelfAuthor: 80,
  lang: 12,
  minutes: 600,
  privateNote: 2000,
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
  const title = cleanLine(raw) || hostnameTitle(url);
  return title.length > LIMITS.title ? tooLong('title', LIMITS.title) : ok(title);
}

/** Empty text means "not set" and comes back as `undefined`. */
export function checkOptionalText(raw: string, field: 'author' | 'note'): Result<string | undefined> {
  const text = field === 'note' ? cleanText(raw).trim() : cleanLine(raw);
  if (text.length > LIMITS[field]) return tooLong(field, LIMITS[field]);
  return ok(text === '' ? undefined : text);
}

export function checkReadingText(raw: string): Result<string | undefined> {
  const text = cleanText(raw);
  if (text.length > LIMITS.readingText) return tooLong('readingText', LIMITS.readingText);
  return ok(text.trim() === '' ? undefined : text);
}

/** Tags are normalised rather than rejected: trimmed, de-duplicated, capped in length and count. */
export function normalizeTags(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const tag = cleanLine(item).slice(0, LIMITS.tagLength).trim();
    const folded = tag.toLowerCase();
    if (tag === '' || seen.has(folded)) continue;
    seen.add(folded);
    tags.push(tag);
    if (tags.length === LIMITS.tags) break;
  }
  return tags;
}

/** A shelf description. Empty means "not set". */
export function checkDescription(raw: string): Result<string | undefined> {
  const text = cleanText(raw).trim();
  if (text.length > LIMITS.shelfDescription) return tooLong('description', LIMITS.shelfDescription);
  return ok(text === '' ? undefined : text);
}

/** The person who put a shelf together. Empty means "not set". */
export function checkShelfAuthor(raw: string): Result<string | undefined> {
  const text = cleanLine(raw);
  if (text.length > LIMITS.shelfAuthor) return tooLong('author', LIMITS.shelfAuthor);
  return ok(text === '' ? undefined : text);
}

const LANG = /^[A-Za-z0-9-]+$/;

/** A language tag such as `en` or `de-AT`. Empty means "not set". */
export function checkLang(raw: string): Result<string | undefined> {
  const text = raw.trim();
  if (text === '') return ok(undefined);
  if (text.length > LIMITS.lang || !LANG.test(text)) {
    return fail('invalid-lang', 'The language can only hold letters, digits and hyphens, up to 12 characters.', 'lang');
  }
  return ok(text);
}

/** A calendar date written `YYYY-MM-DD`. Empty means "not set". */
export function checkDue(raw: string): Result<string | undefined> {
  const text = raw.trim();
  if (text === '') return ok(undefined);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00.000Z`) : undefined;
  if (date === undefined || Number.isNaN(date.getTime()) || !date.toISOString().startsWith(text)) {
    return fail('invalid-due', 'The due date has to look like 2026-03-31.', 'due');
  }
  return ok(text);
}

export function checkMinutes(value: number): Result<number> {
  if (!Number.isInteger(value) || value < 1 || value > LIMITS.minutes) {
    return fail('invalid-minutes', `Reading time has to be a whole number of minutes from 1 to ${LIMITS.minutes}.`, 'minutes');
  }
  return ok(value);
}

/** A private note. Empty means "no note". */
export function checkPrivateNote(raw: string): Result<string | undefined> {
  const text = cleanText(raw).trim();
  if (text.length > LIMITS.privateNote) return tooLong('note', LIMITS.privateNote);
  return ok(text === '' ? undefined : text);
}

export function checkShelfName(raw: string): Result<string> {
  const name = cleanLine(raw);
  if (name === '') return fail('invalid-name', 'A shelf needs a name.', 'name');
  if (name.length > LIMITS.shelfName) return tooLong('name', LIMITS.shelfName);
  return ok(name);
}

/** Reading time of a volume: a stated length wins, otherwise it is estimated from the saved text. */

export const WORDS_PER_MINUTE = 220;

const CJK = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}';
/*
 * A word is a run of letters and digits, with an inner apostrophe or hyphen kept inside it. Scripts written
 * without spaces would count as one word per line, so each Han, Hiragana or Katakana character counts as one.
 */
const WORD = new RegExp(
  `[${CJK}]|(?:(?![${CJK}])[\\p{L}\\p{N}\\p{M}])+(?:['\\u2019-](?:(?![${CJK}])[\\p{L}\\p{N}\\p{M}])+)*`,
  'gu',
);

export function countWords(text: string): number {
  if (typeof text !== 'string' || text === '') return 0;
  const pattern = new RegExp(WORD.source, 'gu');
  let count = 0;
  while (pattern.exec(text) !== null) count += 1;
  return count;
}

/** Whole minutes, at least 1 for any text that is not blank. */
export function estimateMinutes(text: string | undefined): number | undefined {
  if (typeof text !== 'string' || text.trim() === '') return undefined;
  return Math.max(1, Math.ceil(countWords(text) / WORDS_PER_MINUTE));
}

export function minutesOf(volume: { minutes?: number; reading?: { text: string } }): number | undefined {
  const stated = volume.minutes;
  if (typeof stated === 'number' && Number.isFinite(stated) && stated > 0) return Math.round(stated) || 1;
  return estimateMinutes(volume.reading?.text);
}

/** `about 5 min`, `about 1 h 20 min`, `about 2 h`. Callers capitalise it at the start of a sentence. */
export function formatMinutes(total: number): string {
  const minutes = Number.isFinite(total) && total > 0 ? Math.round(total) : 0;
  if (minutes < 60) return `about ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `about ${hours} h` : `about ${hours} h ${rest} min`;
}

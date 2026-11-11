/**
 * Text hygiene for anything a person can paste or receive in a file.
 *
 * Direction overrides can make a link title read as something else than it is, and invisible characters
 * make two different titles look the same. Both are removed. Ordinary text in any script is left alone.
 */

/*
 * Removed: C0 controls except tab and newline (carriage returns are turned into newlines first),
 * zero-width and mark characters U+200B to U+200F, bidirectional embeddings and overrides U+202A to U+202E,
 * isolates U+2066 to U+2069 and the byte order mark U+FEFF.
 * A joiner (U+200D) is the one exception: it is kept when it glues two emoji together, because without it
 * a family or a flag-of-a-profession emoji falls apart into its parts.
 */
const REMOVED = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u200B\\u200C\\u200E\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]' +
    '|(?<![\\p{Extended_Pictographic}\\p{Emoji_Modifier}\\uFE0F])\\u200D' +
    '|\\u200D(?!\\p{Extended_Pictographic})',
  'gu',
);

const LINE_BREAKS = /[ \t]*[\n\u2028\u2029]+[ \t]*/g;

/** Removes direction overrides, invisible characters and control characters. Keeps tabs and newlines. */
export function cleanText(value: string): string {
  if (typeof value !== 'string') return '';
  const text = value.includes('\r') ? value.replace(/\r\n?/g, '\n') : value;
  return text.replace(REMOVED, '');
}

/** `cleanText`, then every run of line breaks becomes one space and the ends are trimmed. */
export function cleanLine(value: string): string {
  return cleanText(value).replace(LINE_BREAKS, ' ').trim();
}

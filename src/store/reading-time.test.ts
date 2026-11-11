import { describe, expect, it } from 'vitest';
import { WORDS_PER_MINUTE, countWords, estimateMinutes, formatMinutes, minutesOf } from './reading-time';

const words = (count: number): string => Array.from({ length: count }, () => 'word').join(' ');

describe('countWords', () => {
  it('counts words separated by spaces and line breaks', () => {
    expect(countWords('one two  three\nfour\t\tfive\r\nsix')).toBe(6);
  });

  it('is zero for empty and blank text', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n\t ')).toBe(0);
    expect(countWords(undefined as unknown as string)).toBe(0);
  });

  it('does not count markdown marks, bullets or lone punctuation', () => {
    expect(countWords('# Heading\n\n- item one\n- item two\n\n--- ... ***')).toBe(5);
  });

  it('keeps hyphenated words and contractions as one word', () => {
    expect(countWords("well-known don't “quoted”")).toBe(3);
    expect(countWords('state-of-the-art')).toBe(1);
  });

  it('counts numbers and decimals', () => {
    expect(countWords('In 2026 there were 3 or 4 cases')).toBe(8);
    expect(countWords('3.14')).toBe(2);
  });

  it('handles German, with umlauts and decomposed accents', () => {
    expect(countWords('Größere Straßen führen über Äcker')).toBe(5);
    expect(countWords('Café au lait')).toBe(3);
  });

  it('counts Arabic words', () => {
    expect(countWords('مرحبا بالعالم')).toBe(2);
  });

  it('counts each CJK character, since those scripts have no spaces', () => {
    expect(countWords('日本語のタイトル')).toBe(8);
    expect(countWords('read 日本 now')).toBe(4);
  });

  it('counts the 500,000 character limit quickly', () => {
    const text = 'lorem ipsum dolor sit amet '.repeat(18500);
    const start = performance.now();
    expect(countWords(text)).toBe(18500 * 5);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it('can be called repeatedly without keeping state', () => {
    expect(countWords('a b c')).toBe(3);
    expect(countWords('a b c')).toBe(3);
  });
});

describe('estimateMinutes', () => {
  it('uses 220 words per minute, rounded up', () => {
    expect(WORDS_PER_MINUTE).toBe(220);
    expect(estimateMinutes(words(220))).toBe(1);
    expect(estimateMinutes(words(221))).toBe(2);
    expect(estimateMinutes(words(2200))).toBe(10);
    expect(estimateMinutes(words(2201))).toBe(11);
  });

  it('gives at least one minute for any text that is not blank', () => {
    expect(estimateMinutes('Short.')).toBe(1);
    expect(estimateMinutes('---')).toBe(1);
  });

  it('is unknown for missing, empty and blank text', () => {
    expect(estimateMinutes(undefined)).toBeUndefined();
    expect(estimateMinutes('')).toBeUndefined();
    expect(estimateMinutes('  \n ')).toBeUndefined();
  });
});

describe('minutesOf', () => {
  it('prefers the stated length', () => {
    expect(minutesOf({ minutes: 12, reading: { text: words(5000) } })).toBe(12);
    expect(minutesOf({ minutes: 12 })).toBe(12);
  });

  it('estimates from the reading text when no length is stated', () => {
    expect(minutesOf({ reading: { text: words(440) } })).toBe(2);
  });

  it('is unknown with neither', () => {
    expect(minutesOf({})).toBeUndefined();
    expect(minutesOf({ reading: { text: '  ' } })).toBeUndefined();
  });

  it('ignores a stated length that is not a usable number', () => {
    expect(minutesOf({ minutes: 0, reading: { text: words(220) } })).toBe(1);
    expect(minutesOf({ minutes: -4 })).toBeUndefined();
    expect(minutesOf({ minutes: Number.NaN })).toBeUndefined();
    expect(minutesOf({ minutes: Number.POSITIVE_INFINITY })).toBeUndefined();
  });
});

describe('formatMinutes', () => {
  it.each([
    [0, 'about 0 min'],
    [1, 'about 1 min'],
    [5, 'about 5 min'],
    [59, 'about 59 min'],
    [60, 'about 1 h'],
    [80, 'about 1 h 20 min'],
    [125, 'about 2 h 5 min'],
    [120, 'about 2 h'],
    [600, 'about 10 h'],
    [4.6, 'about 5 min'],
  ])('formats %s minutes as %j', (total, expected) => {
    expect(formatMinutes(total)).toBe(expected);
  });

  it('treats a negative or non-finite total as zero', () => {
    expect(formatMinutes(-3)).toBe('about 0 min');
    expect(formatMinutes(Number.NaN)).toBe('about 0 min');
  });
});

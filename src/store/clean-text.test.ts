import { describe, expect, it } from 'vitest';
import { cleanLine, cleanText } from './clean-text';

/** Builds text from code points so the hostile characters never sit in this source file. */
function chars(...codes: number[]): string {
  return String.fromCodePoint(...codes);
}

function span(from: number, to: number): string[] {
  const out: string[] = [];
  for (let code = from; code <= to; code += 1) out.push(chars(code));
  return out;
}

function hex(char: string): string {
  return (char.codePointAt(0) ?? 0).toString(16).toUpperCase();
}

const ZWJ = chars(0x200d);
const OVERRIDE = chars(0x202e);
const ZERO_WIDTH_SPACE = chars(0x200b);
const BOM = chars(0xfeff);
const ISOLATE = chars(0x2066);
const FAMILY = chars(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
const DEVELOPER = chars(0x1f9d1, 0x200d, 0x1f4bb);
const THUMB = chars(0x1f44d);

describe('cleanText', () => {
  it.each(span(0x202a, 0x202e).map((char) => [hex(char), char] as const))(
    'removes the direction override U+%s',
    (_code, char) => {
      expect(cleanText(`a${char}b`)).toBe('ab');
    },
  );

  it.each(span(0x2066, 0x2069).map((char) => [hex(char), char] as const))(
    'removes the direction isolate U+%s',
    (_code, char) => {
      expect(cleanText(`a${char}b`)).toBe('ab');
    },
  );

  it.each(span(0x200b, 0x200f).map((char) => [hex(char), char] as const))(
    'removes the invisible character U+%s',
    (_code, char) => {
      expect(cleanText(`a${char}b`)).toBe('ab');
    },
  );

  it('removes the byte order mark', () => {
    expect(cleanText(`${BOM}Title`)).toBe('Title');
  });

  it('removes C0 controls but keeps tab and newline', () => {
    const controls = [...span(0, 8), chars(0x0b), chars(0x0c), ...span(0x0e, 0x1f)].join('');
    expect(cleanText(`a${controls}b\tc\nd`)).toBe('ab\tc\nd');
  });

  it('turns carriage returns into newlines instead of dropping them', () => {
    expect(cleanText('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('shows a title that was disguised with an override as the plain letters', () => {
    expect(cleanText(`gpj.${OVERRIDE}txt`)).toBe('gpj.txt');
  });

  it.each([
    'Über größere Maße: Äpfel, Öl und Straße',
    'مرحبا بالعالم، هذا نص عربي',
    '日本語のタイトルと中文标题 한국어',
    'Café ☕ and 🚀 and 👍🏽',
    `${FAMILY} family, ${DEVELOPER} developer`,
    '“Anführungszeichen” und „deutsche“ Zeichen – Gedankenstrich',
    'line one\n\tindented line two',
  ])('leaves ordinary text untouched: %s', (text) => {
    expect(cleanText(text)).toBe(text);
  });

  it('removes a joiner that does not join emoji', () => {
    expect(cleanText(`a${ZWJ}b`)).toBe('ab');
    expect(cleanText(`${ZWJ}${THUMB}`)).toBe(THUMB);
    expect(cleanText(`${THUMB}${ZWJ}`)).toBe(THUMB);
  });

  it('returns an empty string for a title made only of removed characters', () => {
    const only = `${OVERRIDE}${ZERO_WIDTH_SPACE}${BOM}${chars(0)}${ISOLATE}`;
    expect(cleanText(only)).toBe('');
    expect(cleanLine(` ${only} \n `)).toBe('');
  });

  it('returns an empty string for a value that is not a string', () => {
    expect(cleanText(undefined as unknown as string)).toBe('');
    expect(cleanLine(null as unknown as string)).toBe('');
  });

  it('is fast on a long text', () => {
    const text = `Zeile mit ${ZERO_WIDTH_SPACE}versteckten${OVERRIDE} Zeichen\n`.repeat(15000);
    const start = performance.now();
    const cleaned = cleanText(text);
    expect(performance.now() - start).toBeLessThan(500);
    expect(cleaned.includes(ZERO_WIDTH_SPACE)).toBe(false);
    expect(cleaned.includes(OVERRIDE)).toBe(false);
  });
});

describe('cleanLine', () => {
  it('collapses line breaks into one space and trims', () => {
    expect(cleanLine('  first\nsecond\r\n\r\nthird \n')).toBe('first second third');
  });

  it('treats unicode line and paragraph separators as line breaks', () => {
    expect(cleanLine(`a${chars(0x2028)}b${chars(0x2029)}c`)).toBe('a b c');
  });

  it('does not stack spaces around a break', () => {
    expect(cleanLine('a  \n  b')).toBe('a b');
  });

  it('also removes the hostile characters', () => {
    expect(cleanLine(`${OVERRIDE}evil${ZERO_WIDTH_SPACE} title\n`)).toBe('evil title');
  });

  it('keeps ordinary text as it is', () => {
    expect(cleanLine('Größe und 日本語 🚀')).toBe('Größe und 日本語 🚀');
  });
});

import { describe, expect, it } from 'vitest';
import { MAX_INPUT_LENGTH, parseInlines, parseMarkdownLite, safeHttpUrl } from './parse';

const text = (v: string) => ({ t: 'text', v }) as const;

describe('block types', () => {
  it('maps # and ## to level 2 and ### to level 3', () => {
    expect(parseMarkdownLite('# One\n\n## Two\n\n### Three')).toEqual([
      { type: 'heading', level: 2, inlines: [text('One')] },
      { type: 'heading', level: 2, inlines: [text('Two')] },
      { type: 'heading', level: 3, inlines: [text('Three')] },
    ]);
  });

  it('does not treat a hashtag or a fourth level as a heading', () => {
    expect(parseMarkdownLite('#tag')[0]?.type).toBe('paragraph');
    expect(parseMarkdownLite('#### deep')[0]?.type).toBe('paragraph');
  });

  it('joins consecutive text lines with a space and splits on blank lines', () => {
    expect(parseMarkdownLite('one\ntwo\n\nthree')).toEqual([
      { type: 'paragraph', inlines: [text('one two')] },
      { type: 'paragraph', inlines: [text('three')] },
    ]);
  });

  it('joins quote lines into one quote block', () => {
    expect(parseMarkdownLite('> first\n> second\n\n> other')).toEqual([
      { type: 'quote', inlines: [text('first second')] },
      { type: 'quote', inlines: [text('other')] },
    ]);
  });

  it('reads unordered lists with - and *', () => {
    expect(parseMarkdownLite('- a\n* b')).toEqual([
      { type: 'list', ordered: false, items: [[text('a')], [text('b')]] },
    ]);
  });

  it('reads ordered lists', () => {
    expect(parseMarkdownLite('1. a\n2. b')).toEqual([
      { type: 'list', ordered: true, items: [[text('a')], [text('b')]] },
    ]);
  });

  it('keeps *emphasis* at the start of a line out of the list syntax', () => {
    expect(parseMarkdownLite('*soft* start')[0]?.type).toBe('paragraph');
  });

  it('reads a rule on its own line', () => {
    expect(parseMarkdownLite('a\n\n---\n\nb').map((block) => block.type)).toEqual(['paragraph', 'rule', 'paragraph']);
  });

  it('keeps fenced code raw, including markers and blank lines', () => {
    const blocks = parseMarkdownLite('```ts\nconst a = **1**;\n\n  indented\n```\nafter');
    expect(blocks[0]).toEqual({ type: 'code', text: 'const a = **1**;\n\n  indented' });
    expect(blocks[1]?.type).toBe('paragraph');
  });

  it('closes an unterminated fence at the end of the input', () => {
    expect(parseMarkdownLite('```\nline')).toEqual([{ type: 'code', text: 'line' }]);
  });

  it('lets a heading interrupt a paragraph', () => {
    expect(parseMarkdownLite('intro\n## Next').map((block) => block.type)).toEqual(['paragraph', 'heading']);
  });
});

describe('inlines', () => {
  it('parses strong, em with * and _, and code', () => {
    expect(parseInlines('a **b** *c* _d_ `e`')).toEqual([
      text('a '),
      { t: 'strong', c: [text('b')] },
      text(' '),
      { t: 'em', c: [text('c')] },
      text(' '),
      { t: 'em', c: [text('d')] },
      text(' '),
      { t: 'code', v: 'e' },
    ]);
  });

  it('nests emphasis inside strong', () => {
    expect(parseInlines('**a *b***')).toEqual([{ t: 'strong', c: [text('a '), { t: 'em', c: [text('b')] }] }]);
  });

  it('keeps markers inside code literal', () => {
    expect(parseInlines('`**x**`')).toEqual([{ t: 'code', v: '**x**' }]);
  });

  it('keeps snake_case words literal', () => {
    expect(parseInlines('use snake_case_names here')).toEqual([text('use snake_case_names here')]);
  });

  it('keeps unbalanced markers as text', () => {
    expect(parseInlines('**bold')).toEqual([text('**bold')]);
    expect(parseInlines('*em')).toEqual([text('*em')]);
    expect(parseInlines('a ` b')).toEqual([text('a ` b')]);
    expect(parseInlines('[label](https://example.com')).toEqual([text('[label](https://example.com')]);
    expect(parseInlines('2 * 3 * 4')).toEqual([text('2 * 3 * 4')]);
  });

  it('keeps http and https links', () => {
    expect(parseInlines('[site](https://example.com/a?b=1) and [plain](http://example.org)')).toEqual([
      { t: 'link', href: 'https://example.com/a?b=1', c: [text('site')] },
      text(' and '),
      { t: 'link', href: 'http://example.org', c: [text('plain')] },
    ]);
  });

  it('allows balanced parentheses in a link target', () => {
    expect(parseInlines('[w](https://example.com/a_(b))')).toEqual([
      { t: 'link', href: 'https://example.com/a_(b)', c: [text('w')] },
    ]);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html;base64,AAAA',
    'vbscript:x',
    '/relative/path',
    '//example.com/x',
    'example.com',
    'ftp://example.com',
    'mailto:a@b.c',
    '',
  ])('turns the unsafe target %j into plain label text', (target) => {
    expect(parseInlines(`[label](${target})`)).toEqual([text('label')]);
  });

  it('rejects unsafe targets in safeHttpUrl', () => {
    expect(safeHttpUrl('https://example.com')).toBe('https://example.com');
    expect(safeHttpUrl('  https://example.com  ')).toBe('https://example.com');
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('https://exa mple.com')).toBeNull();
    expect(safeHttpUrl('https://')).toBeNull();
  });
});

describe('raw HTML', () => {
  it('stays text', () => {
    const blocks = parseMarkdownLite('<script>alert(1)</script> and <img src=x onerror=alert(1)>');
    expect(blocks).toEqual([
      { type: 'paragraph', inlines: [text('<script>alert(1)</script> and <img src=x onerror=alert(1)>')] },
    ]);
  });
});

describe('robustness', () => {
  it('normalises CRLF and lone CR', () => {
    expect(parseMarkdownLite('a\r\nb\r\n\r\nc\rd')).toEqual([
      { type: 'paragraph', inlines: [text('a b')] },
      { type: 'paragraph', inlines: [text('c d')] },
    ]);
  });

  it('returns nothing for empty or blank input', () => {
    expect(parseMarkdownLite('')).toEqual([]);
    expect(parseMarkdownLite('  \n \n')).toEqual([]);
  });

  it('never throws on non-string input', () => {
    expect(parseMarkdownLite(undefined as unknown as string)).toEqual([]);
    expect(parseMarkdownLite(42 as unknown as string)).toEqual([]);
  });

  it('caps the input length', () => {
    const blocks = parseMarkdownLite('a'.repeat(MAX_INPUT_LENGTH + 5000));
    const paragraph = blocks[0];
    expect(paragraph?.type).toBe('paragraph');
    const first = paragraph?.type === 'paragraph' ? paragraph.inlines[0] : undefined;
    expect(first?.t === 'text' ? first.v.length : 0).toBe(MAX_INPUT_LENGTH);
  });

  it('stays fast on pathological marker runs', () => {
    const started = performance.now();
    parseMarkdownLite('*a '.repeat(100_000));
    parseMarkdownLite('['.repeat(200_000));
    parseMarkdownLite('**'.repeat(100_000));
    parseMarkdownLite('_a'.repeat(100_000));
    expect(performance.now() - started).toBeLessThan(4000);
  });
});

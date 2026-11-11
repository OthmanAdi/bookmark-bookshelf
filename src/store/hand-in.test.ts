import { describe, expect, it } from 'vitest';
import type { HandInInput, HandInVolume } from './hand-in';
import { handInSummary } from './hand-in';
import { minutesOf } from './reading-time';

const DATE = new Date(2026, 2, 31, 12, 0, 0);

function vol(n: number, extra: Partial<HandInVolume> = {}): HandInVolume {
  return { id: `v${n}`, title: `Title ${n}`, url: `https://www.example.org/${n}`, ...extra };
}

function input(volumes: HandInVolume[], extra: Partial<HandInInput> & { done?: string[]; notes?: Record<string, string> } = {}): HandInInput {
  const { done = [], notes = {}, ...rest } = extra;
  return {
    shelfName: 'Week 3',
    volumes,
    isDone: (id) => done.includes(id),
    noteOf: (id) => notes[id],
    minutesOf,
    date: DATE,
    lang: 'en-GB',
    ...rest,
  };
}

describe('handInSummary', () => {
  it('writes a heading, a status line, one line per volume and the self-reported line', () => {
    const text = handInSummary(
      input([vol(1, { minutes: 10 }), vol(2, { minutes: 25 }), vol(3)], { done: ['v1', 'v3'], notes: { v1: 'Liked the second half.' } }),
    );
    expect(text).toBe(
      [
        'Reading summary: Week 3 (31 March 2026)',
        '2 of 3 read. About 10 min of reading.',
        '',
        '[x] Title 1 (example.org)',
        '    Liked the second half.',
        '[ ] Title 2 (example.org)',
        '[x] Title 3 (example.org)',
        '',
        'This list is self-reported.',
      ].join('\n'),
    );
  });

  it('formats the date in the given language', () => {
    expect(handInSummary(input([vol(1)], { lang: 'de-DE' })).split('\n')[0]).toBe('Reading summary: Week 3 (31. März 2026)');
    expect(handInSummary(input([vol(1)], { lang: 'en-US' })).split('\n')[0]).toBe('Reading summary: Week 3 (March 31, 2026)');
  });

  it('falls back to the default language for a tag that does not exist', () => {
    const first = handInSummary(input([vol(1)], { lang: 'not a tag!!' })).split('\n')[0] ?? '';
    expect(first).toContain('2026');
  });

  it('indents every line of a multi-line note and drops empty notes', () => {
    const text = handInSummary(
      input([vol(1), vol(2), vol(3)], { done: ['v1'], notes: { v1: 'First line.\nSecond line.  \n\nFourth line.', v2: '   ', v3: '' } }),
    );
    const lines = text.split('\n');
    expect(lines.slice(3, 8)).toEqual([
      '[x] Title 1 (example.org)',
      '    First line.',
      '    Second line.',
      '',
      '    Fourth line.',
    ]);
    expect(lines).toContain('[ ] Title 2 (example.org)');
    expect(lines).toContain('[ ] Title 3 (example.org)');
    expect(lines.filter((line) => line.startsWith('    ')).length).toBe(3);
  });

  it('says nothing read yet, all read and an empty shelf', () => {
    expect(handInSummary(input([vol(1), vol(2)])).split('\n')[1]).toBe('Nothing read yet.');
    expect(handInSummary(input([vol(1), vol(2)], { done: ['v1', 'v2'] })).split('\n')[1]).toBe('All 2 read.');
    expect(handInSummary(input([vol(1)], { done: ['v1'] })).split('\n')[1]).toBe('Read.');
    expect(handInSummary(input([])).split('\n')).toEqual([
      'Reading summary: Week 3 (31 March 2026)',
      'This shelf is empty.',
      '',
      'This list is self-reported.',
    ]);
  });

  it('counts the required volumes when some are optional', () => {
    const text = handInSummary(input([vol(1), vol(2, { required: false }), vol(3)], { done: ['v1', 'v2'] }));
    expect(text.split('\n')[1]).toBe('2 of 3 read. Required: 1 of 2.');
  });

  it('adds up the reading time of what was read, from a stated length or the text', () => {
    const volumes = [vol(1, { minutes: 20 }), vol(2, { reading: { text: 'word '.repeat(440) } }), vol(3, { minutes: 60 }), vol(4)];
    const text = handInSummary(input(volumes, { done: ['v1', 'v2', 'v4'] }));
    expect(text.split('\n')[1]).toBe('3 of 4 read. About 22 min of reading.');
    const hours = handInSummary(input(volumes, { done: ['v1', 'v3'] }));
    expect(hours.split('\n')[1]).toBe('2 of 4 read. About 1 h 20 min of reading.');
  });

  it('leaves the reading time out when no length is known', () => {
    expect(handInSummary(input([vol(1), vol(2)], { done: ['v1'] })).split('\n')[1]).toBe('1 of 2 read.');
  });

  it('uses the injected length function', () => {
    const text = handInSummary(input([vol(1)], { done: ['v1'], minutesOf: () => 7 }));
    expect(text.split('\n')[1]).toBe('Read. About 7 min of reading.');
  });

  it('keeps the title on one line and falls back to the host when it is empty', () => {
    const text = handInSummary(input([vol(1, { title: 'Two\nlines' }), vol(2, { title: '' }), vol(3, { url: 'not a url', title: '' })]));
    const lines = text.split('\n');
    expect(lines).toContain('[ ] Two lines (example.org)');
    expect(lines).toContain('[ ] example.org');
    expect(lines).toContain('[ ] not a url');
  });

  it('removes hostile characters from the shelf name, titles and notes', () => {
    const override = String.fromCodePoint(0x202e);
    const text = handInSummary(
      input([vol(1, { title: `Ti${override}tle` })], { shelfName: `Sh${override}elf`, notes: { v1: `no${override}te` } }),
    );
    expect(text).toContain('Reading summary: Shelf (');
    expect(text).toContain('[ ] Title (example.org)');
    expect(text).toContain('    note');
    expect(text.includes(override)).toBe(false);
  });

  it('is plain text with no markup characters added', () => {
    const text = handInSummary(input([vol(1)]));
    expect(text).not.toMatch(/[<>*_`#]/);
    expect(text.endsWith('This list is self-reported.')).toBe(true);
  });
});

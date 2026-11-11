import { describe, expect, it } from 'vitest';
import { defaultReaderLabels, estimateMinutes, formatSavedDate, hostnameOf, resolveLabels } from './meta';
import { revealFrame } from './reveal';

describe('estimateMinutes', () => {
  const words = (count: number) => Array.from({ length: count }, () => 'word').join(' ');

  it('is at least 1', () => {
    expect(estimateMinutes('')).toBe(1);
    expect(estimateMinutes('   \n ')).toBe(1);
    expect(estimateMinutes('one two three')).toBe(1);
  });

  it('uses 220 words per minute and rounds up', () => {
    expect(estimateMinutes(words(220))).toBe(1);
    expect(estimateMinutes(words(221))).toBe(2);
    expect(estimateMinutes(words(2200))).toBe(10);
  });
});

describe('labels and helpers', () => {
  it('merges label overrides and ignores undefined values', () => {
    const labels = resolveLabels({ close: 'Zu', cancel: undefined });
    expect(labels.close).toBe('Zu');
    expect(labels.cancel).toBe(defaultReaderLabels.cancel);
  });

  it('has the documented default texts', () => {
    expect(defaultReaderLabels.close).toBe('Close');
    expect(defaultReaderLabels.emptyTitle).toBe('No reading copy yet');
    expect(defaultReaderLabels.emptyBody).toContain('Paste the text you want to read');
    expect(JSON.stringify(Object.values(defaultReaderLabels).filter((v) => typeof v === 'string'))).not.toMatch(
      /[–—]|\s-\s/,
    );
  });

  it('strips www from the hostname and tolerates garbage', () => {
    expect(hostnameOf('https://www.example.com/a')).toBe('example.com');
    expect(hostnameOf('not a url')).toBe('');
  });

  it('formats saved dates and rejects invalid ones', () => {
    expect(formatSavedDate('2026-03-04T10:00:00Z', 'en')?.text).toMatch(/2026/);
    expect(formatSavedDate('nonsense')).toBeNull();
    expect(formatSavedDate(undefined)).toBeNull();
  });
});

describe('revealFrame', () => {
  const viewport = { width: 1000, height: 800 };
  const from = { x: 100, y: 50, width: 200, height: 300 };

  it('is closed at 0 and open at 1 with no inline transforms', () => {
    expect(revealFrame(0, from, viewport)).toMatchObject({ closed: true, open: false, windowTransform: '' });
    expect(revealFrame(-1, from, viewport).closed).toBe(true);
    expect(revealFrame(1, from, viewport)).toMatchObject({ closed: false, open: true, windowTransform: '', sheetTransform: '' });
    expect(revealFrame(7, from, viewport).open).toBe(true);
  });

  it('grows the window from the box using transforms only', () => {
    const frame = revealFrame(0.5, from, viewport);
    expect(frame.windowTransform).toBe('translate(50px, 25px) scale(0.6, 0.688)');
    expect(frame.opacity).toBe('1');
    expect(frame.open).toBe(false);
  });

  it('keeps the content in place: window and sheet transforms cancel out', () => {
    const p = 0.3;
    const x = from.x * (1 - p);
    const sx = (from.width + (viewport.width - from.width) * p) / viewport.width;
    const frame = revealFrame(p, from, viewport);
    const shift = Number(/translate\((-?[\d.]+)px/.exec(frame.sheetTransform)?.[1]);
    const scale = Number(/scale\(([\d.]+)/.exec(frame.sheetTransform)?.[1]);
    expect(x + sx * shift).toBeCloseTo(0, 1);
    expect(sx * scale).toBeCloseTo(1, 2);
  });

  it('ramps the content in over the first 40 percent', () => {
    expect(revealFrame(0.2, from, viewport).opacity).toBe('0.5');
    expect(revealFrame(0.4, from, viewport).opacity).toBe('1');
  });

  it('fades only, with no transforms, when there is no source box', () => {
    expect(revealFrame(0.25, null, viewport)).toMatchObject({ windowTransform: '', sheetTransform: '', opacity: '0.25' });
    expect(revealFrame(0.25, { x: 0, y: 0, width: 0, height: 10 }, viewport).windowTransform).toBe('');
  });
});

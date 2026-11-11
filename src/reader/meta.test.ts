import { describe, expect, it } from 'vitest';
import { defaultReaderLabels, estimateMinutes, formatSavedDate, hostnameOf, resolveLabels } from './meta';

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

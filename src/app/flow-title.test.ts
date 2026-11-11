import { describe, expect, it } from 'vitest';
import { titleFromAddress } from './flow-title';

describe('titleFromAddress', () => {
  it('uses the last part of the path, cleaned and in sentence case', () => {
    expect(titleFromAddress('https://example.org/2025/03/12/technology/why-we-keep-tabs-open.html')).toBe('Why we keep tabs open');
    expect(titleFromAddress('https://example.com/someone/planning-with-files')).toBe('Planning with files');
    expect(titleFromAddress('https://example.com/notes_on_margins')).toBe('Notes on margins');
  });

  it('keeps capitals that are already there', () => {
    expect(titleFromAddress('https://example.org/wiki/OpenType_features')).toBe('OpenType features');
  });

  it('reads percent-encoded words', () => {
    expect(titleFromAddress('https://example.org/blog/caf%C3%A9-life')).toBe('Café life');
  });

  it('skips numbers, identifiers and index pages and uses the part above', () => {
    expect(titleFromAddress('https://example.org/essays/on-margins/42')).toBe('On margins');
    expect(titleFromAddress('https://example.org/essays/on-margins/index.html')).toBe('On margins');
    expect(titleFromAddress('https://example.org/essays/0123456789abcdef0123456789')).toBe('Essays');
  });

  it('drops a trailing identifier from a slug', () => {
    expect(titleFromAddress('https://example.org/read/the-long-way-round-1a2b3c4d5e6f7')).toBe('The long way round');
  });

  it('ignores the query and the fragment', () => {
    expect(titleFromAddress('https://example.org/a-page?utm_source=x#top')).toBe('A page');
  });

  it('takes an address typed without a scheme', () => {
    expect(titleFromAddress('example.org/short-guide')).toBe('Short guide');
  });

  it('gives nothing for a bare site, so the store can name the link after it', () => {
    expect(titleFromAddress('https://example.org')).toBe('');
    expect(titleFromAddress('https://example.org/')).toBe('');
    expect(titleFromAddress('')).toBe('');
    expect(titleFromAddress('not an address')).toBe('');
  });

  it('keeps a very long title within bounds', () => {
    const title = titleFromAddress(`https://example.org/${'word-'.repeat(60)}end`);
    expect(title.length).toBeLessThanOrEqual(120);
    expect(title.endsWith('…')).toBe(true);
  });
});

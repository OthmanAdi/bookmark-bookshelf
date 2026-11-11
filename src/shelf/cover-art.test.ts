import { describe, expect, it } from 'vitest';
import { createCover, createCoverArt } from './cover-art';
import { PATTERNS } from './variants';
import type { ShelfItem } from './types';

const item = (overrides: Partial<ShelfItem> = {}): ShelfItem => ({ id: 'a', title: 'A Title', ...overrides });

describe('createCoverArt', () => {
  it.each(PATTERNS)('draws at least one shape for %s', (pattern) => {
    const svg = createCoverArt(pattern, 5);
    expect(svg.childElementCount).toBeGreaterThan(0);
  });

  it.each(PATTERNS)('is deterministic for %s: the same seed gives identical markup', (pattern) => {
    expect(createCoverArt(pattern, 42).outerHTML).toBe(createCoverArt(pattern, 42).outerHTML);
  });

  it.each(PATTERNS)('differs between seeds for %s', (pattern) => {
    expect(createCoverArt(pattern, 1).outerHTML).not.toBe(createCoverArt(pattern, 2).outerHTML);
  });

  it('falls back to the first pattern for an unknown or missing name', () => {
    const fallback = createCoverArt(PATTERNS[0], 9).outerHTML;
    expect(createCoverArt('no-such-pattern', 9).outerHTML).toBe(fallback);
    expect(createCoverArt(undefined, 9).outerHTML).toBe(fallback);
  });

  it('defaults the seed to 1', () => {
    expect(createCoverArt('bars').outerHTML).toBe(createCoverArt('bars', 1).outerHTML);
  });

  it('produces finite numbers only, even for odd seeds', () => {
    for (const seed of [0, -7, 1.5, 2 ** 32 + 3, Number.MAX_SAFE_INTEGER]) {
      for (const pattern of PATTERNS) {
        expect(createCoverArt(pattern, seed).outerHTML).not.toMatch(/NaN|Infinity/);
      }
    }
  });

  it('is a decorative svg that fills its box', () => {
    const svg = createCoverArt('arcs', 3);
    expect(svg.getAttribute('viewBox')).toBe('0 0 100 100');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.classList.contains('bb-cover__art')).toBe(true);
  });
});

describe('createCover', () => {
  it('puts the title, author, imprint and mark in as text', () => {
    const cover = createCover(item({ source: 'www.example.com', author: 'Ada' }), '07');
    expect(cover.querySelector('.bb-cover__title')?.textContent).toBe('A Title');
    expect(cover.querySelector('.bb-cover__author')?.textContent).toBe('Ada');
    expect(cover.querySelector('.bb-cover__imprint')?.textContent).toBe('Example');
    expect(cover.querySelector('.bb-cover__mark')?.textContent).toBe('07');
  });

  it('sets the imprint at the foot and nothing about the site at the head', () => {
    const cover = createCover(item({ source: 'en.wikipedia.org' }));
    expect(cover.querySelector('.bb-cover__foot > .bb-cover__imprint')?.textContent).toBe('Wikipedia');
    expect(cover.querySelector('.bb-cover__head')?.textContent).toBe('A Title');
  });

  it('omits imprint, author and mark when there are none', () => {
    const cover = createCover(item());
    expect(cover.querySelector('.bb-cover__imprint')).toBeNull();
    expect(cover.querySelector('.bb-cover__foot')).toBeNull();
    expect(createCover(item({ source: 'localhost' })).querySelector('.bb-cover__imprint')).toBeNull();
    expect(cover.querySelector('.bb-cover__author')).toBeNull();
    expect(cover.querySelector('.bb-cover__mark')).toBeNull();
  });

  it('falls back to the item mark when no mark argument is given', () => {
    expect(createCover(item({ mark: 'X1' })).querySelector('.bb-cover__mark')?.textContent).toBe('X1');
  });

  it('sets the mark at the foot, not in a box at the head', () => {
    const cover = createCover(item(), '07');
    expect(cover.querySelector('.bb-cover__foot > .bb-cover__mark')).not.toBeNull();
    expect(cover.querySelector('.bb-cover__head .bb-cover__mark')).toBeNull();
  });

  it('is hidden from assistive technology, since everything on it is said beside it', () => {
    expect(createCover(item()).getAttribute('aria-hidden')).toBe('true');
  });

  it('renders markup in a title as text and creates no elements from it', () => {
    const hostile = '<img src=x onerror=1>';
    const cover = createCover(item({ title: hostile, source: `${hostile}.example.org`, author: hostile }));
    expect(cover.querySelector('img')).toBeNull();
    expect(cover.querySelector('.bb-cover__title')?.textContent).toBe(hostile);
    expect(cover.querySelector('.bb-cover__imprint')?.textContent).toBe('Example');
    expect(cover.querySelector('.bb-cover__author')?.textContent).toBe(hostile);
    expect(cover.querySelectorAll('[onerror]').length).toBe(0);
  });

  it('sizes the title from its text and hyphenates only what cannot fit', () => {
    const short = createCover(item({ title: 'CSS' })).querySelector<HTMLElement>('.bb-cover__title')!;
    const long = createCover(item({ title: 'Bundesausbildungsförderungsgesetz', lang: 'de' }));
    const longTitle = long.querySelector<HTMLElement>('.bb-cover__title')!;
    expect(parseFloat(short.style.getPropertyValue('--bb-cover-title'))).toBeGreaterThan(
      parseFloat(longTitle.style.getPropertyValue('--bb-cover-title')),
    );
    expect(short.style.getPropertyValue('--bb-cover-title')).toMatch(/^\d+(\.\d)?cqw$/);
    expect(Number(short.style.getPropertyValue('--bb-cover-lines'))).toBeGreaterThanOrEqual(1);
    expect(short.classList.contains('bb-cover__title--break')).toBe(false);
    expect(longTitle.classList.contains('bb-cover__title--break')).toBe(true);
    expect(long.lang).toBe('de');
  });

  it('takes the language from the item only when it is a plain language tag', () => {
    expect(createCover(item({ lang: 'de-AT' })).lang).toBe('de-AT');
    expect(createCover(item({ lang: 'de" onload="x' })).hasAttribute('lang')).toBe(false);
    expect(createCover(item()).hasAttribute('lang')).toBe(false);
  });

  it('records the resolved pattern and cloth', () => {
    const cover = createCover(item({ pattern: 'waves', cloth: 'rust' }));
    expect(cover.dataset.pattern).toBe('waves');
    expect(cover.classList.contains('bb-cloth--rust')).toBe(true);

    const unknown = createCover(item({ pattern: 'nope', cloth: 'nope' }));
    expect(unknown.dataset.pattern).toBe(PATTERNS[0]);
    expect(unknown.classList.contains('bb-cloth--ink')).toBe(true);
  });

  it('contains the drawing for the item seed', () => {
    const first = createCover(item({ pattern: 'dots', seed: 3 }));
    const second = createCover(item({ pattern: 'dots', seed: 3 }));
    const other = createCover(item({ pattern: 'dots', seed: 4 }));
    expect(first.querySelector('svg')?.outerHTML).toBe(second.querySelector('svg')?.outerHTML);
    expect(first.querySelector('svg')?.outerHTML).not.toBe(other.querySelector('svg')?.outerHTML);
  });
});

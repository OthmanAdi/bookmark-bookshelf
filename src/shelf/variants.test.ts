import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  CLOTHS,
  DEFAULT_VARIANT,
  listVariants,
  PATTERNS,
  resolveCloth,
  resolvePattern,
  resolveVariant,
  VARIANTS,
} from './variants';
import { DEFAULT_LIGHT } from './light';
import type { Variant } from './types';

describe('VARIANTS', () => {
  it.each(Object.entries(VARIANTS))('%s has positive sizes and a matching name', (key, variant) => {
    const { geometry } = variant;
    expect(variant.name).toBe(key);
    expect(variant.label.length).toBeGreaterThan(0);
    expect(variant.summary.length).toBeGreaterThan(0);
    for (const size of [geometry.spineWidth, geometry.bookHeight, geometry.coverWidth, geometry.gap, geometry.focusGap, geometry.perspective]) {
      expect(size).toBeGreaterThan(0);
    }
    expect(geometry.focusPush).toBeGreaterThanOrEqual(0);
    expect(geometry.focusLift).toBeGreaterThanOrEqual(0);
    expect(geometry.focusAngle).toBeGreaterThan(0);
    expect(typeof variant.loop).toBe('boolean');
  });

  it('includes the default and lists every variant', () => {
    expect(VARIANTS[DEFAULT_VARIANT]).toBeDefined();
    expect(listVariants().map((variant) => variant.name).sort()).toEqual(Object.keys(VARIANTS).sort());
  });

  it('gives every look its own light, and only Night a lamp', () => {
    for (const variant of Object.values(VARIANTS)) {
      const { light } = variant;
      expect(light, variant.name).toBeDefined();
      expect(light!.ambient).toBeGreaterThan(0);
      expect(light!.ambient).toBeLessThan(1);
      // The light is in front of the row, or nothing a person sees would be lit.
      expect(light!.z).toBeGreaterThan(0);
      expect(light!.tint).toMatch(/^#[0-9a-f]{3,6}$/);
    }
    expect(VARIANTS.night?.light?.lamp).toBeDefined();
    for (const name of ['paper', 'oak', 'pocket']) expect(VARIANTS[name]?.light?.lamp, name).toBeUndefined();
    // Paper is lit like a look that names no light, so a custom look built from it matches the default.
    expect(VARIANTS.paper?.light).toEqual(DEFAULT_LIGHT);
  });

  it('presents a volume a little short of square and never off the floor', () => {
    for (const variant of Object.values(VARIANTS)) {
      expect(variant.geometry.focusAngle, variant.name).toBeGreaterThanOrEqual(80);
      expect(variant.geometry.focusAngle, variant.name).toBeLessThan(90);
      expect(variant.geometry.focusLift, variant.name).toBe(0);
    }
    expect(VARIANTS.paper?.geometry.focusAngle).toBe(84);
    expect(VARIANTS.night?.geometry.focusAngle).toBe(86);
  });

  it('makes oak the only row with two ends', () => {
    expect(VARIANTS.oak?.loop).toBe(false);
    expect(VARIANTS.paper?.loop).toBe(true);
  });
});

describe('resolveVariant', () => {
  it('returns a known variant by name', () => {
    expect(resolveVariant('oak')).toBe(VARIANTS.oak);
  });

  it('falls back to paper for unknown names and undefined', () => {
    expect(resolveVariant('does-not-exist').name).toBe('paper');
    expect(resolveVariant(undefined).name).toBe('paper');
    expect(resolveVariant('').name).toBe('paper');
  });

  it('passes a full variant object through unchanged', () => {
    const custom: Variant = { ...VARIANTS.paper!, name: 'custom' };
    expect(resolveVariant(custom)).toBe(custom);
  });
});

describe('resolveCloth and resolvePattern', () => {
  it('keep known names', () => {
    for (const cloth of CLOTHS) expect(resolveCloth(cloth)).toBe(cloth);
    for (const pattern of PATTERNS) expect(resolvePattern(pattern)).toBe(pattern);
  });

  it('fall back to the first entry for unknown or missing names', () => {
    expect(resolveCloth('chartreuse')).toBe(CLOTHS[0]);
    expect(resolveCloth(undefined)).toBe(CLOTHS[0]);
    expect(resolveCloth('')).toBe(CLOTHS[0]);
    expect(resolvePattern('zigzag')).toBe(PATTERNS[0]);
    expect(resolvePattern(undefined)).toBe(PATTERNS[0]);
  });

  it('is case sensitive', () => {
    expect(resolveCloth('RUST')).toBe(CLOTHS[0]);
  });
});

describe('a look dresses a cover the same wherever it stands', () => {
  const sheets = ['cover.css', 'variants.css'].map((name) => readFileSync(join(import.meta.dirname, name), 'utf8'));
  const STYLE_ID = 'looks-under-test';
  const DRESS = ['background-color', 'color', 'box-shadow', 'border-radius'] as const;
  const HOOKS = ['--cloth', '--cloth-ink', '--cloth-art', '--bb-cover-shadow', '--bb-cover-mark', '--bb-cover-joint', '--bb-cover-edge'] as const;

  beforeAll(() => {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = sheets.join('\n');
    document.head.appendChild(style);
  });

  afterEach(() => {
    document.body.replaceChildren();
    delete document.documentElement.dataset.variant;
  });

  const cover = (cloth: string): HTMLElement => {
    const element = document.createElement('div');
    element.className = `bb-cover bb-cloth--${cloth}`;
    return element;
  };

  const dressOf = (element: HTMLElement): string[] => {
    const computed = getComputedStyle(element);
    return [...DRESS, ...HOOKS].map((property) => `${property}: ${computed.getPropertyValue(property).trim()}`);
  };

  it.each(Object.keys(VARIANTS))('%s: on the shelf, in the air and beside the page', (look) => {
    document.documentElement.dataset.variant = look;
    for (const cloth of CLOTHS) {
      const shelf = document.createElement('section');
      shelf.className = 'bb-shelf';
      shelf.dataset.variant = look;
      const onShelf = cover(cloth);
      shelf.appendChild(onShelf);
      // The flying copy and the reader's cover hang outside the shelf, straight under the page.
      const flying = document.createElement('div');
      flying.className = `bb-flight__book bb-cloth--${cloth}`;
      const inAir = cover(cloth);
      flying.appendChild(inAir);
      const besidePage = cover(cloth);
      document.body.append(shelf, flying, besidePage);
      expect(dressOf(inAir), `${look} ${cloth} in the air`).toEqual(dressOf(onShelf));
      expect(dressOf(besidePage), `${look} ${cloth} beside the page`).toEqual(dressOf(onShelf));
      expect(getComputedStyle(flying).getPropertyValue('--cloth')).toBe(getComputedStyle(onShelf).getPropertyValue('--cloth'));
    }
  });

  it.each(Object.keys(VARIANTS))('%s: a shelf used alone dresses its covers without the page', (look) => {
    for (const cloth of CLOTHS) {
      const alone = document.createElement('section');
      alone.className = 'bb-shelf';
      alone.dataset.variant = look;
      const onShelf = cover(cloth);
      alone.appendChild(onShelf);
      document.body.appendChild(alone);
      const expected = dressOf(onShelf);
      document.body.replaceChildren();

      document.documentElement.dataset.variant = look;
      const besidePage = cover(cloth);
      document.body.appendChild(besidePage);
      expect(dressOf(besidePage), `${look} ${cloth}`).toEqual(expected);
      delete document.documentElement.dataset.variant;
      document.body.replaceChildren();
    }
  });
});

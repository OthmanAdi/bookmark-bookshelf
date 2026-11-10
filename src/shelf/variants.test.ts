import { describe, expect, it } from 'vitest';
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

import { describe, expect, it } from 'vitest';
import { BINDINGS, STAMPS } from '../types';
import { softBoxFalloff, STUDIO_LAMPS } from './environment';
import { BINDING_RECIPES, FILM, STAMP_RECIPES, nearness, reliefAt } from './recipes';
import { patchFragmentShader } from './shader';

describe('binding recipes', () => {
  it('has one for every binding, with values a physical material accepts', () => {
    for (const binding of BINDINGS) {
      const recipe = BINDING_RECIPES[binding];
      expect(recipe.span).toBeGreaterThan(0);
      for (const value of [recipe.roughness, recipe.metalness, recipe.sheen, recipe.sheenLift, recipe.clearcoat, recipe.clearcoatRoughness, recipe.anisotropy, recipe.iridescence, recipe.shade, recipe.pastel]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(recipe.lift).toBeGreaterThan(0);
      expect(recipe.lift).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the bindings apart: fabric glows, laminate is coated, foil is metal', () => {
    expect(BINDING_RECIPES.cloth.sheen).toBeGreaterThan(BINDING_RECIPES.linen.sheen);
    expect(BINDING_RECIPES.velvet.sheen).toBe(1);
    expect(BINDING_RECIPES.velvet.roughness).toBe(1);
    expect(BINDING_RECIPES.paper.sheen).toBe(0);
    expect(BINDING_RECIPES.gloss.clearcoat).toBe(1);
    expect(BINDING_RECIPES.gloss.clearcoatRoughness).toBeLessThan(0.1);
    expect(BINDING_RECIPES.leather.clearcoat).toBeGreaterThan(0);
    expect(BINDING_RECIPES.foil.metalness).toBe(1);
    expect(BINDING_RECIPES.foil.anisotropy).toBeGreaterThan(0);
    expect(BINDING_RECIPES.holo.iridescence).toBe(1);
    expect(FILM.thickness[1]).toBeGreaterThan(FILM.thickness[0]);
  });
});

describe('grain', () => {
  it('is lit, not printed: little of a tile is multiplied into the colour', () => {
    for (const binding of ['cloth', 'linen', 'leather', 'paper'] as const) expect(BINDING_RECIPES[binding].shade).toBeLessThanOrEqual(0.4);
  });

  it('draws linen finer than book cloth and leather with a small pebble', () => {
    // Threads to a px on the reference volume: the weave tiles hold a thread to 8 texels (cloth) and 9 (linen),
    // 512 texels to a span.
    const threads = (span: number, texels: number) => 512 / texels / span;
    expect(threads(BINDING_RECIPES.linen.span, 9)).toBeGreaterThan(threads(BINDING_RECIPES.cloth.span, 8));
    // A leather pebble is 12 of 512 texels of the span: under 1.6 px on a volume 340 px tall, about 1 mm.
    expect((BINDING_RECIPES.leather.span * 12) / 512).toBeLessThan(1.6);
    expect(BINDING_RECIPES.leather.clearcoat).toBeLessThanOrEqual(0.12);
  });

  it('is quieter at shelf distance than on a cover shown large', () => {
    expect(nearness(340)).toBe(0);
    expect(nearness(300)).toBe(0);
    expect(nearness(900)).toBe(1);
    expect(nearness(520)).toBeGreaterThan(0.3);
    expect(nearness(520)).toBeLessThan(0.8);
    expect(nearness(340, 1)).toBe(1);
    expect(nearness(900, 0)).toBe(0);
    expect(nearness(340, Number.NaN)).toBe(0);
    expect(reliefAt(0)).toBeLessThan(0.6);
    expect(reliefAt(0)).toBeGreaterThan(0.3);
    expect(reliefAt(1)).toBe(1);
    expect(reliefAt(0.5)).toBeGreaterThan(reliefAt(0.2));
  });
});

describe('stamp recipes', () => {
  it('has one for every stamp', () => {
    for (const stamp of STAMPS) expect(STAMP_RECIPES[stamp]).toBeDefined();
  });

  it('makes foils metal and smooth, and leaves blind and ink without metal of their own', () => {
    for (const stamp of ['gold', 'silver', 'copper', 'holo'] as const) {
      const recipe = STAMP_RECIPES[stamp];
      expect(recipe.metalness).toEqual([1, 0]);
      // On the roughest binding the foil still stays inside 0.18 to 0.3 or a little under.
      expect(recipe.roughness[0] + recipe.roughness[1]).toBeLessThanOrEqual(0.32);
      expect(recipe.tint).toBe(1);
      expect(recipe.sheen).toBe(0);
    }
    expect(STAMP_RECIPES.holo.iridescence).toBe(1);
    expect(STAMP_RECIPES.blind.tint).toBe(0);
    expect(STAMP_RECIPES.blind.shade).toBeLessThan(1);
    expect(STAMP_RECIPES.blind.metalness).toEqual([0, 1]);
    expect(STAMP_RECIPES.blind.deboss).toBeGreaterThan(STAMP_RECIPES.gold.deboss);
    expect(STAMP_RECIPES.ink.color).toBe('ink');
    expect(STAMP_RECIPES.ink.metalness).toEqual([0, 0]);
  });
});

describe('binding shader', () => {
  const stock = 'uniform float a;\nvoid main() {\n#include <normal_fragment_maps>\n#include <lights_physical_fragment>\n}';

  it('adds its code after each anchor and keeps the stock shader', () => {
    const patched = patchFragmentShader(stock);
    expect(patched).toContain('uniform sampler2D bbStamp;');
    expect(patched.indexOf('uniform vec4 bbDetail;')).toBeLessThan(patched.indexOf('void main() {'));
    expect(patched.indexOf('bbMask = texture2D')).toBeGreaterThan(patched.indexOf('#include <normal_fragment_maps>'));
    expect(patched.indexOf('material.iridescenceThickness')).toBeGreaterThan(patched.indexOf('#include <lights_physical_fragment>'));
    // The highlight is spread where the relief is finer than a pixel.
    expect(patched).toMatch(/dFdx\( normal \)/);
    for (const line of stock.split('\n')) expect(patched).toContain(line);
  });

  it('leaves a shader alone when an anchor is missing', () => {
    const other = stock.replace('#include <normal_fragment_maps>', '');
    expect(patchFragmentShader(other)).toBe(other);
  });
});

describe('studio lamps', () => {
  it('fall off to nothing at the rim and are full in the middle', () => {
    expect(softBoxFalloff(0.5, 0.5, 0.5)).toBe(1);
    expect(softBoxFalloff(0, 0.5, 0.5)).toBe(0);
    expect(softBoxFalloff(0.5, 1, 0.5)).toBe(0);
    expect(softBoxFalloff(0.1, 0.5, 0.5)).toBeGreaterThan(0);
    expect(softBoxFalloff(0.1, 0.5, 0.5)).toBeLessThan(1);
    expect(softBoxFalloff(0.02, 0.5, 0)).toBe(1);
  });

  it('put a warm key on the left and a weaker cool fill on the right, both in front', () => {
    const [key, fill] = STUDIO_LAMPS;
    expect(key!.position[0]).toBeLessThan(0);
    expect(fill!.position[0]).toBeGreaterThan(0);
    expect(key!.position[2]).toBeGreaterThan(0);
    expect(key!.color[0]).toBeGreaterThan(key!.color[2]);
    expect(fill!.color[2]).toBeGreaterThan(fill!.color[0]);
    expect(key!.intensity).toBeGreaterThan(fill!.intensity);
  });
});

import { describe, expect, it } from 'vitest';
import { BINDINGS, STAMPS } from '../types';
import { softBoxFalloff, STUDIO_LAMPS } from './environment';
import { BINDING_RECIPES, FILM, STAMP_RECIPES } from './recipes';
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

import { describe, expect, it } from 'vitest';
import { defaultCover, materialName, mergeCover } from './cover';

describe('materialName', () => {
  it('keeps short names of lower-case letters', () => {
    expect(materialName('leather')).toBe('leather');
    expect(materialName('holo')).toBe('holo');
  });

  it('forgives case and surrounding space', () => {
    expect(materialName('  Gold ')).toBe('gold');
  });

  it('keeps a name it has never heard of, so a newer version loses nothing', () => {
    expect(materialName('marble')).toBe('marble');
  });

  it('refuses anything that is not a short run of letters', () => {
    for (const value of ['', ' ', 'gold foil', 'gold-foil', 'g0ld', '<b>', 'x'.repeat(17), 7, null, undefined, {}, ['gold']]) {
      expect(materialName(value)).toBeUndefined();
    }
    expect(materialName('x'.repeat(16))).toBe('x'.repeat(16));
  });
});

describe('mergeCover with a binding and a stamp', () => {
  const base = defaultCover('https://example.org/');

  it('writes no binding or stamp key when neither is given', () => {
    const cover = mergeCover(base, { cloth: 'teal' });
    expect(Object.keys(cover).sort()).toEqual(['cloth', 'pattern', 'seed']);
  });

  it('sets usable names', () => {
    expect(mergeCover(base, { binding: 'Leather', stamp: 'gold' })).toEqual({ ...base, binding: 'leather', stamp: 'gold' });
  });

  it('keeps what the base has when the partial leaves it out', () => {
    const bound = { ...base, binding: 'velvet', stamp: 'copper' };
    expect(mergeCover(bound, { cloth: 'moss' })).toEqual({ ...bound, cloth: 'moss' });
    expect(mergeCover(bound, undefined)).toEqual(bound);
  });

  it('removes a binding or stamp given as an empty text', () => {
    const bound = { ...base, binding: 'velvet', stamp: 'copper' };
    const cover = mergeCover(bound, { binding: '', stamp: ' ' });
    expect(cover).toEqual(base);
    expect(cover).not.toHaveProperty('binding');
    expect(cover).not.toHaveProperty('stamp');
  });

  it('keeps the base when the new name is not usable', () => {
    const bound = { ...base, binding: 'velvet' };
    expect(mergeCover(bound, { binding: '<script>' })).toEqual(bound);
    expect(mergeCover(base, { stamp: 'gold foil' })).toEqual(base);
  });

  it('returns a new object', () => {
    const bound = { ...base, binding: 'linen' };
    expect(mergeCover(bound, undefined)).not.toBe(bound);
  });
});

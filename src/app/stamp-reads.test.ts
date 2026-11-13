import { describe, expect, it } from 'vitest';
import { STAMPS } from '../studio/types';
import { clothColor, contrast, luminance, STAMP_TROUBLE, stampTrouble } from './stamp-reads';

const INK_CLOTH = '#1f1e1b';
const BONE_CLOTH = '#e4dccb';

describe('contrast', () => {
  it('runs from 1 for the same colour to 21 for black on white', () => {
    expect(contrast('#777', '#777777')).toBeCloseTo(1);
    expect(contrast('#000', '#fff')).toBeCloseTo(21);
    expect(contrast('#fff', '#000')).toBeCloseTo(21);
  });

  it('counts a colour it cannot read as mid grey', () => {
    expect(luminance('rgb(1 2 3)')).toBe(0.2);
  });
});

describe('stampTrouble', () => {
  it('lets every foil stand on a dark cloth', () => {
    for (const stamp of ['gold', 'silver', 'copper', 'holo']) expect(stampTrouble(stamp, 'cloth', INK_CLOTH)).toBeUndefined();
  });

  it('says a pale foil is hard to read on a pale cloth', () => {
    for (const stamp of ['gold', 'silver', 'copper', 'holo']) expect(stampTrouble(stamp, 'linen', BONE_CLOTH)).toBe('cloth');
  });

  it('says a foil is hard to read on a board that is metal itself, whatever the cloth', () => {
    expect(stampTrouble('gold', 'foil', INK_CLOTH)).toBe('binding');
    expect(stampTrouble('silver', 'holo', INK_CLOTH)).toBe('binding');
  });

  it('never doubts printed ink, and always doubts a blind stamp', () => {
    for (const cloth of [INK_CLOTH, BONE_CLOTH, undefined]) {
      expect(stampTrouble('ink', 'foil', cloth)).toBeUndefined();
      expect(stampTrouble('blind', 'leather', cloth)).toBe('blind');
    }
  });

  it('says nothing about cloth when the colour of the cloth is not known', () => {
    expect(stampTrouble('gold', 'cloth', undefined)).toBeUndefined();
    expect(stampTrouble('gold', undefined, '')).toBeUndefined();
  });

  it('has a short note for each trouble and an answer for every stamp', () => {
    for (const stamp of STAMPS) {
      const trouble = stampTrouble(stamp, 'cloth', BONE_CLOTH);
      if (trouble) expect(STAMP_TROUBLE[trouble]).toMatch(/hard to read/i);
    }
    expect(STAMP_TROUBLE.cloth).toBe('Hard to read on this cloth.');
  });
});

describe('clothColor', () => {
  it('reads the colour from the page and leaves nothing behind', () => {
    document.body.replaceChildren();
    const host = document.createElement('div');
    document.body.appendChild(host);
    // The test page has no stylesheet, so there is no colour to read.
    expect(clothColor(host, 'rust')).toBeUndefined();
    expect(host.childElementCount).toBe(0);
  });
});

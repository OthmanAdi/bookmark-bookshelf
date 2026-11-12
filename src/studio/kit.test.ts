import { describe, expect, it } from 'vitest';
import { bindingFor, contrast, legibleStamp, luminance } from './kit';

describe('choosing a stamp that can be read', () => {
  it('measures luminance and contrast as WCAG does', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1, 6);
    expect(luminance('#fff')).toBeCloseTo(1, 6);
    expect(contrast('#000', '#fff')).toBeCloseTo(21, 6);
    expect(contrast('#777', '#777')).toBeCloseTo(1, 6);
  });

  it('keeps gold on a dark cloth and gives it up on ochre and bone', () => {
    expect(legibleStamp('gold', '#1f1e1b')).toBe('gold');
    expect(legibleStamp('gold', '#40533a')).toBe('gold');
    expect(legibleStamp('gold', '#c9982f')).toBe('ink');
    expect(legibleStamp('gold', '#e4dccb')).toBe('ink');
  });

  it('does not put copper on rust, and finds a foil that reads instead', () => {
    expect(legibleStamp('copper', '#a4442a')).not.toBe('copper');
    expect(['gold', 'silver']).toContain(legibleStamp('copper', '#a4442a'));
  });

  it('never chooses a blind stamp for anyone', () => {
    for (const cloth of ['#1f1e1b', '#e4dccb', '#a4442a', '#40533a', '#4b2b3e', '#c9982f', '#45515d', '#1f5a5c']) {
      expect(legibleStamp('blind', cloth)).not.toBe('blind');
    }
  });

  it('leaves a stamp the person chose alone', () => {
    const item = { id: 'a', title: 'A', seed: 7, stamp: 'blind', binding: 'cloth' };
    expect(bindingFor(item, '#e4dccb')).toEqual({ binding: 'cloth', stamp: 'blind' });
  });

  it('gives the same volume the same dress on every visit', () => {
    const item = { id: 'a', title: 'A', seed: 1234 };
    expect(bindingFor(item, '#1f5a5c')).toEqual(bindingFor(item, '#1f5a5c'));
  });
});

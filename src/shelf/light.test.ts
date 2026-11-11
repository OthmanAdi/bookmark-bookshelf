import { describe, expect, it } from 'vitest';
import { DEFAULT_LIGHT, faceShades, resolveLight } from './light';
import type { Light } from './types';

describe('faceShades with the default light', () => {
  it('leaves a resting spine its own colour and shades the board facing away from the light', () => {
    const rest = faceShades(DEFAULT_LIGHT, 0);
    expect(rest.spine).toBeCloseTo(0, 3);
    expect(rest.front).toBeCloseTo(0.56, 2);
    expect(rest.back).toBeCloseTo(0.3, 2);
  });

  it('shades the spine of a turned volume as much as a lit back board', () => {
    expect(faceShades(DEFAULT_LIGHT, 90).spine).toBeCloseTo(0.3, 2);
  });

  it('brightens the cover as it turns to the viewer', () => {
    expect(faceShades(DEFAULT_LIGHT, 45).front).toBeCloseTo(0.345, 2);
    expect(faceShades(DEFAULT_LIGHT, 90).front).toBeCloseTo(0, 3);
  });

  it('changes continuously with the turn', () => {
    let previous = faceShades(DEFAULT_LIGHT, 0);
    for (let angle = 0.5; angle <= 90; angle += 0.5) {
      const next = faceShades(DEFAULT_LIGHT, angle);
      expect(Math.abs(next.spine - previous.spine)).toBeLessThan(0.01);
      expect(Math.abs(next.front - previous.front)).toBeLessThan(0.01);
      expect(Math.abs(next.back - previous.back)).toBeLessThan(0.01);
      previous = next;
    }
  });

  it('never films a face so deeply that its cloth is lost', () => {
    const dark: Light = { x: 1, z: 0, ambient: 0, tint: '#000' };
    for (const angle of [0, 30, 60, 90]) {
      const shades = faceShades(dark, angle);
      for (const value of Object.values(shades)) expect(value).toBeLessThanOrEqual(0.72);
    }
  });

  it('dims every face where the light does not reach', () => {
    const full = faceShades(DEFAULT_LIGHT, 0);
    const far = faceShades(DEFAULT_LIGHT, 0, 0.7);
    expect(far.spine).toBeCloseTo(0.3, 6);
    expect(far.back).toBeGreaterThan(full.back);
  });
});

describe('resolveLight', () => {
  it('falls back to the default light', () => {
    expect(resolveLight(undefined)).toBe(DEFAULT_LIGHT);
    const oak: Light = { x: -0.5, z: 0.87, ambient: 0.38, tint: '#140a02' };
    expect(resolveLight(oak)).toBe(oak);
  });
});

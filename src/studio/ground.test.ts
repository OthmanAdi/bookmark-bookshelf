import { describe, expect, it } from 'vitest';
import { contactAlpha } from './ground';

describe('contact shadow', () => {
  it('is darkest along the foot and gone at both edges', () => {
    expect(contactAlpha(0, 0.1)).toBe(0);
    expect(contactAlpha(0.1, 0.1)).toBeCloseTo(1, 6);
    expect(contactAlpha(1, 0.1)).toBe(0);
  });

  it('fades back under the body faster than it came up in front', () => {
    const back = [0.2, 0.4, 0.6, 0.8].map((v) => contactAlpha(v, 0.1));
    for (let i = 1; i < back.length; i++) expect(back[i]!).toBeLessThan(back[i - 1]!);
    // Half gone within the first fifth of the way back.
    expect(contactAlpha(0.3, 0.1)).toBeLessThan(0.5);
  });

  it('never leaves the range of an alpha', () => {
    for (let v = 0; v <= 1; v += 0.01) {
      const alpha = contactAlpha(v, 0.07);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThanOrEqual(1);
    }
  });
});

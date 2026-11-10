import { describe, expect, it } from 'vitest';
import {
  computeRow,
  focusWeight,
  leanSpread,
  restPitch,
  scaleGeometry,
  turnedWidth,
  visibleRange,
} from './layout';
import { VARIANTS } from './variants';
import type { Geometry } from './types';

const paper = VARIANTS.paper!.geometry;
const night = VARIANTS.night!.geometry;
const WIDTH = 1280;

function xs(position: number, geometry: Geometry, reach = 6): number[] {
  const base = Math.round(position);
  return computeRow(position, geometry, base - reach, base + reach).map((pose) => pose.x);
}

function poseAt(position: number, geometry: Geometry, slot: number) {
  const pose = computeRow(position, geometry, slot, slot)[0];
  if (!pose) throw new Error(`no pose for slot ${slot}`);
  return pose;
}

describe('focusWeight', () => {
  it('is 1 at the slot and 0 one slot away or further', () => {
    expect(focusWeight(4, 4)).toBe(1);
    expect(focusWeight(4, 5)).toBe(0);
    expect(focusWeight(4, 3)).toBe(0);
    expect(focusWeight(4, 9)).toBe(0);
  });

  it('is symmetric around the slot', () => {
    for (const offset of [0.1, 0.25, 0.5, 0.9]) {
      expect(focusWeight(4 + offset, 4)).toBeCloseTo(focusWeight(4 - offset, 4), 12);
    }
  });

  it('is exactly half way between two slots for both of them', () => {
    expect(focusWeight(2.5, 2)).toBe(focusWeight(2.5, 3));
    expect(focusWeight(2.5, 2)).toBe(0.5);
  });
});

describe('computeRow', () => {
  it.each([
    ['paper', paper],
    ['night', night],
  ])('centres the turned volume on 0 at an integer position (%s)', (_name, geometry) => {
    const centre = poseAt(3, geometry, 3);
    const lean = Math.sign(centre.lean) * leanSpread(geometry, centre.weight);
    expect(centre.weight).toBe(1);
    expect(centre.angle).toBe(geometry.focusAngle);
    expect(centre.x + turnedWidth(geometry, centre.angle) / 2 + lean / 2).toBeCloseTo(0, 9);
  });

  it('leaves volumes away from the centre unturned, unleaned and unlifted', () => {
    const resting = poseAt(3, paper, 6);
    expect(resting.weight).toBe(0);
    expect(resting.angle).toBe(0);
    expect(resting.lean).toBeCloseTo(0, 12);
    expect(resting.lift).toBe(0);
    expect(resting.z).toBe(0);
  });

  it('keeps x strictly increasing along the row at any position', () => {
    for (const position of [0, 0.2, 0.5, 0.77, 3, 3.5, -2.3, 41.9]) {
      const row = xs(position, paper);
      for (let index = 1; index < row.length; index++) {
        expect(row[index]!).toBeGreaterThan(row[index - 1]!);
      }
    }
  });

  it('spaces neighbours by restPitch away from the centre', () => {
    const row = computeRow(5, paper, 0, 10);
    const pitch = restPitch(paper);
    for (let slot = 7; slot < 10; slot++) {
      expect(row[slot + 1]!.x - row[slot]!.x).toBeCloseTo(pitch, 9);
    }
    for (let slot = 3; slot > 0; slot--) {
      expect(row[slot]!.x - row[slot - 1]!.x).toBeCloseTo(pitch, 9);
    }
  });

  it('gives both slots equal weight and angle half way between them', () => {
    const left = poseAt(2.5, paper, 2);
    const right = poseAt(2.5, paper, 3);
    expect(left.weight).toBe(right.weight);
    expect(left.angle).toBe(right.angle);
    expect(left.lean).toBe(right.lean);
    expect(left.weight).toBe(0.5);
  });

  it('moves smoothly: a tiny change in position gives a tiny change in every x', () => {
    const epsilon = 1e-6;
    const positions = [0, 0.25, 0.5, 0.999999, 1, 1.5, 1.999999, 2.000001, 7.3];
    for (const position of positions) {
      const before = computeRow(position, paper, -4, 12);
      const after = computeRow(position + epsilon, paper, -4, 12);
      for (let index = 0; index < before.length; index++) {
        expect(Math.abs(after[index]!.x - before[index]!.x)).toBeLessThan(0.01);
        expect(Math.abs(after[index]!.angle - before[index]!.angle)).toBeLessThan(0.01);
      }
    }
  });

  it('returns one pose per slot in the requested range', () => {
    const row = computeRow(0, paper, -2, 4);
    expect(row.map((pose) => pose.slot)).toEqual([-2, -1, 0, 1, 2, 3, 4]);
  });

  it('applies lift and push in proportion to weight', () => {
    const centre = poseAt(1, night, 1);
    expect(centre.lift).toBe(night.focusLift);
    expect(centre.z).toBe(night.focusPush);
    const half = poseAt(1.5, night, 1);
    expect(half.lift).toBeCloseTo(night.focusLift / 2, 9);
  });
});

describe('visibleRange', () => {
  it('returns an empty range for count 0', () => {
    const range = visibleRange(0, paper, WIDTH, 0, true);
    expect(range.to).toBeLessThan(range.from);
    expect(visibleRange(0, paper, WIDTH, 0, false).to).toBeLessThan(0);
  });

  it('does not clamp when looping', () => {
    const range = visibleRange(-3, paper, WIDTH, 5, true);
    expect(range.from).toBeLessThan(0);
    expect(range.to).toBeGreaterThan(5);
  });

  it('clamps to 0..count-1 when not looping', () => {
    expect(visibleRange(0, paper, WIDTH, 5, false)).toEqual({ from: 0, to: 4 });
    expect(visibleRange(40, paper, WIDTH, 100, false).from).toBeGreaterThan(0);
    expect(visibleRange(99, paper, WIDTH, 100, false).to).toBe(99);
  });

  it('is centred on the rounded position and covers half the width on each side', () => {
    const range = visibleRange(10.4, paper, WIDTH, 100, true);
    expect(range.from + range.to).toBe(20);
    expect((range.to - range.from) / 2).toBeGreaterThanOrEqual(WIDTH / 2 / restPitch(paper));
  });

  it('widens with the margin', () => {
    const narrow = visibleRange(0, paper, WIDTH, 100, true, 0);
    const wide = visibleRange(0, paper, WIDTH, 100, true, 5);
    expect(wide.to - wide.from).toBe(narrow.to - narrow.from + 10);
  });
});

describe('scaleGeometry', () => {
  it('scales lengths and keeps angles', () => {
    const scaled = scaleGeometry(paper, 2);
    expect(scaled.spineWidth).toBe(paper.spineWidth * 2);
    expect(scaled.bookHeight).toBe(paper.bookHeight * 2);
    expect(scaled.coverWidth).toBe(paper.coverWidth * 2);
    expect(scaled.gap).toBe(paper.gap * 2);
    expect(scaled.focusGap).toBe(paper.focusGap * 2);
    expect(scaled.focusPush).toBe(paper.focusPush * 2);
    expect(scaled.focusAngle).toBe(paper.focusAngle);
    expect(scaled.focusLean).toBe(paper.focusLean);
  });

  it('scales lift and push on a variant that has them', () => {
    const scaled = scaleGeometry(night, 0.5);
    expect(scaled.focusLift).toBe(night.focusLift / 2);
    expect(scaled.focusPush).toBe(night.focusPush / 2);
  });

  it('does not change the input', () => {
    const copy = { ...paper };
    scaleGeometry(paper, 3);
    expect(paper).toEqual(copy);
  });

  it('scales restPitch by the same factor', () => {
    expect(restPitch(scaleGeometry(paper, 1.5))).toBeCloseTo(restPitch(paper) * 1.5, 9);
  });
});

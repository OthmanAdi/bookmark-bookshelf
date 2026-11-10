import { describe, expect, it } from 'vitest';
import {
  clamp,
  easeInOutCubic,
  easeOutCubic,
  lerp,
  linear,
  SETTLE_SPRING,
  smoothstep,
  stepSpring,
  wrapIndex,
  type SpringState,
} from './spring';

/** Runs the spring in fixed frames until it reports rest, returning the trace of values. */
function settle(state: SpringState, target: number, frameMs: number, maxFrames = 600): number[] {
  const values: number[] = [];
  for (let frame = 0; frame < maxFrames; frame++) {
    const atRest = stepSpring(state, target, frameMs);
    values.push(state.value);
    if (atRest) break;
  }
  return values;
}

describe('stepSpring', () => {
  it('converges to the target without overshoot when critically damped', () => {
    const state: SpringState = { value: 0, velocity: 0 };
    const values = settle(state, 1, 1000 / 60);
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
    expect(state.value).toBe(1);
  });

  it('does not overshoot when moving down either', () => {
    const state: SpringState = { value: 5, velocity: 0 };
    const values = settle(state, 2, 1000 / 60);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(2);
    expect(state.value).toBe(2);
  });

  it('overshoots when under-damped', () => {
    const state: SpringState = { value: 0, velocity: 0 };
    const config = { ...SETTLE_SPRING, dampingRatio: 0.3 };
    let peak = 0;
    for (let frame = 0; frame < 120; frame++) {
      stepSpring(state, 1, 1000 / 60, config);
      peak = Math.max(peak, state.value);
    }
    expect(peak).toBeGreaterThan(1.1);
  });

  it('snaps exactly to the target with zero velocity at rest', () => {
    const state: SpringState = { value: 0.9999, velocity: 0 };
    expect(stepSpring(state, 1, 4)).toBe(true);
    expect(state.value).toBe(1);
    expect(state.velocity).toBe(0);
  });

  it('reports not at rest while still far from the target', () => {
    const state: SpringState = { value: 0, velocity: 0 };
    expect(stepSpring(state, 1, 16)).toBe(false);
    expect(state.value).toBeGreaterThan(0);
  });

  it('stays stable and does not overshoot with a 64 ms frame', () => {
    const state: SpringState = { value: 0, velocity: 0 };
    const values = settle(state, 1, 64);
    for (const value of values) expect(Number.isFinite(value)).toBe(true);
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
    expect(values.length).toBeLessThan(60);
    expect(state.value).toBe(1);
  });

  it('treats a 500 ms frame like the 64 ms cap and stays finite', () => {
    const late: SpringState = { value: 0, velocity: 0 };
    const capped: SpringState = { value: 0, velocity: 0 };
    stepSpring(late, 1, 500);
    stepSpring(capped, 1, 64);
    expect(Number.isFinite(late.value)).toBe(true);
    expect(late.value).toBeCloseTo(capped.value, 10);
    const values = settle(late, 1, 500);
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
    expect(late.value).toBe(1);
  });

  it('ignores zero and negative frame times', () => {
    const state: SpringState = { value: 0, velocity: 0 };
    stepSpring(state, 1, 0);
    stepSpring(state, 1, -20);
    expect(state).toEqual({ value: 0, velocity: 0 });
  });

  it('settles within about a second at the default stiffness', () => {
    const state: SpringState = { value: 0, velocity: 0 };
    const values = settle(state, 3, 1000 / 60);
    expect(values.length * (1000 / 60)).toBeLessThan(1200);
  });
});

describe('scalar helpers', () => {
  it('clamp limits to the range', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it('lerp interpolates and extrapolates', () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    expect(lerp(10, 20, 2)).toBe(30);
  });

  it('smoothstep is 0 and 1 at the ends, 0.5 in the middle, and clamps outside', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(0.5)).toBe(0.5);
    expect(smoothstep(-3)).toBe(0);
    expect(smoothstep(4)).toBe(1);
  });

  it('smoothstep is flat at both ends and increasing between', () => {
    expect(smoothstep(0.01)).toBeLessThan(0.001);
    expect(1 - smoothstep(0.99)).toBeLessThan(0.001);
    expect(smoothstep(0.3)).toBeLessThan(smoothstep(0.6));
  });

  it('wrapIndex returns a value in 0..count-1 for negative and large numbers', () => {
    expect(wrapIndex(0, 12)).toBe(0);
    expect(wrapIndex(11, 12)).toBe(11);
    expect(wrapIndex(12, 12)).toBe(0);
    expect(wrapIndex(-1, 12)).toBe(11);
    expect(wrapIndex(-12, 12)).toBe(0);
    expect(wrapIndex(-25, 12)).toBe(11);
    expect(wrapIndex(37, 12)).toBe(1);
  });

  it('wrapIndex returns 0 for an empty row', () => {
    expect(wrapIndex(5, 0)).toBe(0);
    expect(wrapIndex(-5, -1)).toBe(0);
  });

  it('easings hit 0 and 1 at the ends', () => {
    for (const ease of [easeInOutCubic, easeOutCubic, linear]) {
      expect(ease(0)).toBeCloseTo(0, 12);
      expect(ease(1)).toBeCloseTo(1, 12);
    }
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12);
  });
});

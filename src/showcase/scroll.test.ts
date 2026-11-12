import { describe, expect, it } from 'vitest';
import { applyMove, clampIndex, createWheelStepper, keyToMove, PAGE, swipeToStep, WHEEL_GAP_MS, WHEEL_HOLD_MS, WHEEL_REFLICK_MS } from './scroll';

describe('wheel accumulation', () => {
  it('moves one book for one notch of a mouse wheel', () => {
    const wheel = createWheelStepper();
    expect(wheel.push({ deltaY: 100 }, 0)).toBe(1);
    expect(wheel.push({ deltaY: -100 }, 1000)).toBe(-1);
  });

  it('reads a wheel that reports lines as the same notch', () => {
    const wheel = createWheelStepper();
    expect(wheel.push({ deltaY: 3, deltaMode: 1 }, 0)).toBe(1);
  });

  it('adds small trackpad movements up to one step', () => {
    const wheel = createWheelStepper();
    const steps = [12, 14, 15, 16].map((deltaY, index) => wheel.push({ deltaY }, index * 16));
    expect(steps).toEqual([0, 0, 0, 1]);
  });

  it('does not run away on the tail of a flick', () => {
    const wheel = createWheelStepper();
    let moved = 0;
    let delta = 120;
    // A second of inertia: every event smaller than the one before.
    for (let now = 0; now < 1100 && delta >= 1; now += 16) {
      moved += wheel.push({ deltaY: delta }, now);
      delta *= 0.93;
    }
    expect(moved).toBe(1);
  });

  it('moves again for a second notch once the hold is over, and not before', () => {
    const wheel = createWheelStepper();
    expect(wheel.push({ deltaY: 100 }, 0)).toBe(1);
    expect(wheel.push({ deltaY: 100 }, WHEEL_HOLD_MS - 80)).toBe(0);
    expect(wheel.push({ deltaY: 100 }, WHEEL_HOLD_MS + 10)).toBe(1);
  });

  it('moves again when a trackpad is flicked a second time', () => {
    const wheel = createWheelStepper();
    expect(wheel.push({ deltaY: 60 }, 0)).toBe(1);
    let now = 16;
    for (let delta = 40; delta > 3; delta *= 0.9, now += 16) expect(wheel.push({ deltaY: delta }, now)).toBe(0);
    expect(now).toBeGreaterThan(WHEEL_REFLICK_MS);
    // The fingers come down again: the movement grows instead of dying away.
    const second = [18, 30, 44].map((deltaY, index) => wheel.push({ deltaY }, now + index * 16));
    expect(second.filter((step) => step !== 0)).toEqual([1]);
  });

  it('turns back at once when the wheel turns the other way', () => {
    const wheel = createWheelStepper();
    expect(wheel.push({ deltaY: 100 }, 0)).toBe(1);
    expect(wheel.push({ deltaY: -100 }, 40)).toBe(-1);
  });

  it('forgets a movement that stopped short', () => {
    const wheel = createWheelStepper();
    expect(wheel.push({ deltaY: 30 }, 0)).toBe(0);
    expect(wheel.push({ deltaY: 30 }, WHEEL_GAP_MS + 1)).toBe(0);
    expect(wheel.push({ deltaY: 30 }, WHEEL_GAP_MS + 17)).toBe(1);
  });

  it('ignores an event that moves nothing', () => {
    const wheel = createWheelStepper();
    expect(wheel.push({ deltaY: 0 }, 0)).toBe(0);
    expect(wheel.push({ deltaY: Number.NaN }, 5)).toBe(0);
  });
});

describe('index clamping', () => {
  it('keeps an index inside the row', () => {
    expect(clampIndex(-3, 5)).toBe(0);
    expect(clampIndex(9, 5)).toBe(4);
    expect(clampIndex(2.4, 5)).toBe(2);
    expect(clampIndex(Number.NaN, 5)).toBe(0);
    expect(clampIndex(3, 0)).toBe(0);
  });

  it('stops at both ends and never wraps', () => {
    expect(applyMove(0, 5, { type: 'step', by: -1 })).toBe(0);
    expect(applyMove(4, 5, { type: 'step', by: 1 })).toBe(4);
    expect(applyMove(1, 20, { type: 'page', by: 1 })).toBe(1 + PAGE);
    expect(applyMove(2, 20, { type: 'page', by: -1 })).toBe(0);
    expect(applyMove(7, 20, { type: 'edge', to: 'first' })).toBe(0);
    expect(applyMove(7, 20, { type: 'edge', to: 'last' })).toBe(19);
    expect(applyMove(0, 0, { type: 'edge', to: 'last' })).toBe(0);
  });
});

describe('keyboard map', () => {
  it('maps every key that moves between books', () => {
    expect(keyToMove({ key: 'ArrowDown' })).toEqual({ type: 'step', by: 1 });
    expect(keyToMove({ key: 'ArrowUp' })).toEqual({ type: 'step', by: -1 });
    expect(keyToMove({ key: 'j' })).toEqual({ type: 'step', by: 1 });
    expect(keyToMove({ key: 'k' })).toEqual({ type: 'step', by: -1 });
    expect(keyToMove({ key: 'PageDown' })).toEqual({ type: 'page', by: 1 });
    expect(keyToMove({ key: 'PageUp' })).toEqual({ type: 'page', by: -1 });
    expect(keyToMove({ key: 'Home' })).toEqual({ type: 'edge', to: 'first' });
    expect(keyToMove({ key: 'End' })).toEqual({ type: 'edge', to: 'last' });
  });

  it('leaves other keys and keys with a modifier alone', () => {
    expect(keyToMove({ key: 'ArrowLeft' })).toBeNull();
    expect(keyToMove({ key: 'Enter' })).toBeNull();
    expect(keyToMove({ key: 'ArrowDown', altKey: true })).toBeNull();
    expect(keyToMove({ key: 'k', ctrlKey: true })).toBeNull();
    expect(keyToMove({ key: 'j', metaKey: true })).toBeNull();
  });
});

describe('swipe', () => {
  it('brings the next book for a swipe up and the one before for a swipe down', () => {
    expect(swipeToStep(4, -80, 220)).toBe(1);
    expect(swipeToStep(-6, 80, 220)).toBe(-1);
  });

  it('takes a short, fast flick and ignores a short, slow one', () => {
    expect(swipeToStep(0, -24, 40)).toBe(1);
    expect(swipeToStep(0, -24, 400)).toBe(0);
  });

  it('ignores a sideways movement', () => {
    expect(swipeToStep(90, -60, 200)).toBe(0);
  });
});

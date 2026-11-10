import { describe, expect, it } from 'vitest';
import { createManualClock } from './clock';
import { createShelfMotion, DEFAULT_TIMING, type MotionTiming } from './shelf-motion';

const measured: MotionTiming = {
  travel: { base: 1600, perItem: 200, max: 2100 },
  openDuration: 1100,
  closeDuration: 700,
  openHold: 170,
};

function setup(timing: Partial<MotionTiming> = measured) {
  const clock = createManualClock();
  const motion = createShelfMotion({ count: 12, loop: true, clock, timing });
  return { clock, motion };
}

describe('eased travel for programmed moves', () => {
  it('takes the base duration for one step and is half way at half time', () => {
    const { clock, motion } = setup();
    motion.step(1);
    clock.advance(800);
    expect(motion.state.position).toBeCloseTo(0.5, 1);
    expect(motion.state.settled).toBe(false);
    clock.advance(840);
    expect(motion.state.position).toBe(1);
    expect(motion.state.settled).toBe(true);
  });

  it('starts and ends slowly, with no overshoot', () => {
    const { clock, motion } = setup();
    motion.step(1);
    let highest = 0;
    const samples: number[] = [];
    for (let elapsed = 0; elapsed < 1700; elapsed += 100) {
      clock.advance(100);
      samples.push(motion.state.position);
      highest = Math.max(highest, motion.state.position);
    }
    expect(highest).toBeLessThanOrEqual(1);
    const firstStep = samples[0]!;
    const middleStep = samples[8]! - samples[7]!;
    expect(firstStep).toBeLessThan(middleStep);
  });

  it('grows with distance and stops at the maximum', () => {
    const three = setup();
    three.motion.goTo(3);
    three.clock.advance(1900);
    expect(three.motion.state.settled).toBe(false);
    three.clock.advance(150);
    expect(three.motion.state.settled).toBe(true);

    const six = setup();
    six.motion.goTo(6);
    six.clock.advance(2000);
    expect(six.motion.state.settled).toBe(false);
    six.clock.advance(150);
    expect(six.motion.state.position).toBe(6);
    expect(six.motion.state.settled).toBe(true);
  });

  it('uses the spring when travel is null', () => {
    const { clock, motion } = setup(DEFAULT_TIMING);
    motion.step(1);
    clock.advance(900);
    expect(motion.state.position).toBe(1);
    expect(motion.state.settled).toBe(true);
  });

  it('can be switched at run time', () => {
    const { clock, motion } = setup(DEFAULT_TIMING);
    motion.setTiming(measured);
    motion.step(1);
    clock.advance(900);
    expect(motion.state.settled).toBe(false);
    motion.setTiming({ travel: null });
    clock.advance(900);
    motion.step(1);
    clock.advance(900);
    expect(motion.state.position).toBe(2);
    expect(motion.state.settled).toBe(true);
  });

  it('is skipped entirely with reduced motion', () => {
    const clock = createManualClock();
    const motion = createShelfMotion({ count: 12, clock, timing: measured, reducedMotion: true });
    motion.step(1);
    expect(motion.state.position).toBe(1);
  });
});

describe('open with a staging hold', () => {
  it('shows a tiny positive value at once, holds, then runs for the open duration', async () => {
    const { clock, motion } = setup();
    const opened = motion.setOpen(true);
    expect(motion.state.open).toBeGreaterThan(0);
    expect(motion.state.open).toBeLessThan(0.001);
    clock.advance(150);
    expect(motion.state.open).toBeLessThan(0.001);
    clock.advance(570);
    expect(motion.state.open).toBeGreaterThan(0.3);
    expect(motion.state.open).toBeLessThan(0.7);
    clock.advance(600);
    await opened;
    expect(motion.state.open).toBe(1);
    expect(motion.state.settled).toBe(true);
  });

  it('closes without a hold', async () => {
    const { clock, motion } = setup();
    void motion.setOpen(true, { immediate: true });
    const closed = motion.setOpen(false);
    clock.advance(350);
    expect(motion.state.open).toBeLessThan(0.75);
    clock.advance(400);
    await closed;
    expect(motion.state.open).toBe(0);
  });

  it('does not hold with reduced motion', async () => {
    const clock = createManualClock();
    const motion = createShelfMotion({ count: 12, clock, timing: measured, reducedMotion: true });
    const opened = motion.setOpen(true);
    clock.advance(170);
    await opened;
    expect(motion.state.open).toBe(1);
  });
});

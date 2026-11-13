import { describe, expect, it } from 'vitest';
import {
  advanceTurn,
  aim,
  anglesOf,
  COAST_KEEP,
  COAST_TAU_S,
  createTurn,
  dragBy,
  dragPerPx,
  grab,
  IDLE_FOR_S,
  IDLE_SWING,
  release,
  spinOpening,
  TILT_MAX,
  TILT_REACH,
  tiltToward,
  turning,
  type Turn,
} from './turn';

const FRAME = 1 / 60;
const WIDTH = 420;
const RAD = 180 / Math.PI;

function run(turn: Turn, seconds: number, each?: (turn: Turn) => void): Turn {
  let state = turn;
  for (let time = 0; time < seconds - 1e-9; time += FRAME) {
    state = advanceTurn(state, FRAME);
    each?.(state);
  }
  return state;
}

describe('the tilt toward the pointer', () => {
  it('turns the face toward the pointer, up to twelve degrees one way and five the other', () => {
    const tilt = tiltToward(TILT_REACH / 2, -TILT_REACH / 2);
    expect(tilt.yaw).toBeCloseTo(-TILT_MAX.yaw / 2, 6);
    expect(tilt.pitch).toBeCloseTo(TILT_MAX.pitch / 2, 6);
    expect(tiltToward(5000, 5000)).toEqual({ yaw: -TILT_MAX.yaw, pitch: -TILT_MAX.pitch });
  });

  it('follows on a spring: no jump, a small give past the goal, then rest', () => {
    const aimed = aim(createTurn(), { yaw: 10, pitch: 0 });
    const first = advanceTurn(aimed, FRAME);
    expect(first.tilt.yaw).toBeGreaterThan(0);
    expect(first.tilt.yaw).toBeLessThan(1);
    let furthest = 0;
    const later = run(aimed, 2, (state) => {
      furthest = Math.max(furthest, state.tilt.yaw);
    });
    expect(furthest).toBeGreaterThan(10);
    expect(furthest).toBeLessThan(10.6);
    expect(later.tilt.yaw).toBeCloseTo(10, 2);
    expect(turning(later)).toBe(false);
  });

  it('stays steady through one long frame', () => {
    const state = advanceTurn(aim(createTurn(), { yaw: 12, pitch: 5 }), 0.05);
    expect(Math.abs(state.tilt.yaw)).toBeLessThan(12);
    expect(Number.isFinite(state.tiltSpeed.yaw)).toBe(true);
  });
});

describe('turning the book by hand', () => {
  it('keeps the point under the finger: one radian for half the width of the book', () => {
    expect(dragPerPx(WIDTH) / RAD).toBeCloseTo(0.00476, 5);
    const held = dragBy(grab(createTurn()), -WIDTH / 2, 0, WIDTH);
    expect(held.drag.yaw).toBeCloseTo(RAD, 6);
    expect(Math.abs(dragBy(held, 0, 10000, WIDTH).drag.pitch)).toBe(55);
  });

  it('does not turn a book nobody holds', () => {
    expect(dragBy(createTurn(), 50, 50, WIDTH).drag).toEqual({ yaw: 0, pitch: 0 });
  });

  it('coasts on when let go, dying away over a third of a second, then is caught back to its pose', () => {
    const free = release(dragBy(grab(createTurn()), -60, 0, WIDTH), -900, 0, WIDTH);
    expect(free.phase).toBe('coast');
    expect(COAST_KEEP).toBeCloseTo(Math.exp(-1 / 60 / COAST_TAU_S), 12);
    const one = advanceTurn(free, FRAME);
    expect(one.speed.yaw / free.speed.yaw).toBeCloseTo(COAST_KEEP, 6);
    const third = run(free, COAST_TAU_S);
    expect(third.speed.yaw / free.speed.yaw).toBeCloseTo(Math.exp(-1), 1);
    let furthest = 0;
    let coasted = 0;
    let time = 0;
    const end = run(free, 6, (state) => {
      time += FRAME;
      furthest = Math.max(furthest, state.drag.yaw);
      if (state.phase === 'coast') coasted = time;
    });
    expect(coasted).toBeGreaterThan(0.4);
    expect(coasted).toBeLessThan(1.5);
    expect(furthest).toBeGreaterThan(free.drag.yaw + 20);
    expect(end.phase).toBe('rest');
    expect(end.drag).toEqual({ yaw: 0, pitch: 0 });
  });

  it('is left to come back on its own when the hand stopped before letting go', () => {
    const state = release(dragBy(grab(createTurn()), -80, 0, WIDTH), 0, 0, WIDTH);
    expect(state.phase).toBe('return');
    expect(run(state, 3).phase).toBe('rest');
  });

  it('comes to rest face on after a whole turn, without unwinding it', () => {
    let state = grab(createTurn());
    state = dragBy(state, -350 / dragPerPx(WIDTH), 0, WIDTH);
    state = release(state, 0, 0, WIDTH);
    let lowest = 360;
    const end = run(state, 5, (turn) => {
      if (turn.phase === 'return') lowest = Math.min(lowest, turn.drag.yaw);
    });
    expect(lowest).toBeGreaterThan(340);
    expect(end.phase).toBe('rest');
  });

  it('opens the book by the speed of its spin, fully at eight radians a second', () => {
    expect(spinOpening(0)).toBe(0);
    expect(spinOpening(4 * RAD)).toBeCloseTo(0.5, 6);
    expect(spinOpening(-8 * RAD)).toBe(1);
    expect(spinOpening(40 * RAD)).toBe(1);
  });
});

describe('the idle turn on a touch screen', () => {
  it('sways a little, only when asked, and stops after twenty seconds', () => {
    let state = createTurn();
    let widest = 0;
    for (let time = 0; time < 12; time += FRAME) {
      state = advanceTurn(state, FRAME, { idle: true });
      widest = Math.max(widest, Math.abs(anglesOf(state, { idle: true }).yaw));
    }
    expect(widest).toBeGreaterThan(IDLE_SWING * 0.9);
    expect(widest).toBeLessThanOrEqual(IDLE_SWING);
    expect(anglesOf(state).yaw).toBe(0);
    expect(turning(state, { idle: true })).toBe(true);
    for (let time = 12; time < IDLE_FOR_S + 1; time += FRAME) state = advanceTurn(state, FRAME, { idle: true });
    expect(anglesOf(state, { idle: true }).yaw).toBeCloseTo(0, 6);
    expect(turning(state, { idle: true })).toBe(false);
    expect(turning(createTurn())).toBe(false);
  });
});

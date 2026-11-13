import { describe, expect, it } from 'vitest';
import { advanceTurn, aim, anglesOf, COAST_KEEP, createTurn, DRAG_PER_PX, dragBy, grab, IDLE_SWING, release, TILT_MAX, TILT_PER_PX, tiltToward, turning, type Turn } from './turn';

const FRAME = 1 / 60;

function run(turn: Turn, seconds: number, each?: (turn: Turn) => void): Turn {
  let state = turn;
  for (let time = 0; time < seconds - 1e-9; time += FRAME) {
    state = advanceTurn(state, FRAME);
    each?.(state);
  }
  return state;
}

describe('the tilt toward the pointer', () => {
  it('turns by the measured share of the distance, within a few degrees', () => {
    expect(TILT_PER_PX).toBeCloseTo(0.0086, 4);
    const tilt = tiltToward(200, -100);
    expect(tilt.yaw).toBeCloseTo(-200 * TILT_PER_PX, 6);
    expect(tilt.pitch).toBeCloseTo(100 * TILT_PER_PX, 6);
    expect(tiltToward(5000, 5000)).toEqual({ yaw: -TILT_MAX, pitch: -TILT_MAX });
  });

  it('follows the pointer smoothly instead of jumping to it', () => {
    const aimed = aim(createTurn(), { yaw: 6, pitch: 0 });
    const first = advanceTurn(aimed, FRAME);
    expect(first.tilt.yaw).toBeGreaterThan(0);
    expect(first.tilt.yaw).toBeLessThan(1.5);
    const later = run(aimed, 1.5);
    expect(later.tilt.yaw).toBeCloseTo(6, 1);
    expect(turning(later)).toBe(false);
  });
});

describe('turning the book by hand', () => {
  it('turns by the measured angle for every px, and tips no further than its limit', () => {
    expect(DRAG_PER_PX).toBeCloseTo(0.1719, 4);
    const held = dragBy(grab(createTurn()), -100, 0);
    expect(held.drag.yaw).toBeCloseTo(100 * DRAG_PER_PX, 6);
    expect(Math.abs(dragBy(held, 0, 10000).drag.pitch)).toBe(55);
  });

  it('does not turn a book nobody holds', () => {
    expect(dragBy(createTurn(), 50, 50).drag).toEqual({ yaw: 0, pitch: 0 });
  });

  it('coasts on when let go, losing five percent of its speed a frame, then comes back to rest', () => {
    const free = release(dragBy(grab(createTurn()), -60, 0), -900, 0);
    expect(free.phase).toBe('coast');
    const one = advanceTurn(free, FRAME);
    expect(one.speed.yaw / free.speed.yaw).toBeCloseTo(COAST_KEEP, 6);
    expect(one.drag.yaw).toBeGreaterThan(free.drag.yaw);
    let furthest = 0;
    let coasted = 0;
    let time = 0;
    const end = run(free, 6, (state) => {
      time += FRAME;
      furthest = Math.max(furthest, state.drag.yaw);
      if (state.phase === 'coast') coasted = time;
    });
    // About a second of coasting, as measured, before the book turns back.
    expect(coasted).toBeGreaterThan(0.5);
    expect(coasted).toBeLessThan(1.5);
    expect(furthest).toBeGreaterThan(free.drag.yaw + 20);
    expect(end.phase).toBe('rest');
    expect(end.drag).toEqual({ yaw: 0, pitch: 0 });
  });

  it('comes to rest face on after a whole turn, without unwinding it', () => {
    let state = grab(createTurn());
    state = dragBy(state, -350 / DRAG_PER_PX, 0);
    state = release(state, 0, 0);
    expect(state.phase).toBe('return');
    let lowest = 360;
    const end = run(state, 5, (turn) => {
      if (turn.phase === 'return') lowest = Math.min(lowest, turn.drag.yaw);
    });
    expect(lowest).toBeGreaterThan(340);
    expect(end.phase).toBe('rest');
  });
});

describe('the idle turn on a touch screen', () => {
  it('sways slowly within its swing and only when asked', () => {
    let state = createTurn();
    let widest = 0;
    for (let time = 0; time < 12; time += FRAME) {
      state = advanceTurn(state, FRAME, { idle: true });
      widest = Math.max(widest, Math.abs(anglesOf(state, { idle: true }).yaw));
    }
    expect(widest).toBeGreaterThan(IDLE_SWING * 0.9);
    expect(widest).toBeLessThanOrEqual(IDLE_SWING);
    expect(anglesOf(state).yaw).toBe(0);
    expect(turning(createTurn())).toBe(false);
  });
});

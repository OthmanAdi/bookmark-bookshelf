import { describe, expect, it } from 'vitest';
import { advance, createTravel, FADE_MS, jump, OMEGA, retarget, shownOf, standAt, TRAVEL_MS, type Travel } from './travel';

const FRAME = 1 / 60;

function run(travel: Travel, seconds: number, each?: (travel: Travel) => void): Travel {
  let state = travel;
  for (let time = 0; time < seconds - 1e-9; time += FRAME) {
    state = advance(state, FRAME);
    each?.(state);
  }
  return state;
}

describe('the move between two books', () => {
  it('rests on the book it starts with', () => {
    const travel = createTravel(3);
    expect(travel.settled).toBe(true);
    expect(shownOf(travel)).toEqual([{ index: 3, offset: 0, opacity: 1, target: true }]);
  });

  it('arrives in about the measured time, starts gently and never overshoots', () => {
    const start = retarget(createTravel(0), 1, 1);
    let furthest = 0;
    let fastestAt = 0;
    let fastest = 0;
    let time = 0;
    let arrived = 0;
    run(start, 2, (state) => {
      time += FRAME;
      furthest = Math.max(furthest, state.position);
      if (state.velocity > fastest) {
        fastest = state.velocity;
        fastestAt = time;
      }
      if (arrived === 0 && state.position > 0.99) arrived = time;
    });
    expect(furthest).toBeLessThanOrEqual(1);
    expect(arrived * 1000).toBeGreaterThan(TRAVEL_MS - 60);
    expect(arrived * 1000).toBeLessThan(TRAVEL_MS + 60);
    expect(TRAVEL_MS).toBeGreaterThanOrEqual(730);
    expect(TRAVEL_MS).toBeLessThanOrEqual(860);
    // The top speed comes after the start, not at it: the move eases in.
    expect(fastestAt).toBeGreaterThan(0.08);
    expect(run(start, 2).settled).toBe(true);
  });

  it('shows the leaving book above and the next below while moving forward', () => {
    const mid = run(retarget(createTravel(0), 1, 1), 0.2);
    const shown = shownOf(mid);
    expect(shown.map((entry) => entry.index)).toEqual([0, 1]);
    expect(shown[0]!.offset).toBeLessThan(0);
    expect(shown[1]!.offset).toBeGreaterThan(0);
    expect(shown[1]!.target).toBe(true);
  });

  it('keeps one book once it has arrived', () => {
    const done = run(retarget(createTravel(0), 1, 1), 2);
    expect(done.placed).toHaveLength(1);
    expect(shownOf(done)).toEqual([{ index: 1, offset: 0, opacity: 1, target: true }]);
  });
});

describe('retargeting', () => {
  it('goes on to a further book without losing speed', () => {
    const mid = run(retarget(createTravel(0), 1, 1), 0.25);
    const again = retarget(mid, 2, 1);
    expect(again.position).toBe(mid.position);
    expect(again.velocity).toBe(mid.velocity);
    expect(again.target).toEqual({ index: 2, slot: 2 });
    const next = advance(again, FRAME);
    // No jolt: the speed changes only as fast as the spring can pull over the distance left.
    expect(next.velocity).toBeGreaterThan(mid.velocity);
    expect(next.velocity - mid.velocity).toBeLessThan(OMEGA * OMEGA * 2 * FRAME);
    const end = run(again, 3);
    expect(end.settled).toBe(true);
    expect(end.target.index).toBe(2);
  });

  it('turns back to the book that was leaving, on the slot it still stands on', () => {
    const mid = run(retarget(createTravel(4), 5, 1), 0.2);
    const back = retarget(mid, 4, -1);
    expect(back.target).toEqual({ index: 4, slot: 0 });
    expect(back.placed).toHaveLength(2);
    let lowest = 0;
    const end = run(back, 3, (state) => {
      lowest = Math.min(lowest, state.position);
    });
    expect(end.position).toBe(0);
    // It may coast on a little before turning, but it never passes the book it returns to.
    expect(lowest).toBeGreaterThanOrEqual(0);
  });

  it('travels one slot for a jump across many books', () => {
    const far = retarget(createTravel(2), 14, 1);
    expect(far.target).toEqual({ index: 14, slot: 1 });
    const back = retarget(createTravel(14), 2, -1);
    expect(back.target).toEqual({ index: 2, slot: -1 });
  });

  it('puts a new book past the ones still in view', () => {
    const mid = run(retarget(createTravel(0), 1, 1), 0.2);
    // Back past the book that is leaving: it still stands on slot 0, so the new one goes beyond it.
    const other = retarget(mid, 9, -1);
    expect(other.target.slot).toBe(-1);
  });

  it('does nothing when asked for the book it is already heading for', () => {
    const travel = retarget(createTravel(0), 1, 1);
    expect(retarget(travel, 1, 1)).toBe(travel);
  });

  it('can put a book in view at once', () => {
    const there = jump(run(retarget(createTravel(0), 1, 1), 0.2), 7);
    expect(there.settled).toBe(true);
    expect(shownOf(there)).toEqual([{ index: 7, offset: 0, opacity: 1, target: true }]);
  });
});

describe('reduced motion', () => {
  it('fades one book into the other in place, in 150 ms', () => {
    const start = retarget(createTravel(0), 1, 1, { reduced: true });
    expect(FADE_MS).toBe(150);
    const offsets: number[] = [];
    let time = 0;
    let doneAt = 0;
    run(start, 0.5, (state) => {
      time += FRAME;
      for (const shown of shownOf(state)) offsets.push(shown.offset);
      if (doneAt === 0 && state.settled) doneAt = time;
    });
    expect(offsets.every((offset) => offset === 0)).toBe(true);
    expect(doneAt * 1000).toBeGreaterThanOrEqual(149);
    expect(doneAt * 1000).toBeLessThan(190);
    const half = advance(start, 0.075);
    expect(shownOf(half).map((entry) => entry.opacity)).toEqual([0.5, 0.5]);
  });
});

describe('how a book stands on the way', () => {
  it('stands square in the middle and leaves the way the scroll goes', () => {
    const rest = standAt(0);
    expect(Math.abs(rest.y) + rest.back + Math.abs(rest.yaw) + Math.abs(rest.pitch) + Math.abs(rest.roll)).toBe(0);
    expect(standAt(-1).y).toBeLessThan(0);
    expect(standAt(1).y).toBeGreaterThan(0);
    expect(standAt(0.5).back).toBeGreaterThan(0);
    expect(standAt(-0.5).back).toBe(standAt(0.5).back);
    expect(standAt(5)).toEqual(standAt(1));
  });
});

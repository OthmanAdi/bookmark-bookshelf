import { describe, expect, it } from 'vitest';
import { leafLine, leafTangent, LEAF_SEGMENTS } from './leaf';
import {
  ARRIVE_COVER,
  ARRIVE_MS,
  arrivalAt,
  FLIGHT_COVER,
  FLIGHT_OPEN_TO,
  flightOpening,
  isShut,
  layer,
  PEEK_COVER,
  PEEK_REST_MS,
  peekAt,
  peekRest,
  shut,
  tidy,
} from './riffle';
import { LEAVES, type Opening } from './volume';

const DEG = Math.PI / 180;
const LENGTH = 200;
/** Leaves stand a little apart at the root, the first nearest the board, as the volume places them. */
const ROOT_GAP = 0.6;

/** x of a leaf's centre line at a depth behind the spine, or null where the leaf does not reach. */
function xAtDepth(line: { x: number[]; z: number[] }, depth: number): number | null {
  for (let i = 1; i < line.x.length; i++) {
    const near = -line.z[i - 1]!;
    const far = -line.z[i]!;
    if (depth < near || depth > far) continue;
    const share = far === near ? 0 : (depth - near) / (far - near);
    return line.x[i - 1]! + (line.x[i]! - line.x[i - 1]!) * share;
  }
  return null;
}

/** Everything paper may not do, checked on the drawn shape of every leaf. */
function expectPaper(opening: Opening, when: string): void {
  expect(opening.leaves.length, when).toBe(LEAVES);
  expect(opening.cover, `${when}: the board never turns inward`).toBeGreaterThanOrEqual(0);
  const lines = opening.leaves.map((leaf) => leafLine(LENGTH, leaf));
  opening.leaves.forEach((leaf, index) => {
    const before = opening.leaves[index - 1];
    for (let i = 0; i <= LEAF_SEGMENTS; i++) {
      const s = i / LEAF_SEGMENTS;
      const direction = leafTangent(leaf, s);
      expect(direction, `${when}: leaf ${index} never runs back into the block`).toBeGreaterThanOrEqual(-1e-9);
      expect(direction, `${when}: leaf ${index} never runs out past the board`).toBeLessThanOrEqual(opening.cover + 1e-9);
      if (before) expect(direction, `${when}: leaf ${index} stays inside leaf ${index - 1}`).toBeLessThanOrEqual(leafTangent(before, s) + 1e-9);
    }
    // The drawn sheets: at every depth this leaf is nearer the block than the one in front of it.
    const line = lines[index]!;
    const front = lines[index - 1];
    for (let i = 0; i <= LEAF_SEGMENTS; i++) {
      expect(line.x[i]!, `${when}: leaf ${index} is never inside the block`).toBeGreaterThanOrEqual(-1e-9);
      if (!front) continue;
      const other = xAtDepth(front, -line.z[i]!);
      if (other !== null) expect(line.x[i]!, `${when}: leaf ${index} does not cross leaf ${index - 1}`).toBeLessThanOrEqual(other + ROOT_GAP + 1e-6);
    }
  });
}

const edgeOf = (opening: Opening, index: number): number => leafTangent(opening.leaves[index]!, 1);
const rootOf = (opening: Opening, index: number): number => opening.leaves[index]!.angle;

describe('tidy', () => {
  it('holds leaves that ask for too much inside the board and inside each other', () => {
    const wild: Opening = {
      cover: 0.2,
      leaves: Array.from({ length: LEAVES }, (_, index) => ({ angle: 0.1 + index * 0.1, curl: index % 2 ? -0.9 : 0.7, flick: index % 3 ? 0.5 : -0.5 })),
    };
    expectPaper(tidy(wild), 'a wild opening');
  });

  it('leaves a shut volume shut and fills in missing leaves', () => {
    expect(isShut(tidy({ cover: 0, leaves: [] }))).toBe(true);
    expect(tidy({ cover: 0.3, leaves: [{ angle: 0.1, curl: 0 }] }).leaves).toHaveLength(LEAVES);
  });
});

describe('the presented volume under the hand', () => {
  it('starts shut, opens without overshoot and comes to rest', () => {
    expect(isShut(peekAt(0, true))).toBe(true);
    let last = 0;
    for (let ms = 0; ms <= PEEK_REST_MS + 50; ms += 5) {
      const opening = peekAt(ms, true);
      expect(opening.cover).toBeGreaterThanOrEqual(last - 1e-9);
      expect(opening.cover).toBeLessThanOrEqual(PEEK_COVER + 1e-9);
      last = opening.cover;
      expectPaper(opening, `opening at ${ms} ms`);
    }
    expect(peekAt(PEEK_REST_MS, true)).toEqual(peekRest());
    expect(peekRest().cover / DEG).toBeGreaterThan(11);
    expect(peekRest().cover / DEG).toBeLessThan(19);
  });

  it('is nine tenths open after about a quarter of a second', () => {
    const reached = (ms: number): number => peekAt(ms, true).cover / PEEK_COVER;
    expect(reached(180)).toBeLessThan(0.9);
    expect(reached(260)).toBeGreaterThan(0.9);
    expect(reached(70)).toBeGreaterThan(0.45);
  });

  it('fans the leaves one after another, each less than the one in front', () => {
    const early = peekAt(60, true);
    const rest = peekRest();
    for (let index = 1; index < LEAVES; index++) {
      // A leaf further down the stack has done a smaller share of its own way.
      const share = rootOf(early, index) / rootOf(rest, index);
      const shareBefore = rootOf(early, index - 1) / rootOf(rest, index - 1);
      if (rootOf(rest, index) > 1e-4) expect(share).toBeLessThan(shareBefore);
      expect(rootOf(rest, index)).toBeLessThan(rootOf(rest, index - 1));
    }
  });

  it('lets the free edge trail the root while the leaf lifts', () => {
    for (const ms of [40, 80, 140]) {
      const opening = peekAt(ms, true);
      for (let index = 0; index < 4; index++) {
        expect(edgeOf(opening, index), `leaf ${index} at ${ms} ms`).toBeLessThan(rootOf(opening, index));
        // Later it has caught up to where it rests.
        expect(edgeOf(opening, index) / rootOf(opening, index)).toBeLessThan(edgeOf(peekRest(), index) / rootOf(peekRest(), index) + 1e-9);
      }
    }
  });

  it('closes from wherever it stood, without a jump, and the board gathers the leaves', () => {
    const half = peekAt(120, true);
    expect(peekAt(0, false, half)).toEqual(tidy(half));
    for (let ms = 0; ms <= PEEK_REST_MS; ms += 5) expectPaper(peekAt(ms, false, peekRest()), `closing at ${ms} ms`);
    expect(isShut(peekAt(PEEK_REST_MS, false, peekRest()))).toBe(true);
    // And opens again from a half closed one, continuing from where the pages are.
    const closing = peekAt(90, false, peekRest());
    const again = peekAt(0, true, closing);
    expect(again.cover).toBeCloseTo(closing.cover, 9);
    for (let ms = 0; ms <= 400; ms += 10) expectPaper(peekAt(ms, true, closing), `reopening at ${ms} ms`);
  });
});

describe('the flutter of a volume that has just arrived', () => {
  it('is shut before, after, and for a volume that did not travel', () => {
    expect(isShut(arrivalAt(0, 1))).toBe(true);
    expect(isShut(arrivalAt(ARRIVE_MS, 2))).toBe(true);
    expect(isShut(arrivalAt(ARRIVE_MS / 2, 0))).toBe(true);
    expect(ARRIVE_MS).toBeGreaterThanOrEqual(250);
    expect(ARRIVE_MS).toBeLessThanOrEqual(400);
  });

  it('stays subtle, is paper throughout and ends where it began', () => {
    let most = 0;
    for (let ms = 0; ms <= ARRIVE_MS; ms += 4) {
      const opening = arrivalAt(ms, 3);
      most = Math.max(most, opening.cover);
      expectPaper(opening, `arriving at ${ms} ms`);
    }
    expect(most).toBeGreaterThan(ARRIVE_COVER * 0.8);
    expect(most / DEG).toBeLessThan(5);
    expect(arrivalAt(ARRIVE_MS - 4, 3).cover / DEG).toBeLessThan(0.1);
  });

  it('runs the free edges through one after another, and more after a longer journey', () => {
    const peakOf = (index: number): number => {
      let best = 0;
      let at = 0;
      for (let ms = 0; ms <= ARRIVE_MS; ms += 2) {
        const edge = edgeOf(arrivalAt(ms, 2), index);
        if (edge > best) [best, at] = [edge, ms];
      }
      return at;
    };
    expect(peakOf(3)).toBeGreaterThan(peakOf(0));
    expect(peakOf(6)).toBeGreaterThan(peakOf(3));
    const near = Math.max(...[80, 100, 120].map((ms) => arrivalAt(ms, 1).cover));
    const far = Math.max(...[80, 100, 120].map((ms) => arrivalAt(ms, 4).cover));
    expect(far).toBeGreaterThan(near);
    expect(arrivalAt(100, 9)).toEqual(arrivalAt(100, 3));
  });

  it('can be laid over a volume that stands open under the hand', () => {
    for (let ms = 0; ms <= ARRIVE_MS; ms += 10) expectPaper(layer(peekAt(ms, true), arrivalAt(ms, 2)), `both at ${ms} ms`);
    expect(layer(peekRest(), shut())).toEqual(peekRest());
  });
});

describe('the pages of a volume in the air', () => {
  it('is shut on the shelf, shut well before it lands and shut beside the page', () => {
    expect(isShut(flightOpening(0))).toBe(true);
    expect(isShut(flightOpening(FLIGHT_OPEN_TO))).toBe(true);
    expect(isShut(flightOpening(0.9))).toBe(true);
    expect(isShut(flightOpening(1))).toBe(true);
    // The landing cover takes over from 0.8 on; the board is shut by then.
    expect(FLIGHT_OPEN_TO).toBeLessThanOrEqual(0.8);
  });

  it('opens about fifteen degrees near the middle of the way and is paper throughout', () => {
    let most = 0;
    let at = 0;
    for (let step = 0; step <= 500; step++) {
      const time = step / 500;
      const opening = flightOpening(time);
      expectPaper(opening, `flying at ${time}`);
      if (opening.cover > most) [most, at] = [opening.cover, time];
    }
    expect(most).toBeCloseTo(FLIGHT_COVER, 3);
    expect(most / DEG).toBeGreaterThan(13);
    expect(most / DEG).toBeLessThan(18);
    expect(at).toBeGreaterThan(0.33);
    expect(at).toBeLessThan(0.48);
  });

  it('lets the free edges follow the board: they are widest after it is', () => {
    const peak = (read: (opening: Opening) => number): number => {
      let best = -1;
      let at = 0;
      for (let step = 0; step <= 1000; step++) {
        const value = read(flightOpening(step / 1000));
        if (value > best) [best, at] = [value, step / 1000];
      }
      return at;
    };
    const board = peak((opening) => opening.cover);
    const edge = peak((opening) => edgeOf(opening, 1));
    expect(edge).toBeGreaterThan(board + 0.02);
    expect(edge).toBeLessThan(board + 0.15);
  });

  it('has no jump anywhere, so it can be turned round in the air', () => {
    let before = flightOpening(0);
    for (let step = 1; step <= 1000; step++) {
      const now = flightOpening(step / 1000);
      expect(Math.abs(now.cover - before.cover)).toBeLessThan(0.004);
      for (let index = 0; index < LEAVES; index++) expect(Math.abs(edgeOf(now, index) - edgeOf(before, index))).toBeLessThan(0.004);
      before = now;
    }
  });
});

import { LEAF_KNEE, type LeafShape } from './leaf';
import { LEAVES, type Opening } from './volume';

/**
 * How the pages of a volume move: pure functions from a time to an `Opening` (the board's turn and the
 * shape of each loose leaf). Nothing here keeps state or reads a clock, so every moment can be drawn
 * again, played backwards, or tested.
 *
 * A leaf is described by the direction it runs in at three places: its root, its knee and its free edge.
 * Each of the three follows the same move, the outer ones a little later, so the paper trails its root
 * and catches up (follow-through). The result is then held to what paper can do, see `tidy`.
 *
 * The numbers come from measuring a reference (see the 0.3 notes): one opening value per volume reached
 * exponentially in 100 ms (90 % in about a quarter of a second, no overshoot), boards open 12 to 14 degrees
 * under the hand and 15 to 18 in flight, the stack fanned in proportion to each leaf's place in it, and
 * the bend of a page growing toward its free edge with about 35 ms of lag per joint. The reference steps
 * its lag twice a frame; here the lag is solved in closed form, so it does not depend on the frame rate.
 */

/** Direction of a leaf at its root, its knee and its free edge, in radians from shut. */
type Knots = [root: number, knee: number, edge: number];

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function knotsOf(shape: LeafShape | undefined): Knots {
  if (!shape) return [0, 0, 0];
  return [shape.angle, shape.angle + shape.curl * LEAF_KNEE, shape.angle + shape.curl + (shape.flick ?? 0)];
}

function shapeOf(knots: Knots): LeafShape {
  const curl = (knots[1] - knots[0]) / LEAF_KNEE;
  return { angle: knots[0], curl, flick: knots[2] - knots[0] - curl };
}

/** A shut volume. */
export function shut(): Opening {
  return { cover: 0, leaves: Array.from({ length: LEAVES }, () => ({ angle: 0, curl: 0, flick: 0 })) };
}

/** Whether nothing of an opening would show. */
export function isShut(opening: Opening): boolean {
  return opening.cover < 0.0005 && opening.leaves.every((leaf) => knotsOf(leaf).every((knot) => Math.abs(knot) < 0.0005));
}

/** The board keeps this share of its turn clear of the first leaf. */
const BOARD_CLEAR = 0.96;

/**
 * Holds an opening to what paper can do. A leaf never runs further out than the leaf in front of it (or
 * than the board, for the first), at its root, its knee and its edge, and never back into the block.
 * Between those three places the direction is linear, so the order holds along the whole leaf: leaves
 * cannot pass through each other or through the board, and the last one stays closest to the block.
 */
export function tidy(opening: Opening): Opening {
  const cover = Math.max(0, opening.cover);
  let limit: Knots = [cover * BOARD_CLEAR, cover * BOARD_CLEAR, cover * BOARD_CLEAR];
  const leaves = Array.from({ length: LEAVES }, (_, index) => {
    const wanted = knotsOf(opening.leaves[index]);
    const held: Knots = [
      Math.min(limit[0], Math.max(0, wanted[0])),
      Math.min(limit[1], Math.max(0, wanted[1])),
      Math.min(limit[2], Math.max(0, wanted[2])),
    ];
    limit = held;
    return shapeOf(held);
  });
  return { cover, leaves };
}

/** Adds one opening to another, for a flutter over a volume that already stands open, and tidies the sum. */
export function layer(base: Opening, extra: Opening): Opening {
  const leaves = Array.from({ length: LEAVES }, (_, index) => {
    const a = knotsOf(base.leaves[index]);
    const b = knotsOf(extra.leaves[index]);
    return shapeOf([a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
  });
  return tidy({ cover: base.cover + extra.cover, leaves });
}

/** Share of a move done `ms` after it began, approached exponentially with time constant `tau`. */
function approach(ms: number, tau: number): number {
  return ms <= 0 ? 0 : 1 - Math.exp(-ms / tau);
}

/**
 * The same move as `approach`, seen through a first-order lag of `lag` ms: what a point of the paper does
 * when it is dragged along by a point nearer the spine. Solved exactly, so it is the same at any frame rate.
 */
function trailing(ms: number, tau: number, lag: number): number {
  if (ms <= 0) return 0;
  if (lag <= 0) return approach(ms, tau);
  if (Math.abs(tau - lag) < 1e-6) return 1 - Math.exp(-ms / tau) * (1 + ms / tau);
  return 1 - (tau * Math.exp(-ms / tau) - lag * Math.exp(-ms / lag)) / (tau - lag);
}

/** How far the board stands open under the hand, in radians: about 16 degrees. */
export const PEEK_COVER = 0.28;
/** Time constant of the opening under the hand, in ms. 90 % is reached after 2.3 of these. */
export const PEEK_TAU_MS = 100;
/** After this long a peek has arrived for the eye and is drawn as arrived. */
export const PEEK_REST_MS = 900;
/** Each leaf begins this much later than the one in front of it, in ms: the fan runs down the stack. */
const PEEK_STAGGER_MS = 11;
/** Lag of the knee and of the free edge behind the root, in ms: one and about two joints of the reference. */
const KNEE_LAG_MS = 35;
const EDGE_LAG_MS = 80;

/** Share of the stack a leaf has in front of it: 1 for the first leaf, falling toward the block. */
const placeOf = (index: number): number => Math.max(0, 1 - index / LEAVES);

/** A volume standing open under the hand, at rest. */
export function peekRest(): Opening {
  const leaves = Array.from({ length: LEAVES }, (_, index) => {
    const place = placeOf(index);
    // The first leaves follow the board, the rest stay near the block; every free edge hangs back a little.
    const root = PEEK_COVER * 0.8 * place * place;
    return shapeOf([root, root * 0.74, root * 0.5]);
  });
  return tidy({ cover: PEEK_COVER, leaves });
}

/**
 * The presented volume `ms` after the hand came (`open`) or left: the board lifts and the leaves fan after
 * it, each a little later than the one in front, their free edges trailing; leaving, it closes the same way
 * and the board gathers the leaves. `from` is how the volume stood at that moment, so a hand that comes
 * back half way through continues from where the pages are.
 */
export function peekAt(ms: number, open: boolean, from: Opening = shut()): Opening {
  const to = open ? peekRest() : shut();
  if (ms >= PEEK_REST_MS) return to;
  const t = Math.max(0, ms);
  const cover = from.cover + (to.cover - from.cover) * approach(t, PEEK_TAU_MS);
  const leaves = Array.from({ length: LEAVES }, (_, index) => {
    // Opening, the fan runs from the board down the stack; closing, the leaves nearest the block go first.
    const late = (open ? index : LEAVES - 1 - index) * PEEK_STAGGER_MS;
    const a = knotsOf(from.leaves[index]);
    const b = knotsOf(to.leaves[index]);
    return shapeOf([
      a[0] + (b[0] - a[0]) * approach(t - late, PEEK_TAU_MS),
      a[1] + (b[1] - a[1]) * trailing(t - late, PEEK_TAU_MS, KNEE_LAG_MS),
      a[2] + (b[2] - a[2]) * trailing(t - late, PEEK_TAU_MS, EDGE_LAG_MS),
    ]);
  });
  return tidy({ cover, leaves });
}

/** How long the flutter of a volume that has just arrived at the centre lasts, in ms. */
export const ARRIVE_MS = 340;
/** The most the board gives during that flutter, in radians: about four degrees. */
export const ARRIVE_COVER = 0.075;

/** A bump that rises to 1 at `peak` (a share of its length) and has died away, smoothly, by 1. */
function bump(u: number, peak: number): number {
  if (u <= 0 || u >= 1) return 0;
  const rise = (u / peak) * Math.exp(1 - u / peak);
  const tail = clamp01((u - 0.6) / 0.4);
  return rise * (1 - tail * tail * (3 - 2 * tail));
}

/**
 * A volume that has just stopped at the centre after travelling `steps` places: the board gives a few
 * degrees and the free edges of the leaves run through one after another, as pages do when a book is set
 * down. Shut before 0 and from `ARRIVE_MS` on. A longer journey flutters a little more, up to a limit.
 */
export function arrivalAt(ms: number, steps: number): Opening {
  if (ms <= 0 || ms >= ARRIVE_MS || steps < 1) return shut();
  const u = ms / ARRIVE_MS;
  const strength = Math.min(1, 0.7 + 0.15 * (Math.min(3, Math.abs(steps)) - 1));
  const cover = ARRIVE_COVER * strength * bump(u, 0.3);
  const leaves = Array.from({ length: LEAVES }, (_, index) => {
    const place = 0.35 + 0.65 * placeOf(index);
    const late = 0.03 + 0.03 * index;
    const edge = ARRIVE_COVER * strength * 0.9 * place * bump(u - late, 0.2);
    // The root hardly moves: it is the free edge that runs.
    return shapeOf([edge * 0.12, edge * 0.4, edge]);
  });
  return tidy({ cover, leaves });
}

/** Shares of the flight between which the volume stands open, and the most its board turns. */
export const FLIGHT_OPEN_FROM = 0.02;
export const FLIGHT_OPEN_TO = 0.78;
/** About 15 degrees, as the reference's boards open while its book is carried. */
export const FLIGHT_COVER = 0.27;
/** In shares of the flight: each leaf's delay behind the one in front, and the lag of the knee and the edge. */
const FLIGHT_STAGGER = 0.012;
const FLIGHT_KNEE_LAG = 0.03;
const FLIGHT_EDGE_LAG = 0.07;

/** How open the carried volume is at `time`: nothing, then a swell with its top in the middle, then nothing. */
function swell(time: number): number {
  const w = clamp01((time - FLIGHT_OPEN_FROM) / (FLIGHT_OPEN_TO - FLIGHT_OPEN_FROM));
  const s = Math.sin(Math.PI * w);
  return s * s;
}

/**
 * The pages of a volume in the air at `time`, 0 on the shelf and 1 beside the page. As it leaves the row
 * the board swings open and the leaves follow, the free edges last; before it lands it has closed again,
 * so the cover that arrives is a shut one. It depends on nothing but `time`: flown backwards, it plays
 * backwards, and a flight turned round in the air has no jump.
 */
export function flightOpening(time: number): Opening {
  const t = clamp01(time);
  if (t <= FLIGHT_OPEN_FROM || t >= FLIGHT_OPEN_TO) return shut();
  const cover = FLIGHT_COVER * swell(t);
  const leaves = Array.from({ length: LEAVES }, (_, index) => {
    const place = placeOf(index);
    const reach = FLIGHT_COVER * 0.82 * place * Math.sqrt(place);
    const late = index * FLIGHT_STAGGER;
    return shapeOf([
      reach * swell(t - late),
      reach * 0.86 * swell(t - late - FLIGHT_KNEE_LAG),
      reach * 0.7 * swell(t - late - FLIGHT_EDGE_LAG),
    ]);
  });
  return tidy({ cover, leaves });
}

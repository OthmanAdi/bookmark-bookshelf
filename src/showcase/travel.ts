/**
 * The move from one book to the next. Books stand on a track of slots, one slot apart; a camera glides
 * along the track on a critically damped spring, so it starts gently, never overshoots, and a new
 * target mid-way only bends the path: speed is never cut. A jump across many books still travels one
 * slot, because the book asked for is put on the slot next to the one in view.
 *
 * Under reduced motion nothing travels: the old book fades out while the new one fades in, in place.
 */

/**
 * Stiffness of the glide, per second. The measured reference settles to within one percent in about
 * 820 ms without overshoot; a critically damped spring does that when `omega * t` is about 6.64.
 */
export const OMEGA = 8.1;
/** Milliseconds of the glide, for anyone who needs a number: the time to come within one percent. */
export const TRAVEL_MS = Math.round((6.64 / OMEGA) * 1000);
/** The reduced-motion crossfade. */
export const FADE_MS = 150;

/** Closer than this to its slot, and slower than this, the camera is at rest. */
const REST_DISTANCE = 0.0015;
const REST_SPEED = 0.01;

export interface Placed {
  /** Which book. */
  index: number;
  /** Where on the track it stands. */
  slot: number;
}

export interface Travel {
  /** Camera place on the track. */
  position: number;
  /** Slots per second. */
  velocity: number;
  /** The slot the camera is heading for, and the book that stands there. */
  target: Placed;
  /** Every book standing on the track right now, the target among them. */
  placed: Placed[];
  /** Reduced motion: the book fading out and how far the fade has got, 0 to 1. Null when nothing fades. */
  fade: { from: number; progress: number } | null;
  settled: boolean;
  /** A finger holds the row: the camera stays where the finger put it until it lets go. */
  held?: boolean;
}

/** Slots the row gives past its first or last book under a finger, as a share of the pull. */
const END_GIVE = 0.18;

/**
 * Puts the camera `shift` slots from the book in view, under a finger, with the book before it one slot
 * above and the one after it one slot below, so the row follows the finger exactly. At an end of the row
 * there is no neighbour and the book only gives a little.
 */
export function hold(travel: Travel, shift: number, before: number | null, after: number | null): Travel {
  const base = travel.target;
  const placed: Placed[] = [base];
  if (before !== null) placed.push({ index: before, slot: base.slot - 1 });
  if (after !== null) placed.push({ index: after, slot: base.slot + 1 });
  const open = shift < 0 ? before !== null : after !== null;
  const moved = Math.min(0.98, Math.max(-0.98, open ? shift : shift * END_GIVE));
  return { position: base.slot + moved, velocity: 0, target: base, placed, fade: null, settled: false, held: true };
}

/** The finger let go at `velocity` slots a second: the camera glides on to the book `index`, keeping that speed. */
export function letGo(travel: Travel, index: number, velocity: number): Travel {
  const target = travel.placed.find((placed) => placed.index === index) ?? travel.target;
  return { ...travel, target, velocity, held: false, settled: false };
}

export function createTravel(index: number): Travel {
  const target = { index, slot: 0 };
  return { position: 0, velocity: 0, target, placed: [target], fade: null, settled: true };
}

/** A book is in view while it is less than one slot from the camera. */
const inView = (travel: Travel, placed: Placed): boolean => Math.abs(placed.slot - travel.position) < 1;

/**
 * Heads for another book. `direction` says which way it enters: 1 from below (the next book), -1 from
 * above. A book still in view keeps its slot, so turning back mid-way brings the same book back.
 */
export function retarget(travel: Travel, index: number, direction: -1 | 1, options: { reduced?: boolean } = {}): Travel {
  if (index === travel.target.index) return travel;
  if (options.reduced) {
    const target = { index, slot: travel.target.slot };
    return { ...travel, position: target.slot, velocity: 0, target, placed: [target], fade: { from: travel.target.index, progress: 0 }, settled: false };
  }
  const known = travel.placed.find((placed) => placed.index === index && inView(travel, placed));
  if (known) return { ...travel, target: known, fade: null, settled: false };
  // The first slot that way with no book in view on it.
  let slot = travel.target.slot + direction;
  while (travel.placed.some((placed) => placed.slot === slot && inView(travel, placed))) slot += direction;
  const target = { index, slot };
  const placed = travel.placed.filter((entry) => entry.slot !== slot && entry.index !== index);
  placed.push(target);
  return { ...travel, target, placed, fade: null, settled: false };
}

/** Puts a book in view at once, with nothing on the way. */
export function jump(travel: Travel, index: number): Travel {
  const target = { index, slot: travel.target.slot };
  return { position: target.slot, velocity: 0, target, placed: [target], fade: null, settled: true };
}

/** Moves time on by `dt` seconds. */
export function advance(travel: Travel, dt: number): Travel {
  if (travel.settled || travel.held) return travel;
  if (travel.fade) {
    const progress = Math.min(1, travel.fade.progress + (dt * 1000) / FADE_MS);
    if (progress >= 1) return { ...travel, fade: null, settled: true };
    return { ...travel, fade: { from: travel.fade.from, progress } };
  }
  // Exact solution of the critically damped spring over dt, stable for any frame length.
  const goal = travel.target.slot;
  const x = travel.position - goal;
  const decay = Math.exp(-OMEGA * dt);
  const c = travel.velocity + OMEGA * x;
  let position = goal + (x + c * dt) * decay;
  let velocity = (c - OMEGA * (x + c * dt)) * decay;
  let settled = false;
  if (Math.abs(position - goal) < REST_DISTANCE && Math.abs(velocity) < REST_SPEED) {
    position = goal;
    velocity = 0;
    settled = true;
  }
  const next: Travel = { ...travel, position, velocity, settled };
  next.placed = settled ? [travel.target] : travel.placed.filter((placed) => placed === travel.target || inView(next, placed));
  return next;
}

/** One book as it should be drawn in a frame. */
export interface Shown {
  index: number;
  /** Slots from the camera: 0 in place, positive below (still to come when moving forward), negative above. */
  offset: number;
  /** 0 to 1. */
  opacity: number;
  /** The book the camera is heading for. */
  target: boolean;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** What to draw right now, the target last so it is drawn over a book that is leaving. */
export function shownOf(travel: Travel): Shown[] {
  if (travel.fade) {
    const t = travel.fade.progress;
    return [
      { index: travel.fade.from, offset: 0, opacity: 1 - t, target: false },
      { index: travel.target.index, offset: 0, opacity: t, target: true },
    ];
  }
  const shown: Shown[] = [];
  for (const placed of travel.placed) {
    const offset = placed.slot - travel.position;
    const distance = Math.abs(offset);
    if (distance >= 1) continue;
    // Solid through the middle of the move, gone before the edge of the stage.
    const opacity = 1 - smooth(Math.min(1, Math.max(0, (distance - 0.45) / 0.5)));
    shown.push({ index: placed.index, offset, opacity, target: placed === travel.target });
  }
  return shown.sort((a, b) => Number(a.target) - Number(b.target));
}

/** How a book stands at an offset from the camera. Lengths are shares of the stage height, angles degrees. */
export interface Stand {
  /** Down the stage, positive below. */
  y: number;
  /** Back from the viewer, never negative. */
  back: number;
  /** Added turn about the upright axis. */
  yaw: number;
  /** Added tip: positive tips the head of the book away. */
  pitch: number;
  /** Added roll. */
  roll: number;
}

/**
 * The leaving book goes out the way the scroll goes, turning its face away and falling back a little;
 * the arriving one does the same in reverse, so the two read as one movement.
 */
export function standAt(offset: number): Stand {
  const d = Math.min(1, Math.max(-1, offset));
  const far = Math.abs(d);
  return {
    y: d * 0.92,
    back: smooth(far) * 0.22,
    yaw: d * -34,
    pitch: d * -26,
    roll: d * 5,
  };
}

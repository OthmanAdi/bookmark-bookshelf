/**
 * How a person asks for another book: the wheel, a trackpad, the keys and a swipe. Nothing here touches
 * the page; each function turns raw input into "move by this many books" so it can be tested alone.
 */

/** A request to go somewhere in the row of books. */
export type Move = { type: 'step'; by: -1 | 1 } | { type: 'page'; by: -1 | 1 } | { type: 'edge'; to: 'first' | 'last' };

/** How many books a page key moves. */
export const PAGE = 5;

export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(index)));
}

/** Where a move lands from `index` in a row of `count` books. The row has two ends; nothing wraps. */
export function applyMove(index: number, count: number, move: Move): number {
  if (move.type === 'edge') return move.to === 'first' ? 0 : clampIndex(count - 1, count);
  return clampIndex(index + move.by * (move.type === 'page' ? PAGE : 1), count);
}

export interface KeyLike {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

/** The keys that move between books. A key held with a modifier belongs to the browser or another part of the page. */
export function keyToMove(event: KeyLike): Move | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  switch (event.key) {
    case 'ArrowDown':
    case 'j':
      return { type: 'step', by: 1 };
    case 'ArrowUp':
    case 'k':
      return { type: 'step', by: -1 };
    case 'PageDown':
      return { type: 'page', by: 1 };
    case 'PageUp':
      return { type: 'page', by: -1 };
    case 'Home':
      return { type: 'edge', to: 'first' };
    case 'End':
      return { type: 'edge', to: 'last' };
    default:
      return null;
  }
}

/** A wheel event as far as stepping cares. */
export interface WheelLike {
  deltaY: number;
  /** 0 pixels, 1 lines, 2 pages, as `WheelEvent.deltaMode`. */
  deltaMode?: number;
}

/** Pixels the wheel has to add up to before one book moves: half a notch of an ordinary mouse wheel. */
export const WHEEL_THRESHOLD = 50;
/** A pause this long between two wheel events means the gesture has ended. */
export const WHEEL_GAP_MS = 160;
/** After a step, nothing steps again for this long, however the wheel is turned. */
export const WHEEL_HOLD_MS = 200;
/** A trackpad that speeds up again after this long has been flicked a second time. */
export const WHEEL_REFLICK_MS = 320;

const LINE_PX = 34;
const PAGE_PX = 400;

function pixels(event: WheelLike): number {
  const scale = event.deltaMode === 1 ? LINE_PX : event.deltaMode === 2 ? PAGE_PX : 1;
  return event.deltaY * scale;
}

export interface WheelStepper {
  /** Feeds one wheel event at time `now` (ms). Returns the step it caused, or 0. */
  push(event: WheelLike, now: number): -1 | 0 | 1;
  reset(): void;
}

/**
 * Adds wheel movement up until it is worth one book, then holds: a trackpad keeps sending smaller and
 * smaller events for a second after the fingers have left, and none of those may move a second book.
 * The hold ends when the wheel has been quiet for a moment, when it turns the other way, when a mouse
 * wheel clicks another full notch, or when a trackpad clearly speeds up again (a second flick).
 */
export function createWheelStepper(): WheelStepper {
  let sum = 0;
  let last = Number.NEGATIVE_INFINITY;
  let steppedAt = Number.NEGATIVE_INFINITY;
  let held: -1 | 0 | 1 = 0;
  let previous = 0;

  return {
    push(event, now) {
      const delta = pixels(event);
      if (delta === 0 || !Number.isFinite(delta)) return 0;
      const size = Math.abs(delta);
      const way: -1 | 1 = delta > 0 ? 1 : -1;
      const quiet = now - last >= WHEEL_GAP_MS;
      last = now;
      if (quiet) {
        sum = 0;
        held = 0;
      }
      if (held !== 0) {
        const since = now - steppedAt;
        const turned = way !== held;
        const notch = since >= WHEEL_HOLD_MS && size >= WHEEL_THRESHOLD && size >= previous;
        const again = since >= WHEEL_REFLICK_MS && size >= 8 && size >= previous * 1.4;
        previous = size;
        if (!turned && !notch && !again) return 0;
        held = 0;
        sum = 0;
      }
      previous = size;
      // A change of direction starts the count again, so a small correction never fights the last movement.
      if (sum !== 0 && Math.sign(sum) !== way) sum = 0;
      sum += delta;
      if (Math.abs(sum) < WHEEL_THRESHOLD) return 0;
      sum = 0;
      held = way;
      steppedAt = now;
      return way;
    },
    reset() {
      sum = 0;
      held = 0;
      previous = 0;
      last = Number.NEGATIVE_INFINITY;
      steppedAt = Number.NEGATIVE_INFINITY;
    },
  };
}

/** How far a finger has to travel up or down for a swipe, in px. */
export const SWIPE_DISTANCE = 44;
/** A shorter, fast movement still counts: px per ms at release. */
export const SWIPE_SPEED = 0.45;
export const SWIPE_SHORT = 16;

/**
 * What a finished touch on the book meant. A swipe up brings the next book, as scrolling a page up
 * brings what is below. `dx` and `dy` are the travel since the press, `ms` how long it lasted.
 */
export function swipeToStep(dx: number, dy: number, ms: number): -1 | 0 | 1 {
  const distance = Math.abs(dy);
  if (distance <= Math.abs(dx)) return 0;
  const speed = distance / Math.max(1, ms);
  if (distance < SWIPE_DISTANCE && !(distance >= SWIPE_SHORT && speed >= SWIPE_SPEED)) return 0;
  return dy < 0 ? 1 : -1;
}

import { browserClock, type Clock } from './clock';
import { attachDrag } from './gesture';
import { clamp, easeInOutCubic, linear, SETTLE_SPRING, stepSpring, wrapIndex, type SpringConfig } from './spring';

export type Unsubscribe = () => void;

/**
 * Everything a renderer needs to draw one frame. `position` is a float in item
 * units: 3.4 means "40% of the way from volume 3 to volume 4". With `loop` on
 * it is unbounded and the renderer wraps it.
 */
export interface ShelfMotionState {
  position: number;
  /** Items per millisecond. */
  velocity: number;
  /** Whole index the shelf is settling on. Unbounded when looping. */
  target: number;
  /** `target` wrapped into 0..count-1. */
  focus: number;
  /** 0 closed, 1 open. Already eased. */
  open: number;
  /** Linear time of the open or close, 0 closed to 1 open, not eased. Reversing keeps it continuous. */
  openTime: number;
  /** Where `open` is heading. */
  openTarget: 0 | 1;
  dragging: boolean;
  /** True when nothing is moving. The frame loop sleeps while this holds. */
  settled: boolean;
  /** True when motion is reduced: moves are instant and open is a short fade. */
  reduced: boolean;
}

/**
 * Eased travel for programmed moves (arrow keys, arrow buttons, picking a spine).
 * Duration in ms is `min(max, base + perItem * (items - 1))`, eased in and out. A travel that begins while the
 * row is moving starts at the speed the row has and slows into the new target.
 */
export interface TravelTiming {
  base: number;
  perItem: number;
  max: number;
}

/** All durations in ms. A plain object so a renderer's variant can carry it without importing this module. */
export interface MotionTiming {
  /** Null means programmed moves use the same spring as a released drag. */
  travel: TravelTiming | null;
  openDuration: number;
  closeDuration: number;
  /** Accepted so older callers compile; the opening starts at once and this value is ignored. */
  openHold: number;
}

export const DEFAULT_TIMING: MotionTiming = { travel: null, openDuration: 700, closeDuration: 520, openHold: 0 };

export interface ShelfMotionOptions {
  count: number;
  loop?: boolean;
  initial?: number;
  /** Fixed value, or a function read on every move so a media query can change it live. */
  reducedMotion?: boolean | (() => boolean);
  clock?: Clock;
  spring?: SpringConfig;
  timing?: Partial<MotionTiming>;
  /** Shorthand for `timing.openDuration` and `timing.closeDuration`. */
  openDuration?: number;
  closeDuration?: number;
}

export interface AttachOptions {
  /** Horizontal distance between two neighbouring volumes at rest, in px. */
  pxPerItem: () => number;
  /** Return false to ignore a pointerdown, for example while a book is open. */
  enabled?: () => boolean;
}

export interface ShelfMotion {
  readonly state: Readonly<ShelfMotionState>;
  /** Called on every frame that changed something, and once immediately. */
  subscribe(listener: (state: Readonly<ShelfMotionState>) => void): Unsubscribe;
  goTo(index: number, options?: { immediate?: boolean }): void;
  step(direction: -1 | 1): void;
  setCount(count: number, focus?: number): void;
  /** Switches between an endless row and a row with two ends, keeping the centred volume. */
  setLoop(loop: boolean): void;
  /** Changes travel and open timing, for example when the look changes. Missing fields keep their value. */
  setTiming(timing: Partial<MotionTiming>): void;
  /** Resolves when the open or close has finished, or was replaced by the opposite call. */
  setOpen(open: boolean, options?: { immediate?: boolean }): Promise<void>;
  /** Wires pointer drag and horizontal wheel on an element. */
  attach(element: HTMLElement, options: AttachOptions): Unsubscribe;
  destroy(): void;
}

const FLICK_SPEED = 0.35; // px per ms
const FLICK_MIN_TRAVEL = 24; // px
const FLICK_DECAY_MS = 325;
const FLICK_MAX_ITEMS = 6;
/** How far past the visible volume repeated steps may aim. A held key never queues further than this. */
const STEP_LEAD_ITEMS = 2;
const RUBBER_BAND = 0.35;
const REDUCED_FADE_MS = 150;
const WHEEL_SETTLE_MS = 140;
/**
 * A move that leaves rest counts its first frame as one frame already travelled, so that frame differs from
 * the resting state. The time between the call and that frame is unknown and the frame may even carry an
 * earlier timestamp than the call.
 */
const FIRST_FRAME_MS = 1000 / 60;

interface Travel {
  from: number;
  to: number;
  /** Items per millisecond when the travel began. */
  velocity: number;
  /** Null until the first frame of the travel. */
  start: number | null;
  span: number;
}

export function createShelfMotion(options: ShelfMotionOptions): ShelfMotion {
  const clock = options.clock ?? browserClock;
  const spring = options.spring ?? SETTLE_SPRING;
  let loop = options.loop ?? true;
  const timing: MotionTiming = { ...DEFAULT_TIMING, ...options.timing };
  if (options.openDuration !== undefined) timing.openDuration = options.openDuration;
  if (options.closeDuration !== undefined) timing.closeDuration = options.closeDuration;

  let count = Math.max(0, Math.floor(options.count));
  const start = clampIndex(options.initial ?? 0);

  const state: ShelfMotionState = {
    position: start,
    velocity: 0,
    target: start,
    focus: wrapIndex(start, count),
    open: 0,
    openTime: 0,
    openTarget: 0,
    dragging: false,
    settled: true,
    reduced: readReduced(),
  };

  const listeners = new Set<(state: Readonly<ShelfMotionState>) => void>();
  let frame: number | null = null;
  let lastTime = 0;
  let destroyed = false;
  let travel: Travel | null = null;

  // Open tween bookkeeping. `openRaw` is linear time, `state.open` is eased.
  let openRaw = 0;
  let openFrom = 0;
  let openStartTime: number | null = null;
  let openSpan = 0;
  let openResolvers: Array<() => void> = [];

  let dragOrigin = 0;
  let dragStartTarget = 0;
  let dragTravel = 0;

  function readReduced(): boolean {
    const value = options.reducedMotion;
    return typeof value === 'function' ? value() : value === true;
  }

  function clampIndex(index: number): number {
    if (count <= 0) return 0;
    const whole = Math.round(index);
    return loop ? whole : clamp(whole, 0, count - 1);
  }

  function emit(): void {
    for (const listener of listeners) listener(state);
  }

  function setTarget(index: number): void {
    state.target = clampIndex(index);
    state.focus = wrapIndex(state.target, count);
  }

  function wake(): void {
    state.settled = false;
    if (frame !== null || destroyed) return;
    lastTime = clock.now();
    frame = clock.request(tick);
  }

  function resolveOpen(): void {
    const resolvers = openResolvers;
    openResolvers = [];
    for (const resolve of resolvers) resolve();
  }

  function stepTravel(active: Travel, time: number, dt: number): boolean {
    if (active.start === null) active.start = time - FIRST_FRAME_MS;
    const t = active.span <= 0 ? 1 : clamp((time - active.start) / active.span, 0, 1);
    // The second term is a Hermite tangent: it carries the starting speed in and is zero, with zero slope, at t = 1.
    const carried = active.velocity * active.span * t * (1 - t) * (1 - t);
    const next = active.from + (active.to - active.from) * easeInOutCubic(t) + carried;
    state.velocity = dt > 0 ? (next - state.position) / dt : 0;
    state.position = next;
    if (t < 1) return false;
    state.position = state.target;
    state.velocity = 0;
    travel = null;
    return true;
  }

  function stepOpen(time: number): boolean {
    if (openRaw === state.openTarget) return true;
    if (openStartTime === null) {
      // The tween runs on the clock of the frames, not on the clock of the call that asked for it.
      const fromRest = openFrom === 0 || openFrom === 1;
      openStartTime = fromRest ? time - FIRST_FRAME_MS : time;
    }
    const t = openSpan <= 0 ? 1 : clamp((time - openStartTime) / openSpan, 0, 1);
    openRaw = openFrom + (state.openTarget - openFrom) * t;
    const ease = state.reduced ? linear : easeInOutCubic;
    state.openTime = openRaw;
    state.open = ease(openRaw);
    if (t < 1) return false;
    openRaw = state.openTarget;
    state.openTime = state.openTarget;
    state.open = state.openTarget;
    resolveOpen();
    return true;
  }

  function tick(time: number): void {
    frame = null;
    if (destroyed) return;
    const dt = time - lastTime;
    lastTime = time;

    let positionResting = false;
    if (!state.dragging) {
      if (travel) {
        positionResting = stepTravel(travel, time, dt);
      } else {
        const body = { value: state.position, velocity: state.velocity };
        positionResting = stepSpring(body, state.target, dt, spring);
        state.position = body.value;
        state.velocity = body.velocity;
      }
    }

    const openResting = stepOpen(time);
    state.settled = positionResting && openResting && !state.dragging;
    emit();
    if (!state.settled) frame = clock.request(tick);
  }

  function goTo(index: number, goOptions: { immediate?: boolean } = {}): void {
    if (count <= 0) return;
    state.reduced = readReduced();
    setTarget(index);
    if (goOptions.immediate || state.reduced) {
      travel = null;
      state.position = state.target;
      state.velocity = 0;
      emit();
      if (openRaw === state.openTarget && !state.dragging) state.settled = true;
      return;
    }
    const distance = Math.abs(state.target - state.position);
    if (timing.travel && distance > 0) {
      const { base, perItem, max } = timing.travel;
      const span = Math.min(max, base + perItem * Math.max(0, distance - 1));
      travel = { from: state.position, to: state.target, velocity: state.velocity, start: null, span };
    } else {
      travel = null;
    }
    wake();
  }

  function step(direction: -1 | 1): void {
    const limit = Math.round(state.position) + direction * STEP_LEAD_ITEMS;
    const next = state.target + direction;
    // A target already beyond the limit (an explicit goTo) stays where it is; a step never pulls it back.
    goTo(direction > 0 ? Math.min(next, Math.max(limit, state.target)) : Math.max(next, Math.min(limit, state.target)));
  }

  function setCount(next: number, focus?: number): void {
    // Read the focused item before the count changes: a looping target only means something for the old row.
    const kept = state.focus;
    count = Math.max(0, Math.floor(next));
    const index = clampIndex(focus ?? Math.min(kept, Math.max(count - 1, 0)));
    travel = null;
    state.position = index;
    state.velocity = 0;
    setTarget(index);
    emit();
  }

  function setOpen(open: boolean, openOptions: { immediate?: boolean } = {}): Promise<void> {
    const target: 0 | 1 = open ? 1 : 0;
    state.reduced = readReduced();
    // A reversal ends the previous call's promise: that open or close is over.
    resolveOpen();
    state.openTarget = target;

    if (openOptions.immediate) {
      openRaw = target;
      state.openTime = target;
      state.open = target;
      emit();
      return Promise.resolve();
    }
    if (openRaw === target) return Promise.resolve();

    const full = state.reduced ? REDUCED_FADE_MS : open ? timing.openDuration : timing.closeDuration;
    openFrom = openRaw;
    openSpan = full * Math.abs(target - openRaw);
    openStartTime = null;
    const done = new Promise<void>((resolve) => openResolvers.push(resolve));
    wake();
    return done;
  }

  function limitDragPosition(position: number): number {
    if (loop || count <= 0) return position;
    const max = count - 1;
    if (position < 0) return position * RUBBER_BAND;
    if (position > max) return max + (position - max) * RUBBER_BAND;
    return position;
  }

  function attach(element: HTMLElement, attachOptions: AttachOptions): Unsubscribe {
    const isEnabled = (): boolean => (attachOptions.enabled ? attachOptions.enabled() : true) && count > 0;
    const pitch = (): number => Math.max(1, attachOptions.pxPerItem());

    const detachDrag = attachDrag(
      element,
      {
        onStart() {
          travel = null;
          state.dragging = true;
          state.velocity = 0;
          dragOrigin = state.position;
          dragStartTarget = state.target;
          dragTravel = 0;
          wake();
        },
        onMove(dx) {
          dragTravel = dx;
          state.position = limitDragPosition(dragOrigin - dx / pitch());
          setTarget(state.position);
          wake();
        },
        onEnd(velocityX, cancelled) {
          // A released drag always settles on the spring, whatever the travel timing: it has to feel held.
          travel = null;
          state.dragging = false;
          const itemsPerMs = -velocityX / pitch();
          const isFlick = !cancelled && Math.abs(velocityX) >= FLICK_SPEED && Math.abs(dragTravel) >= FLICK_MIN_TRAVEL;
          let destination = Math.round(state.position);
          if (isFlick) {
            const projected = state.position + itemsPerMs * FLICK_DECAY_MS;
            const direction = itemsPerMs > 0 ? 1 : -1;
            destination = Math.round(projected);
            // A flick always moves at least one volume in its direction.
            if (destination === dragStartTarget) destination = dragStartTarget + direction;
            destination = clamp(destination, dragStartTarget - FLICK_MAX_ITEMS, dragStartTarget + FLICK_MAX_ITEMS);
          }
          setTarget(destination);
          state.velocity = cancelled || state.reduced ? 0 : itemsPerMs;
          if (state.reduced) state.position = state.target;
          wake();
        },
      },
      { shouldStart: () => isEnabled() && state.open === 0 },
    );

    let wheelTimer: ReturnType<typeof setTimeout> | null = null;
    const onWheel = (event: WheelEvent): void => {
      if (!isEnabled() || state.open !== 0) return;
      const sideways = event.shiftKey ? event.deltaY : event.deltaX;
      // Plain vertical wheel belongs to the page.
      if (!event.shiftKey && Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      travel = null;
      state.dragging = true;
      state.position = limitDragPosition(state.position + sideways / pitch());
      state.velocity = 0;
      setTarget(state.position);
      wake();
      if (wheelTimer !== null) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        wheelTimer = null;
        state.dragging = false;
        setTarget(Math.round(state.position));
        wake();
      }, WHEEL_SETTLE_MS);
    };
    element.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      detachDrag();
      element.removeEventListener('wheel', onWheel);
      if (wheelTimer !== null) clearTimeout(wheelTimer);
    };
  }

  return {
    state,
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    goTo,
    step,
    setCount,
    setLoop(value) {
      loop = value;
      setCount(count, state.focus);
    },
    setTiming(next) {
      Object.assign(timing, next);
    },
    setOpen,
    attach,
    destroy() {
      destroyed = true;
      if (frame !== null) clock.cancel(frame);
      frame = null;
      listeners.clear();
      resolveOpen();
    },
  };
}

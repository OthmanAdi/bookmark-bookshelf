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
  /** Where `open` is heading. */
  openTarget: 0 | 1;
  dragging: boolean;
  /** True when nothing is moving. The frame loop sleeps while this holds. */
  settled: boolean;
  /** True when motion is reduced: moves are instant and open is a short fade. */
  reduced: boolean;
}

export interface ShelfMotionOptions {
  count: number;
  loop?: boolean;
  initial?: number;
  /** Fixed value, or a function read on every move so a media query can change it live. */
  reducedMotion?: boolean | (() => boolean);
  clock?: Clock;
  spring?: SpringConfig;
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
const RUBBER_BAND = 0.35;
const REDUCED_FADE_MS = 150;
const WHEEL_SETTLE_MS = 140;

export function createShelfMotion(options: ShelfMotionOptions): ShelfMotion {
  const clock = options.clock ?? browserClock;
  const spring = options.spring ?? SETTLE_SPRING;
  let loop = options.loop ?? true;
  const openDuration = options.openDuration ?? 900;
  const closeDuration = options.closeDuration ?? 640;

  let count = Math.max(0, Math.floor(options.count));
  const start = clampIndex(options.initial ?? 0);

  const state: ShelfMotionState = {
    position: start,
    velocity: 0,
    target: start,
    focus: wrapIndex(start, count),
    open: 0,
    openTarget: 0,
    dragging: false,
    settled: true,
    reduced: readReduced(),
  };

  const listeners = new Set<(state: Readonly<ShelfMotionState>) => void>();
  let frame: number | null = null;
  let lastTime = 0;
  let destroyed = false;

  // Open tween bookkeeping. `openRaw` is linear time, `state.open` is eased.
  let openRaw = 0;
  let openFrom = 0;
  let openStartTime = 0;
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

  function tick(time: number): void {
    frame = null;
    if (destroyed) return;
    const dt = time - lastTime;
    lastTime = time;

    let positionResting = true;
    if (!state.dragging) {
      const body = { value: state.position, velocity: state.velocity };
      positionResting = stepSpring(body, state.target, dt, spring);
      state.position = body.value;
      state.velocity = body.velocity;
    } else {
      positionResting = false;
    }

    let openResting = true;
    if (openRaw !== state.openTarget) {
      const elapsed = time - openStartTime;
      const t = openSpan <= 0 ? 1 : clamp(elapsed / openSpan, 0, 1);
      openRaw = openFrom + (state.openTarget - openFrom) * t;
      const ease = state.reduced ? linear : easeInOutCubic;
      state.open = ease(openRaw);
      openResting = t >= 1;
      if (openResting) {
        openRaw = state.openTarget;
        state.open = state.openTarget;
        resolveOpen();
      }
    }

    state.settled = positionResting && openResting && !state.dragging;
    emit();
    if (!state.settled) frame = clock.request(tick);
  }

  function goTo(index: number, goOptions: { immediate?: boolean } = {}): void {
    if (count <= 0) return;
    state.reduced = readReduced();
    setTarget(index);
    if (goOptions.immediate || state.reduced) {
      state.position = state.target;
      state.velocity = 0;
      emit();
      if (openRaw === state.openTarget && !state.dragging) state.settled = true;
      return;
    }
    wake();
  }

  function step(direction: -1 | 1): void {
    goTo(state.target + direction);
  }

  function setCount(next: number, focus?: number): void {
    // Read the focused item before the count changes: a looping target only means something for the old row.
    const kept = state.focus;
    count = Math.max(0, Math.floor(next));
    const index = clampIndex(focus ?? Math.min(kept, Math.max(count - 1, 0)));
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
      state.open = target;
      emit();
      return Promise.resolve();
    }
    if (openRaw === target) return Promise.resolve();

    const full = state.reduced ? REDUCED_FADE_MS : open ? openDuration : closeDuration;
    openFrom = openRaw;
    openSpan = full * Math.abs(target - openRaw);
    openStartTime = clock.now();
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

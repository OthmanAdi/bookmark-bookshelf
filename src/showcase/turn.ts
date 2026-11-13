/**
 * How the book in view turns under the hand. Three things add up: a small tilt toward the pointer, the
 * turn a drag has given it (which coasts on when let go and then comes back to rest), and on a touch
 * screen, where no pointer hovers, a slow turn to and fro so the light still moves on the cover.
 * Angles are degrees: yaw about the upright axis, positive showing more of the spine; pitch positive
 * tips the head of the book away.
 */

const DEG = 180 / Math.PI;

/**
 * The tilt never goes past this, however far away the pointer is. The light stands still in the room, so
 * it is this turn that carries the highlight across the cover: it has to be wide enough to be seen.
 */
export const TILT_MAX = { yaw: 12, pitch: 5 } as const;
/** The pointer this many px from the middle of the book gives the whole tilt. */
export const TILT_REACH = 520;
/** The tilt follows the pointer on a spring: stiffness and damping per unit of mass, a little under critical. */
export const TILT_STIFFNESS = 90;
export const TILT_DAMPING = 14;
/**
 * A drag keeps the point under the finger: across half the width of the book the cover turns one radian,
 * which is how far a point on its face travels when it turns. Degrees for every px.
 */
export function dragPerPx(bookWidth: number): number {
  return DEG / Math.max(1, bookWidth * 0.5);
}
/** Let go, the turn dies away as exp(-t / 0.325 s): about a second of coasting. */
export const COAST_TAU_S = 0.325;
/** The same decay from one 60 Hz frame to the next. */
export const COAST_KEEP = Math.exp(-1 / 60 / COAST_TAU_S);
/** Slower than this (degrees a second, 0.6 rad) the coast is over and the book is caught back to its pose. */
export const COAST_END = 0.6 * DEG;
/** The catch is a spring a little under critical, so the book settles with one small give. */
export const CATCH_STIFFNESS = 90;
export const CATCH_DAMPING = 2 * 0.8 * Math.sqrt(CATCH_STIFFNESS);
/** A spin this fast (radians a second) throws the book fully open. */
export const SPIN_OPEN = 8;
/** A drag can tip the book this far and no further; it can turn it all the way round. */
export const PITCH_LIMIT = 55;
/** The idle turn on a touch screen: this far each way, once in this many seconds, for this long and no longer. */
export const IDLE_SWING = 3;
export const IDLE_PERIOD_S = 7;
export const IDLE_FOR_S = 20;

export interface Angles {
  yaw: number;
  pitch: number;
}

export interface Turn {
  /** The tilt as drawn, following `goal`. */
  tilt: Angles;
  /** Degrees a second. */
  tiltSpeed: Angles;
  goal: Angles;
  /** The turn given by dragging. */
  drag: Angles;
  /** Degrees a second, while coasting and returning. */
  speed: Angles;
  phase: 'rest' | 'held' | 'coast' | 'return';
  /** Seconds the idle turn has run. */
  idle: number;
}

export function createTurn(): Turn {
  return { tilt: { yaw: 0, pitch: 0 }, tiltSpeed: { yaw: 0, pitch: 0 }, goal: { yaw: 0, pitch: 0 }, drag: { yaw: 0, pitch: 0 }, speed: { yaw: 0, pitch: 0 }, phase: 'rest', idle: 0 };
}

const clamp = (value: number, limit: number): number => Math.min(limit, Math.max(-limit, value));

/**
 * The tilt for a pointer `dx` px right of and `dy` px below the book's centre. The book turns its face
 * toward the pointer: to the right it shows less spine, above it its head tips back.
 */
export function tiltToward(dx: number, dy: number): Angles {
  return { yaw: clamp((-dx / TILT_REACH) * TILT_MAX.yaw, TILT_MAX.yaw), pitch: clamp((-dy / TILT_REACH) * TILT_MAX.pitch, TILT_MAX.pitch) };
}

/** How far a spin of `speed` degrees a second throws the book open, 0 to 1. */
export function spinOpening(speed: number): number {
  return Math.min(1, Math.abs(speed) / DEG / SPIN_OPEN);
}

export function aim(turn: Turn, goal: Angles): Turn {
  return { ...turn, goal };
}

export function grab(turn: Turn): Turn {
  return { ...turn, phase: 'held', speed: { yaw: 0, pitch: 0 } };
}

/** The hand moved `dx`, `dy` px while holding a book `bookWidth` px wide. */
export function dragBy(turn: Turn, dx: number, dy: number, bookWidth: number): Turn {
  if (turn.phase !== 'held') return turn;
  const gain = dragPerPx(bookWidth);
  return { ...turn, drag: { yaw: turn.drag.yaw - dx * gain, pitch: clamp(turn.drag.pitch - dy * gain, PITCH_LIMIT) } };
}

/** The hand let go while moving at `vx`, `vy` px a second. */
export function release(turn: Turn, vx: number, vy: number, bookWidth: number): Turn {
  if (turn.phase !== 'held') return turn;
  const gain = dragPerPx(bookWidth);
  const speed = { yaw: -vx * gain, pitch: -vy * gain };
  const moving = Math.hypot(speed.yaw, speed.pitch) > COAST_END;
  return { ...turn, speed: moving ? speed : { yaw: 0, pitch: 0 }, phase: moving ? 'coast' : 'return' };
}

/** The whole turn nearest to `yaw`: the book rests face on, whichever way round it was spun. */
const restOf = (yaw: number): number => Math.round(yaw / 360) * 360;

/** One spring over `dt`, in small steps so a long frame cannot blow it up. */
function spring(value: number, speed: number, goal: number, dt: number, stiffness: number, damping: number): [number, number] {
  const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / steps;
  let x = value;
  let v = speed;
  for (let step = 0; step < steps; step++) {
    v += (stiffness * (goal - x) - damping * v) * h;
    x += v * h;
  }
  return [x, v];
}

export function advanceTurn(turn: Turn, dt: number, options: { idle?: boolean } = {}): Turn {
  const [tiltYaw, tiltYawSpeed] = spring(turn.tilt.yaw, turn.tiltSpeed.yaw, turn.goal.yaw, dt, TILT_STIFFNESS, TILT_DAMPING);
  const [tiltPitch, tiltPitchSpeed] = spring(turn.tilt.pitch, turn.tiltSpeed.pitch, turn.goal.pitch, dt, TILT_STIFFNESS, TILT_DAMPING);
  const tilt = { yaw: tiltYaw, pitch: tiltPitch };
  const tiltSpeed = { yaw: tiltYawSpeed, pitch: tiltPitchSpeed };
  let { drag, speed, phase } = turn;
  if (phase === 'coast') {
    const keep = Math.exp(-dt / COAST_TAU_S);
    // Distance covered while the speed falls off over dt.
    const reach = (1 - keep) * COAST_TAU_S;
    drag = { yaw: drag.yaw + speed.yaw * reach, pitch: clamp(drag.pitch + speed.pitch * reach, PITCH_LIMIT) };
    speed = { yaw: speed.yaw * keep, pitch: speed.pitch * keep };
    if (Math.hypot(speed.yaw, speed.pitch) < COAST_END) phase = 'return';
  } else if (phase === 'return') {
    const [yaw, yawSpeed] = spring(drag.yaw, speed.yaw, restOf(drag.yaw), dt, CATCH_STIFFNESS, CATCH_DAMPING);
    const [pitch, pitchSpeed] = spring(drag.pitch, speed.pitch, 0, dt, CATCH_STIFFNESS, CATCH_DAMPING);
    drag = { yaw, pitch };
    speed = { yaw: yawSpeed, pitch: pitchSpeed };
    const rest = restOf(yaw);
    if (Math.abs(yaw - rest) < 0.02 && Math.abs(pitch) < 0.02 && Math.hypot(yawSpeed, pitchSpeed) < 0.5) {
      // Whole turns are the same pose, so they are dropped and the next drag starts from nothing.
      drag = { yaw: 0, pitch: 0 };
      speed = { yaw: 0, pitch: 0 };
      phase = 'rest';
    }
  }
  const idle = options.idle && phase === 'rest' ? turn.idle + dt : turn.idle;
  return { tilt, tiltSpeed, goal: turn.goal, drag, speed, phase, idle };
}

/** The angles to draw. */
export function anglesOf(turn: Turn, options: { idle?: boolean } = {}): Angles {
  // The sway dies away over its last two seconds, so it never stops with a jerk.
  const fade = Math.min(1, Math.max(0, (IDLE_FOR_S - turn.idle) / 2));
  const sway = options.idle ? Math.sin((turn.idle / IDLE_PERIOD_S) * Math.PI * 2) * IDLE_SWING * fade : 0;
  return { yaw: turn.tilt.yaw + turn.drag.yaw + sway, pitch: turn.tilt.pitch + turn.drag.pitch };
}

/** Whether another frame is needed to bring the turn to rest. */
export function turning(turn: Turn, options: { idle?: boolean } = {}): boolean {
  if (options.idle && turn.idle < IDLE_FOR_S) return true;
  if (turn.phase !== 'rest') return true;
  const away = Math.abs(turn.goal.yaw - turn.tilt.yaw) + Math.abs(turn.goal.pitch - turn.tilt.pitch);
  return away > 0.01 || Math.hypot(turn.tiltSpeed.yaw, turn.tiltSpeed.pitch) > 0.05;
}

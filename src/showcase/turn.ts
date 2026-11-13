/**
 * How the book in view turns under the hand. Three things add up: a small tilt toward the pointer, the
 * turn a drag has given it (which coasts on when let go and then comes back to rest), and on a touch
 * screen, where no pointer hovers, a slow turn to and fro so the light still moves on the cover.
 * Angles are degrees: yaw about the upright axis, positive showing more of the spine; pitch positive
 * tips the head of the book away.
 */

const DEG = 180 / Math.PI;

/** Tilt toward the pointer: 0.00015 rad for every px between pointer and book centre, as measured on the reference. */
export const TILT_PER_PX = 0.00015 * DEG;
/** The tilt never goes past this, however far away the pointer is. */
export const TILT_MAX = 7;
/** A drag turns the book by 0.003 rad for every px, both ways. */
export const DRAG_PER_PX = 0.003 * DEG;
/** Let go, the turn keeps 95 % of its speed from one 60 Hz frame to the next: about a second of coasting. */
export const COAST_KEEP = 0.95;
/** Slower than this (degrees a second) the coast is over and the book comes back to rest. */
export const COAST_END = 14;
/** A drag can tip the book this far and no further; it can turn it all the way round. */
export const PITCH_LIMIT = 55;
/** The idle turn on a touch screen: this far each way, once in this many seconds. */
export const IDLE_SWING = 7;
export const IDLE_PERIOD_S = 11;

/** How quickly the tilt follows the pointer, and the book returns to rest, per second. */
const FOLLOW = 9;
const RETURN = 6.5;

export interface Angles {
  yaw: number;
  pitch: number;
}

export interface Turn {
  /** The tilt as drawn, following `goal`. */
  tilt: Angles;
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
  return { tilt: { yaw: 0, pitch: 0 }, goal: { yaw: 0, pitch: 0 }, drag: { yaw: 0, pitch: 0 }, speed: { yaw: 0, pitch: 0 }, phase: 'rest', idle: 0 };
}

const clamp = (value: number, limit: number): number => Math.min(limit, Math.max(-limit, value));

/**
 * The tilt for a pointer `dx` px right of and `dy` px below the book's centre. The book turns its face
 * toward the pointer: to the right it shows less spine, above it its head tips back.
 */
export function tiltToward(dx: number, dy: number): Angles {
  return { yaw: clamp(-dx * TILT_PER_PX, TILT_MAX), pitch: clamp(-dy * TILT_PER_PX, TILT_MAX) };
}

export function aim(turn: Turn, goal: Angles): Turn {
  return { ...turn, goal };
}

export function grab(turn: Turn): Turn {
  return { ...turn, phase: 'held', speed: { yaw: 0, pitch: 0 } };
}

/** The hand moved `dx`, `dy` px while holding the book. */
export function dragBy(turn: Turn, dx: number, dy: number): Turn {
  if (turn.phase !== 'held') return turn;
  return { ...turn, drag: { yaw: turn.drag.yaw - dx * DRAG_PER_PX, pitch: clamp(turn.drag.pitch - dy * DRAG_PER_PX, PITCH_LIMIT) } };
}

/** The hand let go while moving at `vx`, `vy` px a second. */
export function release(turn: Turn, vx: number, vy: number): Turn {
  if (turn.phase !== 'held') return turn;
  const speed = { yaw: -vx * DRAG_PER_PX, pitch: -vy * DRAG_PER_PX };
  const moving = Math.hypot(speed.yaw, speed.pitch) > COAST_END;
  return { ...turn, speed: moving ? speed : { yaw: 0, pitch: 0 }, phase: moving ? 'coast' : 'return' };
}

/** The whole turn nearest to `yaw`: the book rests face on, whichever way round it was spun. */
const restOf = (yaw: number): number => Math.round(yaw / 360) * 360;

function spring(value: number, speed: number, goal: number, dt: number): [number, number] {
  const x = value - goal;
  const decay = Math.exp(-RETURN * dt);
  const c = speed + RETURN * x;
  return [goal + (x + c * dt) * decay, (c - RETURN * (x + c * dt)) * decay];
}

export function advanceTurn(turn: Turn, dt: number, options: { idle?: boolean } = {}): Turn {
  const follow = 1 - Math.exp(-FOLLOW * dt);
  const tilt = {
    yaw: turn.tilt.yaw + (turn.goal.yaw - turn.tilt.yaw) * follow,
    pitch: turn.tilt.pitch + (turn.goal.pitch - turn.tilt.pitch) * follow,
  };
  let { drag, speed, phase } = turn;
  if (phase === 'coast') {
    const keep = COAST_KEEP ** (dt * 60);
    // Distance covered while the speed falls off over dt.
    const rate = -Math.log(COAST_KEEP) * 60;
    const reach = (1 - keep) / rate;
    drag = { yaw: drag.yaw + speed.yaw * reach, pitch: clamp(drag.pitch + speed.pitch * reach, PITCH_LIMIT) };
    speed = { yaw: speed.yaw * keep, pitch: speed.pitch * keep };
    if (Math.hypot(speed.yaw, speed.pitch) < COAST_END) phase = 'return';
  } else if (phase === 'return') {
    const [yaw, yawSpeed] = spring(drag.yaw, speed.yaw, restOf(drag.yaw), dt);
    const [pitch, pitchSpeed] = spring(drag.pitch, speed.pitch, 0, dt);
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
  return { tilt, goal: turn.goal, drag, speed, phase, idle };
}

/** The angles to draw. */
export function anglesOf(turn: Turn, options: { idle?: boolean } = {}): Angles {
  const sway = options.idle ? Math.sin((turn.idle / IDLE_PERIOD_S) * Math.PI * 2) * IDLE_SWING : 0;
  return { yaw: turn.tilt.yaw + turn.drag.yaw + sway, pitch: turn.tilt.pitch + turn.drag.pitch };
}

/** Whether another frame is needed to bring the turn to rest. */
export function turning(turn: Turn, options: { idle?: boolean } = {}): boolean {
  if (options.idle) return true;
  if (turn.phase !== 'rest') return true;
  return Math.abs(turn.goal.yaw - turn.tilt.yaw) > 0.01 || Math.abs(turn.goal.pitch - turn.tilt.pitch) > 0.01;
}

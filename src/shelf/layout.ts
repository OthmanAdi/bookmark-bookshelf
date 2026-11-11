import type { Geometry } from './types';

/**
 * Pure row layout. Given a float position it returns where every volume in a
 * range of slots sits and how far it is turned. No DOM, so it is unit-testable.
 *
 * A "slot" is an unwrapped place in the row. With a looping row slot 14 of a
 * 12-item shelf shows item 2; the caller does that mapping.
 */
export interface SlotPose {
  slot: number;
  /** Focus weight: 1 at the centre, 0 most of a step away, smooth in between. */
  weight: number;
  /** Turn toward the viewer in degrees: 0 shows the spine, `focusAngle` shows the cover. */
  angle: number;
  /** Lean in degrees, about the foot corner the volume leans toward. Negative leans left. */
  lean: number;
  /** Centre of the spine at the floor, before the lean, relative to the centre of the row, in px. */
  x: number;
  /**
   * The foot corner the volume leans on, as an offset from `x` along the row once the volume is turned.
   * Drawn as `translate(x + corner) rotateZ(lean) translateX(-corner) rotateY(-angle)`, so that corner
   * stays on the floor and nothing passes through it.
   */
  corner: number;
  /** Upward lift in px. */
  lift: number;
  /** Push toward the viewer in px. */
  z: number;
}

const DEG = Math.PI / 180;

/**
 * A volume finishes its turn this far from its slot, in steps. Turning over the whole step would make the
 * two volumes in transition need far more room half way than at either end, and the rest of the row would
 * swell outward and pull back every time a volume passes the centre.
 */
const TURN_SPAN = 0.78;
/** Neighbours begin to make room a little before the turn starts. */
const GAP_SPAN = 0.9;

function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** How far a volume is turned toward the viewer: 1 at its slot, 0 from `TURN_SPAN` away. */
export function focusWeight(position: number, slot: number): number {
  return smooth(1 - Math.abs(position - slot) / TURN_SPAN);
}

/** How much extra room the row gives a volume near the centre: 1 at its slot, 0 from `GAP_SPAN` away. */
export function gapWeight(position: number, slot: number): number {
  return smooth(1 - Math.abs(position - slot) / GAP_SPAN);
}

/** The parts of a volume's size that may differ from one volume to the next, in px. */
export type VolumeSize = Pick<Geometry, 'spineWidth' | 'bookHeight' | 'coverWidth'>;
/** Size of the volume in a slot. Left out, every volume has the geometry's size. */
export type SizeOf = (slot: number) => VolumeSize;

/** However slim a volume is, its spine stays wide enough to see and to hit. */
const MIN_SPINE_PX = 30;

/**
 * Size of a volume from how thick (0 to 1) and how tall (0 to 1) it is. Either left out means the look's
 * own size in that direction. A shorter volume has a narrower cover: every cover keeps one aspect.
 */
export function volumeSize(geometry: Geometry, thickness?: number, stature?: number): VolumeSize {
  const clamp = (value: number): number => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const spineWidth =
    thickness === undefined
      ? geometry.spineWidth
      : Math.max(MIN_SPINE_PX, geometry.spineWidth * (0.62 + 0.6 * clamp(thickness)));
  const tall = stature === undefined ? 1 : 0.9 + 0.1 * clamp(stature);
  return { spineWidth, bookHeight: geometry.bookHeight * tall, coverWidth: geometry.coverWidth * tall };
}

function sized(geometry: Geometry, size: VolumeSize | undefined): Geometry {
  return size ? { ...geometry, ...size } : geometry;
}

/** Distance between two neighbouring resting volumes of the geometry's size. */
export function restPitch(geometry: Geometry): number {
  return geometry.spineWidth + geometry.gap;
}

/** Width a volume takes up on screen when turned by `angle`: spine and cover both foreshortened. */
export function turnedWidth(geometry: Geometry, angle: number, size?: VolumeSize): number {
  const own = sized(geometry, size);
  const radians = angle * DEG;
  return own.spineWidth * Math.abs(Math.cos(radians)) + own.coverWidth * Math.sin(radians);
}

/** Sideways room a leaning volume needs at its head, in px. */
export function leanSpread(geometry: Geometry, weight: number, size?: VolumeSize): number {
  return sized(geometry, size).bookHeight * Math.abs(Math.sin(weight * geometry.focusLean * DEG));
}

/** Room one slot occupies along the row for a given focus weight and, when it differs, gap weight. */
export function slotAdvance(geometry: Geometry, weight: number, gap = weight, size?: VolumeSize): number {
  const angle = weight * geometry.focusAngle;
  return (
    turnedWidth(geometry, angle, size) + leanSpread(geometry, weight, size) + geometry.gap + gap * 2 * geometry.focusGap
  );
}

/**
 * How far the row moves for one unit of position near `position`, in px. With volumes of one size this
 * is the rest pitch. With mixed sizes the strips either side of the two turning volumes move at slightly
 * different speeds, and this is their mean: the mean resting width of those two volumes.
 */
export function pitchAt(position: number, geometry: Geometry, sizeOf?: SizeOf): number {
  const base = Math.floor(position);
  return (slotAdvance(geometry, 0, 0, sizeOf?.(base)) + slotAdvance(geometry, 0, 0, sizeOf?.(base + 1))) / 2;
}

/**
 * Poses for every slot from `from` to `to` inclusive. The volume at `position` sits at x = 0.
 *
 * Between two slots only the two volumes either side of `position` turn. Everything left of them and
 * everything right of them moves as one rigid strip, in step with the position, so the row stays under
 * the hand. The two turning volumes share the room between the strips: their own widths change with the
 * turn, and the gaps around them take up the difference. Those gaps never close, because a turned volume
 * is narrower than the room its slot gives it at rest.
 *
 * A leaning volume pivots on the foot corner it leans toward and gives up its gap on that side, so at
 * full turn its head rests against its neighbour instead of on air.
 */
export function computeRow(
  position: number,
  geometry: Geometry,
  from: number,
  to: number,
  sizeOf?: SizeOf,
): SlotPose[] {
  const base = Math.floor(position);
  const fraction = position - base;
  const side = Math.sign(geometry.focusLean);

  const sizes = new Map<number, VolumeSize>();
  const sizeAt = (slot: number): VolumeSize | undefined => {
    if (!sizeOf) return undefined;
    let size = sizes.get(slot);
    if (!size) {
      size = sizeOf(slot);
      sizes.set(slot, size);
    }
    return size;
  };
  const weightOf = (slot: number): number => focusWeight(position, slot);
  const bodyOf = (slot: number, weight: number): number =>
    turnedWidth(geometry, weight * geometry.focusAngle, sizeAt(slot)) + leanSpread(geometry, weight, sizeAt(slot));
  const roomOf = (gap: number): number => geometry.gap + gap * 2 * geometry.focusGap;
  // What a leaning volume gives up on its lean side: at full weight its own gap and its neighbour's.
  const tuckOf = (weight: number): number => (side === 0 ? 0 : weight * (geometry.gap + geometry.focusGap));
  const presentedOf = (slot: number): number => bodyOf(slot, 1) + roomOf(1) - tuckOf(1);
  const restingOf = (slot: number): number => bodyOf(slot, 0) + roomOf(0);

  // The two layouts this step travels between: `base` presented, then `base + 1` presented.
  const spanStart = presentedOf(base) + restingOf(base + 1);
  const spanEnd = restingOf(base) + presentedOf(base + 1);
  const span = spanStart + (spanEnd - spanStart) * fraction;
  const bodies = bodyOf(base, weightOf(base)) + bodyOf(base + 1, weightOf(base + 1));
  const tucks = tuckOf(weightOf(base)) + tuckOf(weightOf(base + 1));
  const rooms = roomOf(gapWeight(position, base)) + roomOf(gapWeight(position, base + 1));
  const share = rooms > 1e-6 ? Math.max(0, (span - bodies + tucks) / rooms) : 1;

  const roomAt = (slot: number): number => {
    const room = roomOf(gapWeight(position, slot));
    return slot === base || slot === base + 1 ? room * share : room;
  };
  const advanceOf = (slot: number): number => bodyOf(slot, weightOf(slot)) + roomAt(slot) - tuckOf(weightOf(slot));
  /** From the left edge of a slot to the left edge of the volume in it. */
  const insetOf = (room: number, weight: number): number => room / 2 - (side < 0 ? tuckOf(weight) : 0);

  // The presented volume is centred on 0 at both ends of the step; in between the origin moves evenly.
  // Measured from the left edge of slot `base`.
  const baseCentre = insetOf(roomOf(1), 1) + bodyOf(base, 1) / 2;
  const nextCentre = restingOf(base) + insetOf(roomOf(1), 1) + bodyOf(base + 1, 1) / 2;
  const origin = baseCentre + (nextCentre - baseCentre) * fraction;

  const lefts = new Map<number, number>();
  lefts.set(base, 0);
  let cursor = advanceOf(base);
  for (let slot = base + 1; slot <= to; slot++) {
    lefts.set(slot, cursor);
    cursor += advanceOf(slot);
  }
  cursor = 0;
  for (let slot = base - 1; slot >= from; slot--) {
    cursor -= advanceOf(slot);
    lefts.set(slot, cursor);
  }

  const poses: SlotPose[] = [];
  for (let slot = from; slot <= to; slot++) {
    const weight = weightOf(slot);
    const angle = weight * geometry.focusAngle;
    const lean = weight * geometry.focusLean;
    const own = sizeAt(slot);
    const spine = own?.spineWidth ?? geometry.spineWidth;
    const cover = own?.coverWidth ?? geometry.coverWidth;
    const radians = angle * DEG;
    // Foot corners of the turned volume, measured from the middle of its spine.
    const leftFoot = -(spine / 2) * Math.cos(radians);
    const rightFoot = (spine / 2) * Math.cos(radians) + cover * Math.sin(radians);
    const left = (lefts.get(slot) ?? 0) + insetOf(roomAt(slot), weight) - origin;
    const spread = leanSpread(geometry, weight, own);
    // Leaning left, the head reaches `spread` past the left foot; leaning right, past the right foot.
    const corner = lean < 0 ? leftFoot : lean > 0 ? rightFoot : 0;
    const x =
      lean < 0
        ? left + spread - leftFoot
        : lean > 0
          ? left + turnedWidth(geometry, angle, own) - rightFoot
          : left - leftFoot;
    poses.push({
      slot,
      weight,
      angle,
      lean,
      x,
      corner,
      lift: weight * geometry.focusLift,
      z: weight * geometry.focusPush,
    });
  }
  return poses;
}

/** Inclusive slot range that can be visible in a viewport of `width` px, with a margin of spare slots. */
export function visibleRange(
  position: number,
  geometry: Geometry,
  width: number,
  count: number,
  loop: boolean,
  margin = 2,
  sizeOf?: SizeOf,
): { from: number; to: number } {
  if (count <= 0) return { from: 0, to: -1 };
  const centre = Math.round(position);
  let from = centre;
  let to = centre;
  if (sizeOf) {
    // Walk out from the centre until half the width is filled on each side: thin volumes need more slots.
    const limit = loop ? Math.ceil(width / 2 / Math.max(1, geometry.gap)) : count;
    for (let reach = 1, filled = 0; filled < width / 2 && reach <= limit; reach++) {
      filled += slotAdvance(geometry, 0, 0, sizeOf(centre + reach));
      to = centre + reach;
    }
    for (let reach = 1, filled = 0; filled < width / 2 && reach <= limit; reach++) {
      filled += slotAdvance(geometry, 0, 0, sizeOf(centre - reach));
      from = centre - reach;
    }
    from -= margin;
    to += margin;
  } else {
    const reach = Math.ceil(width / 2 / restPitch(geometry)) + margin;
    from = centre - reach;
    to = centre + reach;
  }
  if (loop) return { from, to };
  return { from: Math.max(0, from), to: Math.min(count - 1, to) };
}

export function scaleGeometry(geometry: Geometry, factor: number): Geometry {
  return {
    spineWidth: geometry.spineWidth * factor,
    bookHeight: geometry.bookHeight * factor,
    coverWidth: geometry.coverWidth * factor,
    gap: geometry.gap * factor,
    focusGap: geometry.focusGap * factor,
    focusAngle: geometry.focusAngle,
    focusLean: geometry.focusLean,
    focusPush: geometry.focusPush * factor,
    focusLift: geometry.focusLift * factor,
    perspective: geometry.perspective,
  };
}

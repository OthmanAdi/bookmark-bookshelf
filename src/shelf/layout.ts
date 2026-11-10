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
  /** Focus weight: 1 at the centre, 0 one slot away, smooth in between. */
  weight: number;
  /** Turn toward the viewer in degrees: 0 shows the spine, `focusAngle` shows the cover. */
  angle: number;
  /** Lean in degrees, about the foot of the volume. */
  lean: number;
  /** Pivot (centre of the spine at the floor) relative to the centre of the row, in px. */
  x: number;
  /** Upward lift in px. */
  lift: number;
  /** Push toward the viewer in px. */
  z: number;
}

const DEG = Math.PI / 180;

function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export function focusWeight(position: number, slot: number): number {
  return smooth(1 - Math.abs(position - slot));
}

/** Distance between two neighbouring resting volumes. */
export function restPitch(geometry: Geometry): number {
  return geometry.spineWidth + geometry.gap;
}

/** Width a volume takes up on screen when turned by `angle`: spine and cover both foreshortened. */
export function turnedWidth(geometry: Geometry, angle: number): number {
  const radians = angle * DEG;
  return geometry.spineWidth * Math.abs(Math.cos(radians)) + geometry.coverWidth * Math.sin(radians);
}

/** Sideways room a leaning volume needs at its head, in px. */
export function leanSpread(geometry: Geometry, weight: number): number {
  return geometry.bookHeight * Math.abs(Math.sin(weight * geometry.focusLean * DEG));
}

/** Room one slot occupies along the row for a given focus weight. */
export function slotAdvance(geometry: Geometry, weight: number): number {
  const angle = weight * geometry.focusAngle;
  return turnedWidth(geometry, angle) + leanSpread(geometry, weight) + geometry.gap + weight * 2 * geometry.focusGap;
}

/**
 * Poses for every slot from `from` to `to` inclusive. The volume at `position`
 * sits at x = 0; while travelling between two slots the row is blended between
 * the two centred layouts, so nothing jumps.
 */
export function computeRow(position: number, geometry: Geometry, from: number, to: number): SlotPose[] {
  const base = Math.floor(position);
  const fraction = position - base;

  const weightOf = (slot: number): number => focusWeight(position, slot);
  const advanceOf = (slot: number): number => slotAdvance(geometry, weightOf(slot));

  // Centres measured from the left edge of slot `base`.
  const baseCentre = advanceOf(base) / 2;
  const nextCentre = advanceOf(base) + advanceOf(base + 1) / 2;
  const origin = baseCentre + (nextCentre - baseCentre) * fraction;

  const centres = new Map<number, number>();
  centres.set(base, baseCentre);
  let cursor = advanceOf(base);
  for (let slot = base + 1; slot <= to; slot++) {
    const advance = advanceOf(slot);
    centres.set(slot, cursor + advance / 2);
    cursor += advance;
  }
  cursor = 0;
  for (let slot = base - 1; slot >= from; slot--) {
    const advance = advanceOf(slot);
    centres.set(slot, cursor - advance / 2);
    cursor -= advance;
  }

  const poses: SlotPose[] = [];
  for (let slot = from; slot <= to; slot++) {
    const weight = weightOf(slot);
    const angle = weight * geometry.focusAngle;
    const centre = (centres.get(slot) ?? 0) - origin;
    const lean = weight * geometry.focusLean;
    // The pivot is the foot of the spine. A turned volume grows to the right of its pivot and a
    // leaning one reaches sideways at its head, so shift the pivot to keep the whole volume centred in its slot.
    const pivot =
      centre - (geometry.coverWidth * Math.sin(angle * DEG)) / 2 - (Math.sign(lean) * leanSpread(geometry, weight)) / 2;
    poses.push({
      slot,
      weight,
      angle,
      lean,
      x: pivot,
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
): { from: number; to: number } {
  if (count <= 0) return { from: 0, to: -1 };
  const reach = Math.ceil(width / 2 / restPitch(geometry)) + margin;
  const centre = Math.round(position);
  const from = centre - reach;
  const to = centre + reach;
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

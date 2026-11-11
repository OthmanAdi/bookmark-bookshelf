import type { Light } from './types';

/**
 * One light for every face of every volume. A face's brightness is a Lambert term against the look's
 * light, relative to a face square to the viewer, and the shelf draws the difference as a film of the
 * light's tint over the face. A face square to the viewer therefore keeps its own colour exactly.
 */

/** Light from the upper left and in front: what a volume looks like when a look names no light. */
export const DEFAULT_LIGHT: Light = { x: -0.42, z: 0.91, ambient: 0.42, tint: '#000' };

/** No face goes darker than this, so a board turned fully away still shows its cloth. */
const DEEPEST = 0.72;

export interface FaceShades {
  spine: number;
  /** The front board, where the cover is printed. */
  front: number;
  back: number;
}

export function resolveLight(light: Light | undefined): Light {
  return light ?? DEFAULT_LIGHT;
}

/**
 * Shade of the three faces of a volume turned by `angle` degrees (0 shows the spine, 90 the cover).
 * `reach` dims the whole volume, 1 where the light is full and less where it falls off.
 */
export function faceShades(light: Light, angle: number, reach = 1): FaceShades {
  const length = Math.hypot(light.x, light.z) || 1;
  const lx = light.x / length;
  const lz = light.z / length;
  const ambient = Math.min(1, Math.max(0, light.ambient));
  const lit = (nx: number, nz: number): number => ambient + (1 - ambient) * Math.max(0, nx * lx + nz * lz);
  // A light that misses the viewer's side entirely leaves nothing to compare against; treat it as faint.
  const square = Math.max(0.05, lit(0, 1));
  const shade = (nx: number, nz: number): number =>
    Math.min(DEEPEST, Math.max(0, 1 - (reach * lit(nx, nz)) / square));
  const radians = (angle * Math.PI) / 180;
  const sin = Math.sin(radians);
  const cos = Math.cos(radians);
  return {
    spine: shade(-sin, cos),
    front: shade(cos, sin),
    back: shade(-cos, -sin),
  };
}

import type { WebGLRenderer } from 'three';
import type { FrameVolume } from '../shelf/types';
import { type DressKit, styleOf } from './dress';
import { createMaterialKit, resolveBinding, resolveStamp } from './materials';
import { paintVolume } from './paint';
import { isStamp, type Binding, type Stamp } from './types';

/**
 * The kit Studio dresses volumes with: faces painted by the painter, lit by the generated materials.
 * The binding and stamp of an item are its own when it names known ones, else they follow from its
 * seed, so a shelf is mixed but the same on every visit.
 */

/** Relative luminance of a `#rgb` or `#rrggbb` colour, 0 to 1. Anything else counts as mid grey. */
export function luminance(color: string): number {
  const hex = color.trim().replace('#', '');
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return 0.2;
  const channel = (at: number): number => {
    const value = parseInt(full.slice(at, at + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** How each foil reads on a shelf, on average over what it mirrors: the colour to test its legibility with. */
const FOIL_READS: Partial<Record<Stamp, string>> = { gold: '#d9b45a', silver: '#d8d6cf', copper: '#c98a5e', holo: '#d8d6cf' };
/** A spine title is how a link is found, so a stamp chosen for the person must stand at least this far off its cloth. */
const LEGIBLE = 3;

/**
 * The stamp a volume gets when its item names none: the binder's first choice if its title can be read
 * on this cloth, else the first foil that can, else printed ink, which every look pairs with its cloth.
 * Blind stamping is never chosen for anyone: a title pressed without colour cannot be read from a spine.
 */
export function legibleStamp(first: Stamp, cloth: string): Stamp {
  const reads = (stamp: Stamp): boolean => {
    const foil = FOIL_READS[stamp];
    return foil !== undefined && contrast(foil, cloth) >= LEGIBLE;
  };
  if (first === 'ink' || reads(first)) return first;
  for (const stamp of ['gold', 'silver', 'copper'] as const) if (reads(stamp)) return stamp;
  return 'ink';
}

export function bindingFor(item: FrameVolume['item'], cloth?: string): { binding: Binding; stamp: Stamp } {
  const seed = Math.abs(Math.floor(item.seed ?? 0));
  const binding = resolveBinding(item.binding, seed);
  const stamp = resolveStamp(item.stamp, binding, seed);
  // What the person chose stands as chosen, readable or not.
  return { binding, stamp: isStamp(item.stamp) || cloth === undefined ? stamp : legibleStamp(stamp, cloth) };
}

/** Half-size textures where memory is short or the screen is small: a phone shows no more detail anyway. */
export function qualityFor(): 'high' | 'low' {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const small = Math.min(window.innerWidth, window.innerHeight) < 500;
  return small || (memory !== undefined && memory <= 4) ? 'low' : 'high';
}

/**
 * The real spine is bowed a little in the mesh already; the material adds the rest of the roundness
 * to its normals, so the highlight runs down the spine as a soft line.
 */
const SPINE_ROUND = 0.22;

export function createKit(renderer: WebGLRenderer, quality: 'high' | 'low' = qualityFor()): DressKit {
  const materials = createMaterialKit(renderer, { quality });
  // Asked for every volume in every frame, so the cloth is read from the page once per volume and look.
  const chosen = new Map<string, { binding: Binding; stamp: Stamp }>();
  return {
    bindingOf(volume, variant = '') {
      const item = volume.item;
      const key = `${item.id}|${variant}|${item.cloth ?? ''}|${item.binding ?? ''}|${item.stamp ?? ''}|${item.seed ?? 0}`;
      let choice = chosen.get(key);
      if (!choice) {
        if (chosen.size > 600) chosen.clear();
        choice = bindingFor(item, styleOf(volume.element).cloth);
        chosen.set(key, choice);
      }
      return choice;
    },
    paint: ({ volume, size, binding, stamp, density }) =>
      paintVolume({ item: volume.item, source: volume.element, size, binding, stamp, density }),
    materials: (volume, style, binding, stamp, faces) =>
      materials.volume(
        {
          binding,
          stamp,
          cloth: style.cloth,
          ink: style.ink,
          seed: Math.abs(Math.floor(volume.item.seed ?? 0)),
          size: { spineWidth: volume.spineWidth, bookHeight: volume.bookHeight, coverWidth: volume.coverWidth },
          spineRound: SPINE_ROUND,
        },
        faces,
      ),
    get environment() {
      return materials.environment;
    },
    floor: (variant, size) => materials.floor(variant, size),
    dispose: () => materials.dispose(),
  };
}

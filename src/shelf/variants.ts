import type { Geometry, Variant, VariantMotion } from './types';

/**
 * Variants change geometry here and look in `variants.css` (scoped by
 * `data-variant` on the shelf root). Adding one means: one entry below, one
 * CSS block, nothing else.
 */

/** Default: one endless row on a paper ground, matte cloth spines, soft contact shadows. */
const paperGeometry: Geometry = {
  spineWidth: 58,
  bookHeight: 340,
  coverWidth: 206,
  gap: 10,
  focusGap: 14,
  focusAngle: 90,
  focusLean: -4.4,
  focusPush: 0,
  focusLift: 0,
  perspective: 2000,
};

/**
 * Every look moves the same way. A step along the row runs on the same spring as a released drag, so a
 * second press carries its speed instead of starting from rest. Opening is one continuous move: the
 * volume stays in view from the shelf to its place beside the page.
 */
const steadyMotion: VariantMotion = {
  travel: null,
  openDuration: 720,
  closeDuration: 520,
  openHold: 0,
  swap: false,
};

export const VARIANTS: Record<string, Variant> = {
  paper: {
    name: 'paper',
    label: 'Paper Row',
    summary: 'One endless row of cloth spines on a paper ground. The default.',
    geometry: paperGeometry,
    motion: steadyMotion,
    loop: true,
  },
  oak: {
    name: 'oak',
    label: 'Oak Library',
    summary: 'Thicker, shorter volumes standing on a wooden board with a back panel. The row has two ends.',
    geometry: {
      ...paperGeometry,
      spineWidth: 66,
      bookHeight: 300,
      coverWidth: 204,
      gap: 3,
      focusGap: 18,
      focusLean: -2,
      focusPush: 26,
      focusLift: 0,
      perspective: 1500,
    },
    motion: steadyMotion,
    loop: false,
  },
  night: {
    name: 'night',
    label: 'Night Study',
    summary: 'A dark ground with a pool of light at the centre. The centred volume lifts and comes forward.',
    geometry: {
      ...paperGeometry,
      gap: 12,
      focusGap: 22,
      focusLean: 0,
      focusPush: 70,
      focusLift: 14,
      perspective: 1300,
    },
    motion: steadyMotion,
    loop: true,
  },
  pocket: {
    name: 'pocket',
    label: 'Pocket Paperbacks',
    summary: 'Thin, tightly packed paperbacks in flat colour with small covers.',
    geometry: {
      ...paperGeometry,
      spineWidth: 36,
      bookHeight: 300,
      coverWidth: 190,
      gap: 4,
      focusGap: 12,
      focusLean: 3,
      perspective: 2400,
    },
    motion: steadyMotion,
    loop: true,
  },
};

export const DEFAULT_VARIANT = 'paper';

export function resolveVariant(variant: string | Variant | undefined): Variant {
  if (variant && typeof variant === 'object') return variant;
  return VARIANTS[variant ?? DEFAULT_VARIANT] ?? VARIANTS[DEFAULT_VARIANT]!;
}

export function listVariants(): Variant[] {
  return Object.values(VARIANTS);
}

export const CLOTHS = ['ink', 'bone', 'rust', 'moss', 'plum', 'ochre', 'slate', 'teal'] as const;
export const PATTERNS = ['arcs', 'bars', 'dots', 'rays', 'tiles', 'waves'] as const;

export type ClothName = (typeof CLOTHS)[number];
export type PatternName = (typeof PATTERNS)[number];

export function resolveCloth(name: string | undefined): ClothName {
  return (CLOTHS as readonly string[]).includes(name ?? '') ? (name as ClothName) : CLOTHS[0];
}

export function resolvePattern(name: string | undefined): PatternName {
  return (PATTERNS as readonly string[]).includes(name ?? '') ? (name as PatternName) : PATTERNS[0];
}

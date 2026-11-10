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
 * Paper Row follows the measured reference timing: programmed steps ease in and out over 1.65 to 2.05 s
 * depending on distance, and opening holds for five frames (the volume gives way to the page at once)
 * before a move of just over one second. Closing takes about 0.6 s. A dragged or flicked row is never slowed down: it tracks the pointer and settles on a spring.
 */
const measuredMotion: VariantMotion = {
  travel: { base: 1650, perItem: 200, max: 2050 },
  openDuration: 1040,
  closeDuration: 620,
  openHold: 165,
  swap: true,
};

/** The other looks answer faster: spring travel and a single continuous open. */
const quickMotion: VariantMotion = {
  travel: null,
  openDuration: 900,
  closeDuration: 640,
  openHold: 0,
  swap: false,
};

export const VARIANTS: Record<string, Variant> = {
  paper: {
    name: 'paper',
    label: 'Paper Row',
    summary: 'One endless row of cloth spines on a paper ground. The default.',
    geometry: paperGeometry,
    motion: measuredMotion,
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
    motion: quickMotion,
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
    motion: quickMotion,
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
    motion: quickMotion,
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

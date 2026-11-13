/**
 * How each binding and each stamp answers light, as plain numbers. The kit reads these to build
 * materials; keeping them apart from three.js lets them be read, compared and tested on their own.
 */
import type { Binding, Stamp } from '../types';

export type TileName = 'cloth' | 'linen' | 'leather' | 'paper' | 'gloss' | 'velvet' | 'brushed' | 'flake';

/** A linear RGB colour, each channel 0 to 1. */
export type Rgb = readonly [number, number, number];

export interface BindingRecipe {
  /** The repeating surface the binding is made of. */
  tile: TileName;
  /**
   * CSS px one repeat of the tile covers on a volume 340 px tall. The kit scales it with the height of the
   * volume, so the detail keeps its size against the book: a taller drawing of the same book shows the
   * same number of threads.
   */
  span: number;
  normalScale: number;
  /** Roughness where the tile keeps all of it; the tile lowers it on polished parts. */
  roughness: number;
  metalness: number;
  /** Strength of the soft glow that fabric shows at grazing angles, and how it is tuned. */
  sheen: number;
  /** How far the sheen colour is lifted from the cloth colour toward white, 0 to 1. */
  sheenLift: number;
  sheenRoughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  /** Stretch of the highlight across the scratches of a brushed metal. */
  anisotropy: number;
  /** Thin film colour over the whole board (holographic foil). */
  iridescence: number;
  /** How far the film colour runs with the angle of the light, in nanometres of film. */
  filmShift: number;
  /** How strongly the tile's shade (hollows, single threads) is printed into the colour, 0 to 1. */
  shade: number;
  /** Exponent applied to the brightness of the print: below 1 lifts a dark colour so it can work as a metal. */
  lift: number;
  /** How far the print is paled toward silver, 0 to 1. Holographic foil is pastel whatever its colour. */
  pastel: number;
  /** Rubbed edges: width in CSS px and how much darker (positive) or lighter (negative) they are. */
  wear: readonly [number, number];
  /** Turn of the covering over the board edge: width in CSS px and how far the surface leans there. */
  bevel: readonly [number, number];
  /** Depth of the joint, the groove where the board hinges on the spine. */
  joint: number;
}

const cloth: BindingRecipe = {
  tile: 'cloth',
  // Buckram runs to 11 or 12 threads to the centimetre. Drawn a little coarser, 64 threads to 100 px, it
  // still resolves on an ordinary screen.
  span: 100,
  normalScale: 1,
  // Low enough that the light draws a soft band down a board as it turns.
  roughness: 0.78,
  metalness: 0,
  sheen: 0.7,
  sheenLift: 0.38,
  sheenRoughness: 0.5,
  clearcoat: 0,
  clearcoatRoughness: 0,
  anisotropy: 0,
  iridescence: 0,
  filmShift: 0,
  // The weave is relief for the light to find. Printed into the colour it stays put when the light moves
  // and beats against the pixels of a resting spine, so only a little of it is.
  shade: 0.35,
  lift: 1,
  pastel: 0,
  wear: [5, -0.05],
  bevel: [2.2, 0.55],
  joint: 0.9,
};

export const BINDING_RECIPES: Record<Binding, BindingRecipe> = {
  cloth,
  // Linen book cloth is finer than buckram: 56 threads to 76 px, with slubs and threads of uneven colour.
  linen: { ...cloth, tile: 'linen', span: 76, normalScale: 0.9, roughness: 0.93, sheen: 0.32, sheenLift: 0.3, sheenRoughness: 0.7, shade: 0.3, wear: [5, -0.04] },
  leather: {
    ...cloth,
    tile: 'leather',
    // Goatskin: a pebble of 0.6 to 1 mm, which on an octavo 340 px tall is about a pixel and a half.
    span: 60,
    normalScale: 0.6,
    // Waxed, not varnished: a broad soft highlight and only a trace of a coat.
    roughness: 0.7,
    sheen: 0,
    clearcoat: 0.1,
    clearcoatRoughness: 0.4,
    shade: 0.25,
    wear: [9, 0.2],
    bevel: [3, 0.7],
    joint: 1.1,
  },
  paper: { ...cloth, tile: 'paper', span: 96, normalScale: 0.4, roughness: 0.72, sheen: 0, shade: 0.4, wear: [3, -0.03], bevel: [1.6, 0.45], joint: 0.7 },
  gloss: {
    ...cloth,
    tile: 'gloss',
    span: 220,
    normalScale: 0.12,
    roughness: 0.42,
    sheen: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    shade: 0,
    wear: [0, 0],
    bevel: [1.6, 0.5],
    joint: 0.8,
  },
  velvet: { ...cloth, tile: 'velvet', span: 150, normalScale: 0.3, roughness: 1, sheen: 1, sheenLift: 0.7, sheenRoughness: 0.5, shade: 1, wear: [6, 0.08], bevel: [3.2, 0.6], joint: 0.6 },
  foil: {
    ...cloth,
    tile: 'brushed',
    span: 150,
    normalScale: 0.16,
    roughness: 0.27,
    metalness: 1,
    sheen: 0,
    anisotropy: 0.4,
    shade: 0.5,
    lift: 0.36,
    wear: [0, 0],
    bevel: [1.6, 0.5],
    joint: 0.8,
  },
  holo: {
    ...cloth,
    tile: 'flake',
    span: 110,
    normalScale: 1,
    roughness: 0.2,
    metalness: 0.95,
    sheen: 0,
    iridescence: 1,
    filmShift: 120,
    shade: 0.5,
    lift: 0.28,
    pastel: 0.62,
    wear: [0, 0],
    bevel: [1.6, 0.5],
    joint: 0.8,
  },
};

/**
 * How near a volume is drawn: 0 at shelf distance, 1 on a cover shown large or held in the hand. It
 * follows from the height the volume is drawn at unless the caller says how `presented` it is.
 */
export function nearness(bookHeight: number, presented?: number): number {
  if (presented !== undefined && Number.isFinite(presented)) return Math.min(1, Math.max(0, presented));
  const t = Math.min(1, Math.max(0, (bookHeight - 380) / 260));
  return t * t * (3 - 2 * t);
}

/**
 * Share of a binding's relief and printed shade a volume shows. On a spine at shelf distance a thread or
 * a pebble is about a pixel wide; drawn at full strength there it shimmers, so it is quieter the
 * further off the volume stands and whole on a cover shown large.
 */
export function reliefAt(near: number): number {
  return 0.45 + 0.55 * Math.min(1, Math.max(0, near));
}

/** Index of refraction and thickness range, in nanometres, of the film on holographic foil. */
export const FILM = { ior: 1.6, thickness: [250, 520] as const, span: 260 };

export interface StampRecipe {
  /** Colour laid over the print inside the mask: a metal, the ink (taken from the look), or nothing. */
  color: Rgb | 'ink' | null;
  /** Share of the print replaced by `color`. */
  tint: number;
  /** What is left of the colour inside the mask: pressed cloth is a little darker. */
  shade: number;
  /** How flat the binding's own relief is pressed, 0 to 1. Foil still shows a trace of the weave. */
  flatten: number;
  /** Depth of the pressed edge. */
  deboss: number;
  /** Roughness inside the mask is `[a, b]`: a + b times the binding's roughness. */
  roughness: readonly [number, number];
  /** Metalness inside the mask, written the same way. */
  metalness: readonly [number, number];
  /** Share of the binding's sheen and clearcoat left inside the mask. */
  sheen: number;
  clearcoat: number;
  /** Thin film inside the mask: 1 shows it, 0 hides it, null leaves what the binding has. */
  iridescence: number | null;
}

const metal = { tint: 1, shade: 1, flatten: 0.72, deboss: 1.1, metalness: [1, 0] as const, sheen: 0, clearcoat: 0, iridescence: 0 };

export const STAMP_RECIPES: Record<Stamp, StampRecipe> = {
  // A little deeper than the measured metals, which look pale once a white lamp is mirrored in them.
  gold: { ...metal, color: [1, 0.68, 0.24], roughness: [0.2, 0.06] },
  silver: { ...metal, color: [0.96, 0.95, 0.91], roughness: [0.16, 0.06] },
  copper: { ...metal, color: [0.95, 0.52, 0.33], roughness: [0.26, 0.06] },
  holo: { ...metal, color: [0.93, 0.93, 0.95], roughness: [0.14, 0.04], iridescence: 1 },
  blind: { color: null, tint: 0, shade: 0.8, flatten: 0.6, deboss: 1.7, roughness: [0, 0.8], metalness: [0, 1], sheen: 0.35, clearcoat: 1, iridescence: null },
  ink: { color: 'ink', tint: 1, shade: 1, flatten: 0.2, deboss: 0.2, roughness: [0.3, 0.55], metalness: [0, 0], sheen: 0.4, clearcoat: 1, iridescence: 0 },
};

/**
 * Shelf module: draws volumes for a pose and reports intents.
 * It has no clock, no gestures and no storage.
 */
export { mountShelf } from './shelf';
export { createCover, createCoverArt } from './cover-art';
export { computeRow, focusWeight, restPitch, scaleGeometry, slotAdvance, turnedWidth, visibleRange, type SlotPose } from './layout';
export {
  CLOTHS,
  DEFAULT_VARIANT,
  listVariants,
  PATTERNS,
  resolveCloth,
  resolvePattern,
  resolveVariant,
  VARIANTS,
  type ClothName,
  type PatternName,
} from './variants';
export type {
  Box,
  Geometry,
  Pose,
  ShelfHandle,
  ShelfIntent,
  ShelfItem,
  ShelfOptions,
  Unsubscribe,
  Variant,
  VariantMotion,
} from './types';

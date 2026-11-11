/**
 * Shelf module: draws volumes for a pose and reports intents.
 * It has no clock, no gestures and no storage.
 */
export { mountShelf } from './shelf';
export { createCover, createCoverArt } from './cover-art';
export { DEFAULT_LAMP, DEFAULT_LIGHT, faceShades, lampReach, sheenOf, sweepOf, type FaceShades } from './light';
export {
  computeRow,
  computeStandingRow,
  focusWeight,
  gapWeight,
  LOOP_FILL,
  pitchAt,
  restLength,
  restPitch,
  rowStands,
  scaleGeometry,
  slotAdvance,
  turnedWidth,
  visibleRange,
  volumeSize,
  type SizeOf,
  type SlotPose,
  type StandingRow,
  type VolumeSize,
} from './layout';
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
  CoverPlacement,
  Geometry,
  Light,
  Pose,
  ShelfHandle,
  ShelfIntent,
  ShelfItem,
  ShelfOptions,
  Unsubscribe,
  Variant,
  VariantMotion,
} from './types';

/**
 * Shelf contract. The shelf draws a pose and reports what the person asked for.
 * It owns no clock and no gestures: something else (usually the motion module)
 * decides the pose, and something else decides what an intent leads to.
 */

export type Unsubscribe = () => void;

export interface ShelfItem {
  id: string;
  title: string;
  /** Short origin line, usually the hostname. Shown on the cover and in the caption. */
  source?: string;
  author?: string;
  /** Catalogue mark at the head of the spine. Defaults to the position, for example "07". */
  mark?: string;
  /** Cloth colour name. Unknown names fall back to the variant's first cloth. */
  cloth?: string;
  /** Cover pattern name. Unknown names fall back to the first pattern. */
  pattern?: string;
  seed?: number;
  /** Reading progress 0 to 1. Above 0 a ribbon marks the volume. */
  progress?: number;
}

/** One frame of the shelf. */
export interface Pose {
  /** Float index of the volume at the centre. Unbounded when the row loops. */
  position: number;
  /** 0 closed, 1 the centred volume has flown to the stage. Already eased. */
  open: number;
  /** Reduced motion: no flight, the row simply fades while opening. */
  reduced?: boolean;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ShelfIntent =
  /** A volume that is not at the centre was picked. `slot` is the unwrapped row position to travel to. */
  | { type: 'focus'; id: string; index: number; slot: number }
  /** The centred volume was activated. */
  | { type: 'open'; id: string; index: number }
  | { type: 'step'; direction: -1 | 1 }
  | { type: 'jump'; to: 'first' | 'last' };

/** Sizes in px at scale 1. The shelf scales all of them together to fit its height. */
export interface Geometry {
  spineWidth: number;
  bookHeight: number;
  coverWidth: number;
  /** Space between two resting spines. */
  gap: number;
  /** Extra space on each side of the turned volume. */
  focusGap: number;
  /** How far the centred volume turns, in degrees. 90 shows the cover square on. */
  focusAngle: number;
  /** Sideways lean of the centred volume in degrees. Negative leans left. */
  focusLean: number;
  /** How far the centred volume comes toward the viewer. */
  focusPush: number;
  /** Lift of the centred volume above the floor. */
  focusLift: number;
  perspective: number;
}

export interface Variant {
  name: string;
  label: string;
  /** One-line description for pickers and docs. */
  summary: string;
  geometry: Geometry;
  /** Whether the row repeats endlessly. */
  loop: boolean;
}

export interface ShelfOptions {
  items: ShelfItem[];
  /** Variant name or a full variant. Defaults to `paper`. */
  variant?: string | Variant;
  /** Overrides the variant's loop setting. */
  loop?: boolean;
  /** Accessible name of the shelf region. */
  label?: string;
  /** Show the title caption under the row. Default true. */
  caption?: boolean;
  /** Show previous and next buttons. Default true. */
  arrows?: boolean;
  /** Initial pose. Defaults to position 0, closed. */
  pose?: Pose;
}

export interface ShelfHandle {
  readonly element: HTMLElement;
  /** The element to hand to a gesture recogniser. */
  readonly surface: HTMLElement;
  /** Empty container under the caption for host-supplied actions. */
  readonly actions: HTMLElement;
  setItems(items: ShelfItem[]): void;
  /** Draws one frame. Cheap enough to call on every animation frame. */
  setPose(pose: Pose): void;
  /** Viewport box the centred cover flies to while opening. Null clears it. */
  setStage(box: Box | null): void;
  setVariant(variant: string | Variant): void;
  readonly variant: Variant;
  readonly loop: boolean;
  /** Distance in px between two neighbouring resting volumes, at the current scale. */
  pitch(): number;
  /** Viewport box of the centred volume's cover right now. Null when there are no items. */
  coverBox(): Box | null;
  /** Moves keyboard focus to the centred volume. */
  focusCurrent(): void;
  on(listener: (intent: ShelfIntent) => void): Unsubscribe;
  /** Re-measures after a size change. Called automatically on resize. */
  refresh(): void;
  destroy(): void;
}

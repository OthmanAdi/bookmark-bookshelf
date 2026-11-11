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
  /** Reading progress 0 to 1. Above 0 a slip marks the volume. */
  progress?: number;
  /** How thick the volume is, 0 to 1. Left out, every volume has the look's base thickness. */
  thickness?: number;
  /** How tall the volume stands, 0 to 1. Left out, every volume has the look's full height. */
  stature?: number;
  /**
   * The shape of the saved text, one value per paragraph in reading order: its length relative to the
   * longest, 0 to 1. A heading is given as a negative value. The cover can print it as its plate.
   */
  outline?: number[];
  /** Language of the title, as a BCP 47 tag. Lets the cover hyphenate correctly. */
  lang?: string;
  /** One line about the volume, shown in the caption when the shelf draws it. */
  note?: string;
  /** True when the person has marked the volume as read. */
  done?: boolean;
}

/** One frame of the shelf. */
export interface Pose {
  /** Float index of the presented volume: the one at the centre of a travelling row. Unbounded when the row loops. */
  position: number;
  /**
   * 0 closed, 1 the centred volume is open beside the page. Already eased. Above 0 the shelf leaves that
   * volume's place empty, so the host can carry a copy of its cover, and parts the neighbours around it.
   */
  open: number;
  /** Reduced motion: the row stays exactly as it is while a volume opens. */
  reduced?: boolean;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where the presented cover stands right now, for a host that carries a copy of it elsewhere. */
export interface CoverPlacement {
  /** Centre of the cover face as drawn, in viewport px. */
  cx: number;
  cy: number;
  /** Size of the cover face at the shelf's current scale, before any turn, lean or perspective. */
  width: number;
  height: number;
  /** Sideways lean in degrees, negative to the left, as `rotateZ` takes it. */
  lean: number;
  /** Degrees the face is turned away from square to the viewer, about its spine edge, as `rotateY` takes it. */
  yaw: number;
  /** How much larger perspective draws the face than its size, because it stands nearer the viewer. */
  scale: number;
  /**
   * The highlight on the face right now: its opacity and the place of its band, as `--bb-sheen` and
   * `--bb-sweep` for an element of class `bb-book__sheen`, so a copy can start with the same light.
   */
  sheen: number;
  sweep: number;
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

/**
 * How a look moves. Durations in ms. The shelf reads none of it; it is data for whoever drives the
 * pose (the object has the shape the motion module's `setTiming` accepts).
 */
export interface VariantMotion {
  /** Eased travel for programmed moves: `min(max, base + perItem * (items - 1))`. Null uses the spring. */
  travel: { base: number; perItem: number; max: number } | null;
  openDuration: number;
  closeDuration: number;
  /** Pause between the trigger and the opening move. */
  openHold: number;
  /** Ignored: an opening volume is always in view. Accepted so existing look definitions still apply. */
  swap?: boolean;
}

/**
 * Where the light of a look comes from. `x` and `z` are a direction in the floor plane (x to the right,
 * z toward the viewer), `ambient` is the share of light a face gets when it is turned fully away, and
 * `tint` is the colour of shade. With `lamp`, the light is a point instead: `x` and `z` are where it
 * stands, in cover widths from the centre of the row, each volume is lit from its own side of it, and
 * its light falls off along the row as `1 / (1 + (distance / reach)^2)`, never below `floor`.
 */
export interface Light {
  x: number;
  z: number;
  ambient: number;
  tint: string;
  lamp?: { reach: number; floor: number };
}

export interface Variant {
  name: string;
  label: string;
  /** One-line description for pickers and docs. */
  summary: string;
  geometry: Geometry;
  motion: VariantMotion;
  /** Left out, the look is lit from the upper left like the default. */
  light?: Light;
  /** Whether the row repeats endlessly. */
  loop: boolean;
}

export interface ShelfOptions {
  items: ShelfItem[];
  /** Variant name or a full variant. Defaults to `paper`. */
  variant?: string | Variant;
  /**
   * Overrides the variant's loop setting. Either way a row only loops when its volumes at rest fill at
   * least four fifths of the scene; a shorter row stands still between two bookends (`ShelfHandle.fixed`).
   */
  loop?: boolean;
  /**
   * Called when the row starts or stops looping after mounting: items were added or removed, the scene
   * was resized, or the look changed. `ShelfHandle.loop` and `ShelfHandle.fixed` already have their new
   * values.
   */
  onLoopChange?: (loop: boolean) => void;
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
  setVariant(variant: string | Variant): void;
  readonly variant: Variant;
  /** Whether the row repeats endlessly right now. It changes with the items and the scene's width. */
  readonly loop: boolean;
  /**
   * True while the row is short enough to stand whole in the middle of the scene. Such a row does not
   * travel: the position only says which volume is presented, so a host should not let a drag or the
   * wheel move it. Picking a spine, the arrow keys and the arrow buttons still move along it.
   */
  readonly fixed: boolean;
  /** Mean distance in px between two neighbouring resting volumes, at the current scale. */
  pitch(): number;
  /** How far the row moves in px for one unit of position near `position`; volumes may differ in thickness. */
  pitchAt(position: number): number;
  /** Layout size of a cover on the shelf at the current scale, before any turn or lean. */
  coverSize(): { width: number; height: number };
  /** Viewport box of the centred volume's cover right now. Null when there are no items. */
  coverBox(): Box | null;
  /** The centred cover's place, size, lean and turn right now. Reads layout once; null when there are no items. */
  coverPlacement(): CoverPlacement | null;
  /** Moves keyboard focus to the centred volume. */
  focusCurrent(): void;
  on(listener: (intent: ShelfIntent) => void): Unsubscribe;
  /** Re-measures after a size change. Called automatically on resize. */
  refresh(): void;
  destroy(): void;
}

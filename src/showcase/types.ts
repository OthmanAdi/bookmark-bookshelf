import type { ShelfItem } from '../shelf/types';
import type { Angles } from './turn';
import type { Stand } from './travel';

/**
 * Showcase contract: one book at a time, large, with what is known about it beside it. This file holds
 * the shapes its parts agree on and imports nothing at runtime.
 */

/** One link as the showcase shows it. The words are the host's, so every view of a link says the same. */
export interface ShowcaseItem {
  /** What the cover is drawn from, the same item the shelf draws. */
  book: ShelfItem;
  url: string;
  tags: readonly string[];
  /** The main action in words: `Read`, `Resume at 34%`, `Read again` or `Add text`. */
  action: string;
  /** Where the reading stands in words: `Not started`, `34% read`, `Read`, `No text saved yet`. */
  state: string;
  /** Reading time ready to print, for a link with a text. */
  minutes?: string;
  /** When it was saved, ready to print. */
  saved?: string;
  /** The shelf it stands on, when books of several shelves are shown together. */
  shelf?: string;
}

/** The look the books are drawn in. */
export interface ShowcaseLook {
  /** Name of the look, as on `data-variant`. */
  variant: string;
  /** Cover width over height. */
  aspect: number;
}

/** Sizes of the book in view, in px of the stage. */
export interface BookBox {
  width: number;
  height: number;
  /** Distance of the viewer, as CSS `perspective` takes it. */
  perspective: number;
  /** Size of the stage the book stands in. */
  stageWidth: number;
  stageHeight: number;
}

/** One book in one frame. */
export interface BookFrame {
  index: number;
  item: ShelfItem;
  /** Where the move between books has put it. */
  stand: Stand;
  /** The turn the hand has given it; the book in view only. */
  turn: Angles;
  opacity: number;
  /** How far it stands open under the hand, 0 to 1. */
  peek: number;
  /** The book the showcase is heading for. */
  target: boolean;
}

/** A way to draw the books: CSS 3D or WebGL. */
export interface Drawing {
  readonly kind: 'classic' | 'studio';
  /** What is put on the stage. */
  readonly element: HTMLElement;
  setLook(look: ShowcaseLook): void;
  resize(box: BookBox): void;
  /** Where the pointer is over the stage, -1 to 1 each way, for a drawing whose light follows it. */
  setPointer(x: number, y: number): void;
  draw(frames: readonly BookFrame[]): void;
  /** Forgets everything drawn for books that changed. */
  reset(): void;
  destroy(): void;
}

/** How the book in view rests: turned to show its spine, its head tipped a little toward the viewer. Degrees. */
export const REST = { yaw: 24, pitch: -5, roll: -1.5 } as const;

/** How thick a book is drawn, as a share of its cover width, from the item's thickness (0 to 1). */
export function thicknessShare(thickness: number | undefined): number {
  const t = Math.min(1, Math.max(0, thickness ?? 0.4));
  return 0.085 + 0.2 * t;
}

/** The largest book that fits a stage, keeping room round it for its turn and its shadow. */
export function fitBook(stageWidth: number, stageHeight: number, aspect: number): BookBox {
  const ratio = aspect > 0 && Number.isFinite(aspect) ? aspect : 0.68;
  const height = Math.max(120, Math.min(stageHeight * 0.7, (stageWidth * 0.6) / ratio, 620));
  return { width: height * ratio, height, perspective: height * 4.2, stageWidth, stageHeight };
}

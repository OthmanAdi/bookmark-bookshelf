/**
 * Reader contract. Renders a saved reading copy as text nodes only, tracks the
 * reading position and reports it. It never fetches a URL and never parses HTML.
 */

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'em'; c: Inline[] }
  | { t: 'strong'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] };

export type Block =
  | { type: 'heading'; level: 2 | 3; inlines: Inline[] }
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'quote'; inlines: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'code'; text: string }
  | { type: 'rule' };

export interface ReaderDoc {
  id: string;
  title: string;
  /** Absolute http(s) URL of the original. Only ever used as a link target. */
  url: string;
  author?: string;
  /** ISO date the item was saved. */
  addedAt?: string;
  note?: string;
  tags?: string[];
  /** Reading copy in markdown-lite. Missing or empty shows the paste panel. */
  text?: string;
}

/** Same shape as the store's progress without the timestamp, so the two modules stay independent. */
export interface ReaderProgress {
  block: number;
  ratio: number;
  percent: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReaderLabels {
  /** The bar button that returns to the shelf. */
  close: string;
  openOriginal: string;
  editCopy: string;
  saveCopy: string;
  cancel: string;
  pasteLabel: string;
  emptyTitle: string;
  emptyBody: string;
  progress: (percent: number) => string;
  /** Names of the two bar buttons that step the text size, and of the group they sit in. */
  smaller: string;
  larger: string;
  textSize: string;
  /** Reading time, for example "6 min". */
  minutes: (minutes: number) => string;
  /** The saved date as a sentence start, for example "Saved 14 Sep 2026". It receives the formatted date. */
  saved: (date: string) => string;
}

export interface ReaderOptions {
  doc: ReaderDoc;
  /** Position to restore after mounting. */
  progress?: ReaderProgress;
  /** Any element to show as the volume's cover. The reader only places and sizes it. */
  cover?: HTMLElement | null;
  /** Cover width divided by height. Defaults to 0.62. */
  coverAspect?: number;
  onProgress?: (progress: ReaderProgress) => void;
  onClose?: () => void;
  /** Body size as a step from 0 to 4 (17, 19, 21, 24 and 28 px). Without it the size follows the screen. */
  textScale?: number;
  /** Called with the new step when the person changes the text size. */
  onTextScale?: (scale: number) => void;
  /** Called with the new reading copy when the person saves the paste panel. */
  onSaveText?: (text: string) => void;
  labels?: Partial<ReaderLabels>;
}

export interface ReaderHandle {
  /** Root element, `role="dialog"`. */
  readonly element: HTMLElement;
  /** Scroll container that holds the document. */
  readonly scroller: HTMLElement;
  /** Where the cover sits in the open layout, in viewport coordinates. Null without a cover. */
  coverSlotRect(): Box | null;
  /**
   * Drives the open transition with linear time: 0 is closed (nothing visible), 1 is fully open.
   * The sheet fades in between 0.17 and 0.60 and the text enters after 0.54; closing plays the same
   * window backwards. `from` is accepted for older callers and ignored.
   */
  setReveal(progress: number, from?: Box | null): void;
  /**
   * Where the cover lands, in viewport coordinates and always on screen: the cover's own place when it is
   * in view, otherwise a thumbnail in the bar. Measured when called, so call it after the position is
   * restored. Null without a cover or before the reader has a layout.
   */
  flightTarget(): Box | null;
  /** Shows or hides the reader's own cover, for a hand-off with a flying book. */
  setCoverVisible(visible: boolean): void;
  /** Moves focus to the close button. */
  focus(): void;
  /** Replaces the document, keeping the reader mounted. */
  update(doc: ReaderDoc): void;
  progress(): ReaderProgress;
  destroy(): void;
}

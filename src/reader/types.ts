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
  close: string;
  openOriginal: string;
  editCopy: string;
  saveCopy: string;
  cancel: string;
  pasteLabel: string;
  emptyTitle: string;
  emptyBody: string;
  progress: (percent: number) => string;
  minutes: (minutes: number) => string;
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
   * Drives the open transition. 0 is closed (nothing visible), 1 is fully open.
   * `from` is the viewport box the sheet grows out of. Without it the sheet fades.
   */
  setReveal(progress: number, from?: Box | null): void;
  /** Shows or hides the reader's own cover, for a hand-off with a flying book. */
  setCoverVisible(visible: boolean): void;
  /** Moves focus to the close button. */
  focus(): void;
  /** Replaces the document, keeping the reader mounted. */
  update(doc: ReaderDoc): void;
  progress(): ReaderProgress;
  destroy(): void;
}

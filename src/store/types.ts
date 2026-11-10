/**
 * Store contract. Pure data and persistence: no DOM, no rendering, no network.
 * Everything another module needs from the store is declared here.
 */

export const LIBRARY_FORMAT = 'bookmark-bookshelf' as const;
export const LIBRARY_VERSION = 1 as const;
export const DEFAULT_STORAGE_KEY = 'bookmark-bookshelf:library';

export type Unsubscribe = () => void;

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: StoreError };

export interface StoreError {
  /** Stable machine code, for example `invalid-url`, `not-found`, `unsupported-version`, `quota`. */
  code: string;
  /** Plain sentence for people. */
  message: string;
  /** Input field the error belongs to, when there is one. */
  field?: string;
}

/**
 * How a volume looks. The store keeps these as opaque strings and a number so it
 * never depends on the shelf module; the shelf maps unknown names to its default.
 */
export interface CoverSpec {
  cloth: string;
  pattern: string;
  seed: number;
}

export interface Shelf {
  id: string;
  name: string;
  order: number;
}

/** Text the person saved to read in the app. The app never fetches it from the web. */
export interface ReadingCopy {
  format: 'markdown-lite';
  text: string;
  savedAt: string;
}

export interface Bookmark {
  id: string;
  /** Absolute http(s) URL. Stored, shown and linked. Never fetched. */
  url: string;
  title: string;
  author?: string;
  note?: string;
  tags: string[];
  shelfId: string;
  /** Position inside its shelf, ascending. */
  order: number;
  addedAt: string;
  updatedAt: string;
  cover: CoverSpec;
  reading?: ReadingCopy;
}

/**
 * Reading position. `block` and `ratio` survive reflow between screen sizes:
 * block is the index of the top visible block, ratio is how far through that block (0 to 1).
 * `percent` is the overall position (0 to 1), used for display only.
 */
export interface Progress {
  block: number;
  ratio: number;
  percent: number;
  updatedAt: string;
}

export interface Session {
  /** Active shelf filter. `null` means every shelf. */
  shelfId: string | null;
  /** Volume at the centre of the shelf. */
  focusId: string | null;
  /** Volume open in the reader, restored after a reload. */
  openId: string | null;
  view: 'shelf' | 'list';
  variant: string;
}

export interface LibraryV1 {
  format: typeof LIBRARY_FORMAT;
  version: typeof LIBRARY_VERSION;
  shelves: Shelf[];
  bookmarks: Bookmark[];
  progress: Record<string, Progress>;
  session: Session;
}

/** Minimal synchronous storage, satisfied by `window.localStorage`. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BookmarkInput {
  url: string;
  title?: string;
  author?: string;
  note?: string;
  tags?: string[];
  shelfId?: string;
  cover?: Partial<CoverSpec>;
  readingText?: string;
}

export interface BookmarkPatch {
  url?: string;
  title?: string;
  author?: string;
  note?: string;
  tags?: string[];
  shelfId?: string;
  cover?: Partial<CoverSpec>;
  /** Empty string removes the reading copy. */
  readingText?: string;
}

export type ChangeReason = 'bookmarks' | 'shelves' | 'progress' | 'session' | 'replace' | 'external';

export interface StoreEvent {
  type: 'change';
  reason: ChangeReason;
}

export interface StoreOptions {
  /** Defaults to `localStorage` when it works, otherwise an in-memory store. */
  storage?: KeyValueStorage;
  key?: string;
  /** Library used when nothing is stored yet. Defaults to one empty shelf. */
  seed?: () => LibraryV1;
  now?: () => Date;
  idFactory?: () => string;
  /** Listen for changes from other tabs. Defaults to true when `window` exists. */
  syncTabs?: boolean;
  /** Delay for coalescing progress writes, in milliseconds. Defaults to 250. */
  progressDelay?: number;
}

export interface ImportSummary {
  added: number;
  updated: number;
  shelvesAdded: number;
}

export interface Store {
  /** `local` when writes reach durable storage, `memory` when they do not. */
  readonly persistence: 'local' | 'memory';
  /** Deep copy of the whole library. */
  snapshot(): LibraryV1;

  shelves(): Shelf[];
  /** Ordered volumes of one shelf, or of every shelf when `shelfId` is null or omitted. */
  bookmarks(shelfId?: string | null): Bookmark[];
  get(id: string): Bookmark | undefined;

  addBookmark(input: BookmarkInput): Result<Bookmark>;
  updateBookmark(id: string, patch: BookmarkPatch): Result<Bookmark>;
  /** Removes a volume and returns it with its progress so the caller can offer undo. */
  removeBookmark(id: string): { bookmark: Bookmark; progress?: Progress } | undefined;
  restoreBookmark(entry: { bookmark: Bookmark; progress?: Progress }): void;
  /** Moves a volume to another shelf and/or to an index inside the shelf. */
  moveBookmark(id: string, to: { shelfId?: string; index?: number }): Result<Bookmark>;

  addShelf(name: string): Result<Shelf>;
  renameShelf(id: string, name: string): Result<Shelf>;
  /** Removes a shelf. Its volumes move to `moveTo`, or to the first remaining shelf. */
  removeShelf(id: string, moveTo?: string): Result<void>;

  progress(id: string): Progress | undefined;
  setProgress(id: string, value: { block: number; ratio: number; percent: number }): void;
  clearProgress(id: string): void;

  session(): Session;
  setSession(patch: Partial<Session>): void;

  /** Pretty-printed JSON of the versioned library, safe to save as a file. */
  exportLibrary(): string;
  /** Accepts JSON text or a parsed value of any supported version. */
  importLibrary(input: unknown, mode: 'replace' | 'merge'): Result<ImportSummary>;

  subscribe(listener: (event: StoreEvent) => void): Unsubscribe;
  /** Writes pending progress immediately. Call on `pagehide`. */
  flush(): void;
  destroy(): void;
}

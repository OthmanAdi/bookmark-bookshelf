/**
 * Store contract. Pure data and persistence: no DOM, no rendering, no network.
 * Everything another module needs from the store is declared here.
 */

import type { FoldersImportOptions } from './bulk-import';
import type { ImportFolder } from './folders-to-library';
import type { LinkListEntry } from './link-list';
import type { ShelfFile } from './shelf-file';

export const LIBRARY_FORMAT = 'bookmark-bookshelf' as const;
export const LIBRARY_VERSION = 2 as const;
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
  /**
   * What the volume is bound in, for a renderer that draws materials. Lower-case letters, at most 16. The
   * store keeps any such name so a library from a newer version loses nothing; the renderer resolves names
   * it does not know. Absent, the renderer chooses.
   */
  binding?: string;
  /** How the title is put on the cover. The same shape and rules as `binding`. */
  stamp?: string;
}

/** Where a shelf came from when it arrived as a shelf file or link. */
export interface ShelfOrigin {
  shelfId: string;
  revision: number;
}

export interface Shelf {
  id: string;
  name: string;
  order: number;
  /** At most 500 characters. */
  description?: string;
  /** Language of the texts on the shelf: letters, digits and hyphens, at most 12 characters. */
  lang?: string;
  /** Who put the shelf together, at most 80 characters. */
  author?: string;
  /** Due date, `YYYY-MM-DD`. */
  due?: string;
  origin?: ShelfOrigin;
}

/** Text the person saved to read in the app. The app never fetches it from the web. */
export interface ReadingCopy {
  format: 'markdown-lite';
  text: string;
  savedAt: string;
}

/** Where a link came from when its shelf arrived as a shelf file or link. */
export interface BookmarkOrigin {
  shelfId: string;
  volumeId: string;
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
  /** Absent means required. Only `false` is stored. */
  required?: boolean;
  /** Reading time in minutes, 1 to 600. Overrides the estimate made from the text. */
  minutes?: number;
  origin?: BookmarkOrigin;
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

export const SORT_MODE_NAMES = [
  'manual',
  'added-new',
  'added-old',
  'title',
  'source',
  'unread-first',
  'shortest',
] as const;

export type SortMode = (typeof SORT_MODE_NAMES)[number];

/** How the shelf is drawn: `classic` is the CSS shelf, `studio` paints it with lit materials in WebGL. */
export const PAINT_NAMES = ['classic', 'studio'] as const;

export type PaintName = (typeof PAINT_NAMES)[number];

export interface Session {
  /** Active shelf filter. `null` means every shelf. */
  shelfId: string | null;
  /** Volume at the centre of the shelf. */
  focusId: string | null;
  /** Volume open in the reader, restored after a reload. */
  openId: string | null;
  view: 'shelf' | 'list' | 'showcase';
  variant: string;
  /** Reading text size step, 0 to 4. Absent means 1. */
  textScale?: number;
  /** How the list and the shelf are ordered. Absent means `manual`. */
  sort?: SortMode;
  /** How the shelf is drawn. Absent means `classic`; a browser that cannot draw Studio keeps `classic` too. */
  paint?: PaintName;
}

/** The shape of a library saved before version 2. It is read and upgraded, never written. */
export interface LibraryV1 {
  format: typeof LIBRARY_FORMAT;
  version: 1;
  shelves: Shelf[];
  bookmarks: Bookmark[];
  progress: Record<string, Progress>;
  session: Session;
}

/**
 * Everything personal lives in the maps next to `progress`, keyed by volume id, so a shelf can be handed
 * to someone without taking any of it.
 */
export interface LibraryV2 {
  format: typeof LIBRARY_FORMAT;
  version: typeof LIBRARY_VERSION;
  shelves: Shelf[];
  bookmarks: Bookmark[];
  progress: Record<string, Progress>;
  /** When each volume was marked read, as an ISO time. */
  done: Record<string, string>;
  /** Private notes, at most 2,000 characters each. */
  notes: Record<string, string>;
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
  /** `false` marks the link as optional. */
  required?: boolean;
  /** Whole minutes, 1 to 600. */
  minutes?: number;
}

export interface BookmarkPatch {
  url?: string;
  title?: string;
  author?: string;
  note?: string;
  tags?: string[];
  shelfId?: string;
  /** Fields left out keep their value. An empty `binding` or `stamp` removes it, so the renderer chooses again. */
  cover?: Partial<CoverSpec>;
  /** Empty string removes the reading copy. */
  readingText?: string;
  required?: boolean;
  /** Whole minutes, 1 to 600. `null` goes back to the estimate made from the text. */
  minutes?: number | null;
}

export type ChangeReason =
  | 'bookmarks'
  | 'shelves'
  | 'progress'
  | 'done'
  | 'notes'
  | 'session'
  | 'replace'
  | 'external';

/** Fields of a shelf that can be changed. An empty string removes an optional field. */
export interface ShelfPatch {
  name?: string;
  description?: string;
  lang?: string;
  author?: string;
  /** `YYYY-MM-DD`. */
  due?: string;
}

/** A removed link with everything personal that went with it, so the caller can offer undo. */
export interface RemovedBookmark {
  bookmark: Bookmark;
  progress?: Progress;
  /** When it was marked read. */
  done?: string;
  note?: string;
}

export interface StoreEvent {
  type: 'change';
  reason: ChangeReason;
}

/** What it takes to put a removed shelf and its links back where they were. */
export interface RemovedShelf {
  shelf: Shelf;
  /** The shelf its links were moved to. */
  moveTo: string;
  /** The links that were on the shelf, with their place on it. */
  links: Array<{ id: string; order: number }>;
  /** Whether the shelf was the one being shown. */
  wasActive: boolean;
}

/** What a received shelf became. */
export interface ImportedShelf {
  shelfId: string;
  /** The name it was given, which differs from the file's when that name was taken. */
  name: string;
  /** Links added to the new shelf. */
  added: number;
  /** Links in the file that could not be used. */
  skipped: SkippedLink[];
}

export interface StoreOptions {
  /** Defaults to `localStorage` when it works, otherwise an in-memory store. */
  storage?: KeyValueStorage;
  key?: string;
  /** Library used when nothing is stored yet. Defaults to one empty shelf. */
  seed?: () => LibraryV1 | LibraryV2;
  now?: () => Date;
  idFactory?: () => string;
  /** Listen for changes from other tabs. Defaults to true when `window` exists. */
  syncTabs?: boolean;
  /** Delay for coalescing progress writes, in milliseconds. Defaults to 250. */
  progressDelay?: number;
}

/** A link an import could not take, with the reason in plain words. */
export interface SkippedLink {
  title: string;
  url: string;
  reason: string;
}

export interface ImportSummary {
  /** Links that are new to the library. */
  added: number;
  /** Links whose address was already saved. They are left exactly as they were. */
  unchanged: number;
  shelvesAdded: number;
  /** Entries that could not be read. */
  skipped: SkippedLink[];
  /** An import never changes a link that is already saved, so this is always 0. */
  updated: number;
}

export interface Store {
  /**
   * `local` when writes reach durable storage, `memory` when they do not: storage is blocked, or the latest
   * write was refused. It goes back to `local` after a write succeeds.
   */
  readonly persistence: 'local' | 'memory';
  /**
   * True when the saved library was written by a newer version of the app. It can be read but not changed:
   * every change to links, shelves, done marks and notes answers `read-only`, and nothing is written. Reading
   * position and the session still work for this visit but are not saved.
   */
  readonly readOnly: boolean;
  /**
   * What this library takes of the browser's storage. `bytes` counts the library and session keys at two
   * bytes a character; `quotaHint` is what browsers usually allow a site, an estimate and not a promise.
   */
  usage(): { bytes: number; quotaHint: number };
  /** Why the latest write failed, or undefined when it worked. */
  lastError(): StoreError | undefined;
  /** Deep copy of the whole library. */
  snapshot(): LibraryV2;

  shelves(): Shelf[];
  /** Ordered volumes of one shelf, or of every shelf when `shelfId` is null or omitted. */
  bookmarks(shelfId?: string | null): Bookmark[];
  get(id: string): Bookmark | undefined;
  /**
   * The link already saved under the same address, if any. Spellings of one page count as the same: case of
   * the host, `www.`, a trailing slash, the fragment, tracking parameters and the order of the query do not
   * matter. `exceptId` leaves one link out, for checking the address of a link that is being edited.
   */
  findByUrl(url: string, exceptId?: string): Bookmark | undefined;

  addBookmark(input: BookmarkInput): Result<Bookmark>;
  updateBookmark(id: string, patch: BookmarkPatch): Result<Bookmark>;
  /** Removes a volume and returns it with its progress, done mark and note so the caller can offer undo. */
  removeBookmark(id: string): RemovedBookmark | undefined;
  restoreBookmark(entry: RemovedBookmark): void;
  /** Removes several links in one step. The result is what `restoreBookmarks` takes, in the order asked. */
  removeBookmarks(ids: string[]): RemovedBookmark[];
  /** Puts links back where they were on their shelves. A link whose id is back in use is left out. */
  restoreBookmarks(entries: RemovedBookmark[]): Result<void>;
  /** Moves a volume to another shelf and/or to an index inside the shelf. */
  moveBookmark(id: string, to: { shelfId?: string; index?: number }): Result<Bookmark>;

  addShelf(name: string): Result<Shelf>;
  renameShelf(id: string, name: string): Result<Shelf>;
  /** Changes the name, description, language, author or due date of a shelf in one step. */
  updateShelf(id: string, patch: ShelfPatch): Result<Shelf>;
  /**
   * Removes a shelf. Its links move to the end of `moveTo`, or of the first remaining shelf. The result is
   * what `restoreShelf` takes to undo it.
   */
  removeShelf(id: string, moveTo?: string): Result<RemovedShelf>;
  /** Puts a removed shelf back at its old place and its links back on it, in their old order. */
  restoreShelf(entry: RemovedShelf): Result<void>;

  progress(id: string): Progress | undefined;
  setProgress(id: string, value: { block: number; ratio: number; percent: number }): void;
  clearProgress(id: string): void;

  /** Whether the person marked this link read. */
  isDone(id: string): boolean;
  /** Marks a link read or not read. Marking a link that is already read keeps the first time. */
  setDone(id: string, done: boolean): Result<void>;
  /** The private note on a link, or an empty string. */
  note(id: string): string;
  /** Sets the private note, at most 2,000 characters. An empty text removes it. */
  setNote(id: string, text: string): Result<void>;

  session(): Session;
  setSession(patch: Partial<Session>): void;

  /** Pretty-printed JSON of the versioned library, safe to save as a file. */
  exportLibrary(): string;
  /**
   * The file for one shelf: its details and links in shelf order, with texts only when `includeTexts` is
   * true. Reading position, done marks and private notes are never part of it. Serialise it with
   * `JSON.stringify`; `shelfFileName` gives the file name.
   */
  exportShelf(id: string, options: { includeTexts: boolean }): Result<ShelfFile>;
  /**
   * Adds the shelf in a shelf file (text, parsed value, or what `readShelfFile` returned) as one new shelf with
   * a new id, named "Name (2)" when the name is taken. Every link gets a new id and keeps file order. Nothing
   * that is already saved is changed, and nothing personal comes with the file.
   */
  importShelf(file: unknown): Result<ImportedShelf>;
  /**
   * Adds the folders of a browser bookmarks file (see `parseNetscapeBookmarks`) as shelves and links, at most
   * 5,000 at once. A link whose address is already saved is counted as unchanged and not touched.
   */
  importFolders(folders: ImportFolder[], options?: FoldersImportOptions): Result<ImportSummary>;
  /** Adds the entries of a pasted list (see `parseLinkList`) to one shelf, in the order written. */
  importLinks(entries: LinkListEntry[], shelfId: string): Result<ImportSummary>;
  /** Accepts JSON text or a parsed value of any supported version. */
  importLibrary(input: unknown, mode: 'replace' | 'merge'): Result<ImportSummary>;

  subscribe(listener: (event: StoreEvent) => void): Unsubscribe;
  /** Writes pending progress immediately. Call on `pagehide`. */
  flush(): void;
  destroy(): void;
}

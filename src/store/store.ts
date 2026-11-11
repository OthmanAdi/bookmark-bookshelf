import type {
  BookmarkInput,
  BookmarkPatch,
  ChangeReason,
  LibraryV2,
  Progress,
  Result,
  Session,
  Shelf,
  Store,
  StoreError,
  StoreEvent,
  StoreOptions,
} from './types';
import { DEFAULT_STORAGE_KEY } from './types';
import type { OpContext } from './bookmark-ops';
import {
  addBookmarkTo,
  findBookmark,
  moveBookmarkIn,
  removeBookmarkFrom,
  restoreBookmarkTo,
  updateBookmarkIn,
} from './bookmark-ops';
import { defaultIdFactory, ownValue } from './ids';
import { mergeLibrary } from './merge';
import { migrateLibraryWithReport } from './migrate';
import { orderedBookmarks } from './ordering';
import { setDoneIn, setNoteIn } from './personal-ops';
import type { LoadedLibrary } from './persistence';
import { loadLibrary, saveLibrary, saveSession, storedBytes } from './persistence';
import { normalizeProgress } from './progress';
import { clone, cloneResult, ok } from './result';
import { readSession } from './sanitize';
import { applySessionPatch } from './session-ops';
import { addShelfTo, removeShelfFrom, renameShelfIn, updateShelfIn } from './shelf-ops';
import { resolveStorage } from './storage';
import { normalizeUrl, urlKey } from './url';

type Listener = (event: StoreEvent) => void;

/** Browsers keep about five million characters per site, two bytes each. */
const QUOTA_HINT = 10 * 1024 * 1024;

export function createStore(options: StoreOptions = {}): Store {
  const key = options.key ?? DEFAULT_STORAGE_KEY;
  const clock = options.now ?? (() => new Date());
  const ctx: OpContext = { now: () => clock().toISOString(), newId: options.idFactory ?? defaultIdFactory };
  const { storage, persistence: chosenPersistence } = resolveStorage(options.storage, key);
  const progressDelay = options.progressDelay ?? 250;
  const listeners = new Set<Listener>();
  const load = (): LoadedLibrary =>
    loadLibrary({ storage, key, now: clock, idFactory: ctx.newId, ...(options.seed ? { seed: options.seed } : {}) });

  const loaded = load();
  let lib = loaded.library;
  // A library written by a newer version is shown but never written back.
  let readOnly = loaded.readOnly;
  // The session text on disk. Undefined until it has been written once, which also moves a library that was
  // saved in a single key to the two-key layout on its first write.
  let savedSession = loaded.sessionText;
  // The outcome of the latest write, for methods that return nothing and for `persistence`.
  let lastWriteError: StoreError | undefined;
  let progressTimer: ReturnType<typeof setTimeout> | undefined;

  function cancelProgressTimer(): void {
    if (progressTimer === undefined) return;
    clearTimeout(progressTimer);
    progressTimer = undefined;
  }

  /**
   * Writes what changed. The session goes to its own small key, and the library is only written when
   * `libraryChanged` says something in it did, so settling on another link costs a few bytes.
   */
  function save(libraryChanged = true): StoreError | undefined {
    // A reading position still waiting for its delayed write goes out with this one.
    const writeLibrary = libraryChanged || progressTimer !== undefined;
    cancelProgressTimer();
    if (readOnly) return undefined;
    let error: StoreError | undefined;
    if (JSON.stringify(lib.session) !== savedSession) {
      const written = saveSession(storage, key, lib.session);
      if ('error' in written) error = written.error;
      else savedSession = written.text;
    }
    if (!error && writeLibrary) error = saveLibrary(storage, key, lib);
    lastWriteError = error;
    return error;
  }

  function readOnlyFailure(): { ok: false; error: StoreError } {
    return {
      ok: false,
      error: {
        code: 'read-only',
        message: 'This library was saved by a newer version of the app, so it can be read here but not changed. Update the app to edit it.',
      },
    };
  }

  function notify(reason: ChangeReason): void {
    for (const listener of [...listeners]) {
      try {
        listener({ type: 'change', reason });
      } catch (error) {
        console.error('Bookmark Bookshelf store listener failed', error);
      }
    }
  }

  /**
   * Runs a change; when `changed` says it took effect, writes synchronously and notifies.
   * A write that storage refuses puts the library back as it was and announces nothing, so what the person
   * sees is what is saved and trying again cannot add the same thing twice. Changes to the session alone
   * (which look, which link is in the centre) are not worth refusing: they stay and the error is reported.
   */
  function commit<T>(
    reasons: ChangeReason[],
    run: () => T,
    changed: (value: T) => boolean,
  ): { value: T; error: StoreError | undefined } {
    const before = clone(lib);
    const sessionBefore = JSON.stringify(lib.session);
    const value = run();
    if (!changed(value)) return { value, error: undefined };
    const error = save(reasons.some((reason) => reason !== 'session'));
    if (error && !reasons.every((reason) => reason === 'session')) {
      lib = before;
      return { value, error };
    }
    const sessionMoved = !reasons.includes('replace') && JSON.stringify(lib.session) !== sessionBefore;
    for (const reason of new Set(sessionMoved ? [...reasons, 'session' as const] : reasons)) notify(reason);
    return { value, error };
  }

  function mutate<T>(reasons: ChangeReason[], run: () => Result<T>): Result<T> {
    if (readOnly) return readOnlyFailure();
    const { value, error } = commit(reasons, run, (result) => result.ok);
    if (!value.ok) return value;
    return error ? { ok: false, error } : cloneResult(value);
  }

  /** For changes that may turn out to be none: nothing is written or announced unless the value says so. */
  function mutateFlag(reasons: ChangeReason[], run: () => Result<boolean>): Result<void> {
    if (readOnly) return readOnlyFailure();
    const { value, error } = commit(reasons, run, (result) => result.ok && result.value);
    if (!value.ok) return value;
    return error ? { ok: false, error } : ok(undefined);
  }

  function scheduleProgressWrite(): void {
    if (progressTimer !== undefined) return;
    progressTimer = setTimeout(() => {
      progressTimer = undefined;
      save();
    }, progressDelay);
  }

  function flush(): void {
    if (progressTimer !== undefined) save();
  }

  /** What other tabs can change that this tab shows. Reading position and the session are not part of it. */
  function shownContent(library: LibraryV2): string {
    return JSON.stringify([library.shelves, library.bookmarks, library.done, library.notes]);
  }

  /**
   * Takes over what another tab saved. This tab keeps its own session and any reading position it has not
   * written yet, and only announces `external` when the links, shelves, done marks or notes differ, so a tab
   * that merely moved its focus cannot disturb what someone is typing here.
   */
  function reloadFromStorage(): void {
    const next = load();
    const differs = shownContent(next.library) !== shownContent(lib);
    const own = lib;
    lib = next.library;
    readOnly = next.readOnly;
    if (progressTimer !== undefined) {
      for (const [id, position] of Object.entries(own.progress)) {
        const theirs = ownValue(lib.progress, id);
        if (lib.bookmarks.some((link) => link.id === id) && (!theirs || theirs.updatedAt < position.updatedAt)) {
          lib.progress[id] = position;
        }
      }
    }
    const known = (items: Array<{ id: string }>): Map<string, string> => new Map(items.map((item) => [item.id, item.id]));
    lib.session = readSession(own.session, known(lib.shelves), known(lib.bookmarks));
    if (differs) notify('external');
  }

  const onStorageEvent = (event: StorageEvent): void => {
    if (event.key === null || event.key === key) reloadFromStorage();
  };
  const listenToTabs = (options.syncTabs ?? true) && typeof window !== 'undefined';
  if (listenToTabs) window.addEventListener('storage', onStorageEvent);

  return {
    get persistence() {
      return chosenPersistence === 'local' && lastWriteError === undefined ? 'local' : 'memory';
    },
    get readOnly() {
      return readOnly;
    },
    lastError: () => (lastWriteError ? { ...lastWriteError } : undefined),
    usage: () => ({ bytes: storedBytes(storage, key), quotaHint: QUOTA_HINT }),
    snapshot: () => clone(lib),
    shelves: () => clone([...lib.shelves].sort((a, b) => a.order - b.order)),
    bookmarks: (shelfId) => clone(orderedBookmarks(lib, shelfId)),
    findByUrl: (url, exceptId) => {
      const address = normalizeUrl(url);
      if (!address.ok) return undefined;
      const wanted = urlKey(address.value);
      const found = lib.bookmarks.find((link) => link.id !== exceptId && urlKey(link.url) === wanted);
      return found ? clone(found) : undefined;
    },
    get: (id) => {
      const found = findBookmark(lib, id);
      return found ? clone(found) : undefined;
    },

    addBookmark: (input: BookmarkInput) => mutate(['bookmarks'], () => addBookmarkTo(lib, ctx, input)),
    updateBookmark: (id: string, patch: BookmarkPatch) =>
      mutate(['bookmarks'], () => updateBookmarkIn(lib, ctx, id, patch)),
    removeBookmark: (id) => {
      if (readOnly) return undefined;
      const { value, error } = commit(['bookmarks'], () => removeBookmarkFrom(lib, id), (entry) => entry !== undefined);
      return value && !error ? clone(value) : undefined;
    },
    restoreBookmark: (entry) => {
      if (readOnly) return;
      commit(['bookmarks'], () => restoreBookmarkTo(lib, entry), Boolean);
    },
    moveBookmark: (id, to) => mutate(['bookmarks'], () => moveBookmarkIn(lib, ctx, id, to)),

    addShelf: (name): Result<Shelf> => mutate(['shelves'], () => addShelfTo(lib, ctx, name)),
    renameShelf: (id, name): Result<Shelf> => mutate(['shelves'], () => renameShelfIn(lib, id, name)),
    updateShelf: (id, patch): Result<Shelf> => mutate(['shelves'], () => updateShelfIn(lib, id, patch)),
    removeShelf: (id, moveTo) => mutate(['shelves', 'bookmarks'], () => removeShelfFrom(lib, id, moveTo)),

    progress: (id): Progress | undefined => {
      const found = ownValue(lib.progress, id);
      return found ? clone(found) : undefined;
    },
    setProgress: (id, value) => {
      if (!findBookmark(lib, id)) return;
      lib.progress[id] = normalizeProgress(value, ctx.now());
      notify('progress');
      scheduleProgressWrite();
    },
    clearProgress: (id) => {
      commit(
        ['progress'],
        () => {
          const existed = Object.hasOwn(lib.progress, id);
          delete lib.progress[id];
          return existed;
        },
        Boolean,
      );
    },

    isDone: (id) => Object.hasOwn(lib.done, id),
    setDone: (id, done) => mutateFlag(['done'], () => setDoneIn(lib, ctx, id, done)),
    note: (id) => ownValue(lib.notes, id) ?? '',
    setNote: (id, text) => mutateFlag(['notes'], () => setNoteIn(lib, id, text)),

    session: (): Session => clone(lib.session),
    setSession: (patch) => {
      commit(['session'], () => applySessionPatch(lib, patch), Boolean);
    },

    exportLibrary: () => `${JSON.stringify(clone(lib), null, 2)}\n`,
    importLibrary: (input, mode) => {
      const parsed = migrateLibraryWithReport(input, { now: clock, idFactory: ctx.newId });
      if (!parsed.ok) return parsed;
      const { library: incoming, skipped } = parsed.value;
      return mutate(['replace'], () => {
        if (mode === 'replace') {
          lib = incoming;
          return ok({ added: lib.bookmarks.length, unchanged: 0, shelvesAdded: lib.shelves.length, skipped, updated: 0 });
        }
        return ok({ ...mergeLibrary(lib, incoming, ctx), skipped, updated: 0 });
      });
    },

    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    flush,
    destroy: () => {
      flush();
      if (listenToTabs) window.removeEventListener('storage', onStorageEvent);
      listeners.clear();
    },
  };
}

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
import { migrateLibrary } from './migrate';
import { orderedBookmarks } from './ordering';
import { setDoneIn, setNoteIn } from './personal-ops';
import { loadLibrary, saveLibrary } from './persistence';
import { normalizeProgress } from './progress';
import { clone, cloneResult, ok } from './result';
import { applySessionPatch } from './session-ops';
import { addShelfTo, removeShelfFrom, renameShelfIn, updateShelfIn } from './shelf-ops';
import { resolveStorage } from './storage';

type Listener = (event: StoreEvent) => void;

export function createStore(options: StoreOptions = {}): Store {
  const key = options.key ?? DEFAULT_STORAGE_KEY;
  const clock = options.now ?? (() => new Date());
  const ctx: OpContext = { now: () => clock().toISOString(), newId: options.idFactory ?? defaultIdFactory };
  const { storage, persistence } = resolveStorage(options.storage, key);
  const progressDelay = options.progressDelay ?? 250;
  const listeners = new Set<Listener>();
  const load = (): LibraryV2 =>
    loadLibrary({ storage, key, now: clock, idFactory: ctx.newId, ...(options.seed ? { seed: options.seed } : {}) });

  let lib = load();
  // Kept for methods that return nothing, so a failed write is not lost track of.
  let lastWriteError: StoreError | undefined;
  let progressTimer: ReturnType<typeof setTimeout> | undefined;

  function cancelProgressTimer(): void {
    if (progressTimer === undefined) return;
    clearTimeout(progressTimer);
    progressTimer = undefined;
  }

  function save(): StoreError | undefined {
    cancelProgressTimer();
    lastWriteError = saveLibrary(storage, key, lib);
    return lastWriteError;
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
   * Memory keeps the change even if the write fails.
   */
  function commit<T>(
    reasons: ChangeReason[],
    run: () => T,
    changed: (value: T) => boolean,
  ): { value: T; error: StoreError | undefined } {
    const sessionBefore = JSON.stringify(lib.session);
    const value = run();
    if (!changed(value)) return { value, error: undefined };
    const error = save();
    const sessionMoved = !reasons.includes('replace') && JSON.stringify(lib.session) !== sessionBefore;
    for (const reason of new Set(sessionMoved ? [...reasons, 'session' as const] : reasons)) notify(reason);
    return { value, error };
  }

  function mutate<T>(reasons: ChangeReason[], run: () => Result<T>): Result<T> {
    const { value, error } = commit(reasons, run, (result) => result.ok);
    if (!value.ok) return value;
    return error ? { ok: false, error } : cloneResult(value);
  }

  /** For changes that may turn out to be none: nothing is written or announced unless the value says so. */
  function mutateFlag(reasons: ChangeReason[], run: () => Result<boolean>): Result<void> {
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

  function reloadFromStorage(): void {
    cancelProgressTimer();
    lib = load();
    notify('external');
  }

  const onStorageEvent = (event: StorageEvent): void => {
    if (event.key === null || event.key === key) reloadFromStorage();
  };
  const listenToTabs = (options.syncTabs ?? true) && typeof window !== 'undefined';
  if (listenToTabs) window.addEventListener('storage', onStorageEvent);

  return {
    persistence,
    snapshot: () => clone(lib),
    shelves: () => clone([...lib.shelves].sort((a, b) => a.order - b.order)),
    bookmarks: (shelfId) => clone(orderedBookmarks(lib, shelfId)),
    get: (id) => {
      const found = findBookmark(lib, id);
      return found ? clone(found) : undefined;
    },

    addBookmark: (input: BookmarkInput) => mutate(['bookmarks'], () => addBookmarkTo(lib, ctx, input)),
    updateBookmark: (id: string, patch: BookmarkPatch) =>
      mutate(['bookmarks'], () => updateBookmarkIn(lib, ctx, id, patch)),
    removeBookmark: (id) => {
      const { value } = commit(['bookmarks'], () => removeBookmarkFrom(lib, id), (entry) => entry !== undefined);
      return value ? clone(value) : undefined;
    },
    restoreBookmark: (entry) => {
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
      const parsed = migrateLibrary(input, { now: clock, idFactory: ctx.newId });
      if (!parsed.ok) return parsed;
      return mutate(['replace'], () => {
        if (mode === 'replace') {
          lib = parsed.value;
          return ok({ added: lib.bookmarks.length, updated: 0, shelvesAdded: lib.shelves.length });
        }
        return ok(mergeLibrary(lib, parsed.value, ctx));
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

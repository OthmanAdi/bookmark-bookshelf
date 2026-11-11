import type { KeyValueStorage, LibraryV1, LibraryV2, Session, StoreError } from './types';
import { hashText } from './cover';
import { emptyLibrary } from './library';
import { migrateLibrary } from './migrate';
import { readSession } from './sanitize';

/** The session has a small key of its own, so moving to another link does not rewrite the whole library. */
export function sessionKeyOf(key: string): string {
  return `${key}:session`;
}

export interface LoadParams {
  storage: KeyValueStorage;
  key: string;
  seed?: () => LibraryV1 | LibraryV2;
  now: () => Date;
  idFactory: () => string;
}

export interface LoadedLibrary {
  library: LibraryV2;
  /** The text found under the session key, when there was one. A library saved in a single key has none. */
  sessionText: string | undefined;
  /**
   * True when the stored library was written by a newer version of the app. It is shown as far as it can be
   * understood and never written back, so opening it here cannot damage it.
   */
  readOnly: boolean;
}

function readRaw(storage: KeyValueStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Keeps text the app cannot read, so starting from the seed never destroys it. The copy is named after its
 * content, so loading the same text again does not make another one.
 */
function backUpRaw(params: LoadParams, raw: string): void {
  if (raw.trim() === '') return;
  const name = `${params.key}:backup-${hashText(raw).toString(36)}-${raw.length.toString(36)}`;
  try {
    if (params.storage.getItem(name) !== null) return;
    params.storage.setItem(name, raw);
  } catch {
    // Storage is full or blocked: nothing more can be done for the copy.
  }
}

function seedLibrary(params: LoadParams): LibraryV2 {
  const seeded = params.seed?.();
  if (seeded) {
    const migrated = migrateLibrary(seeded, params);
    if (migrated.ok) return migrated.value;
  }
  return emptyLibrary(params.now());
}

/**
 * The session key wins over the session a library carries inside itself, which is how libraries were saved
 * before the session had a key. Ids the library does not have are dropped.
 */
function applyStoredSession(params: LoadParams, library: LibraryV2): string | undefined {
  const text = readRaw(params.storage, sessionKeyOf(params.key));
  if (text === null) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
  const known = (items: Array<{ id: string }>): Map<string, string> => new Map(items.map((item) => [item.id, item.id]));
  library.session = readSession(value, known(library.shelves), known(library.bookmarks));
  return text;
}

function readLibrary(params: LoadParams): { library: LibraryV2; readOnly: boolean } {
  const raw = readRaw(params.storage, params.key);
  if (raw === null) return { library: seedLibrary(params), readOnly: false };
  const migrated = migrateLibrary(raw, params);
  if (migrated.ok) return { library: migrated.value, readOnly: false };
  if (migrated.error.code === 'unsupported-version') {
    const newer = migrateLibrary(raw, { ...params, acceptNewer: true });
    return { library: newer.ok ? newer.value : seedLibrary(params), readOnly: true };
  }
  backUpRaw(params, raw);
  return { library: seedLibrary(params), readOnly: false };
}

export function loadLibrary(params: LoadParams): LoadedLibrary {
  const { library, readOnly } = readLibrary(params);
  return { library, readOnly, sessionText: applyStoredSession(params, library) };
}

const QUOTA_ERROR: StoreError = {
  code: 'quota',
  message: 'The browser would not save your library, so this change was not made. Export a copy to keep your links.',
};

/** The library as it is stored: everything except the session, which has its own key. */
export function libraryDocument(library: LibraryV2): Omit<LibraryV2, 'session'> {
  const { session: _session, ...document } = library;
  return document;
}

/** Writes the library. A refusal from storage becomes a `quota` error instead of an exception. */
export function saveLibrary(storage: KeyValueStorage, key: string, library: LibraryV2): StoreError | undefined {
  try {
    storage.setItem(key, JSON.stringify(libraryDocument(library)));
    return undefined;
  } catch {
    return { ...QUOTA_ERROR };
  }
}

/** Writes the session and returns the text that was stored, or the error. */
export function saveSession(
  storage: KeyValueStorage,
  key: string,
  session: Session,
): { text: string } | { error: StoreError } {
  const text = JSON.stringify(session);
  try {
    storage.setItem(sessionKeyOf(key), text);
    return { text };
  } catch {
    return { error: { ...QUOTA_ERROR } };
  }
}

/** Characters held by the library and session keys, counted as two bytes each as browsers store them. */
export function storedBytes(storage: KeyValueStorage, key: string): number {
  let characters = 0;
  for (const name of [key, sessionKeyOf(key)]) {
    try {
      characters += storage.getItem(name)?.length ?? 0;
    } catch {
      // A key that cannot be read counts as empty.
    }
  }
  return characters * 2;
}

import type { KeyValueStorage, LibraryV1, LibraryV2, StoreError } from './types';
import { hashText } from './cover';
import { emptyLibrary } from './library';
import { migrateLibrary } from './migrate';

export interface LoadParams {
  storage: KeyValueStorage;
  key: string;
  seed?: () => LibraryV1 | LibraryV2;
  now: () => Date;
  idFactory: () => string;
}

export interface LoadedLibrary {
  library: LibraryV2;
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

export function loadLibrary(params: LoadParams): LoadedLibrary {
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

/** Writes the library. A refusal from storage becomes a `quota` error instead of an exception. */
export function saveLibrary(storage: KeyValueStorage, key: string, library: LibraryV2): StoreError | undefined {
  try {
    storage.setItem(key, JSON.stringify(library));
    return undefined;
  } catch {
    return {
      code: 'quota',
      message: 'The browser would not save your library, so this change was not made. Export a copy to keep your links.',
    };
  }
}

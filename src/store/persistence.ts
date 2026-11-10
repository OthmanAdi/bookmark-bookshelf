import type { KeyValueStorage, LibraryV1, StoreError } from './types';
import { emptyLibrary } from './library';
import { migrateLibrary } from './migrate';

export interface LoadParams {
  storage: KeyValueStorage;
  key: string;
  seed?: () => LibraryV1;
  now: () => Date;
  idFactory: () => string;
}

function readRaw(storage: KeyValueStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Keeps text the app cannot read, so starting from the seed never destroys it. */
function backUpRaw(params: LoadParams, raw: string): void {
  if (raw.trim() === '') return;
  try {
    params.storage.setItem(`${params.key}:backup-${params.now().getTime()}`, raw);
  } catch {
    // Storage is full or blocked: nothing more can be done for the copy.
  }
}

function seedLibrary(params: LoadParams): LibraryV1 {
  const seeded = params.seed?.();
  if (seeded) {
    const migrated = migrateLibrary(seeded, params);
    if (migrated.ok) return migrated.value;
  }
  return emptyLibrary(params.now());
}

export function loadLibrary(params: LoadParams): LibraryV1 {
  const raw = readRaw(params.storage, params.key);
  if (raw === null) return seedLibrary(params);
  const migrated = migrateLibrary(raw, params);
  if (migrated.ok) return migrated.value;
  backUpRaw(params, raw);
  return seedLibrary(params);
}

/** Writes the library. A refusal from storage becomes a `quota` error instead of an exception. */
export function saveLibrary(storage: KeyValueStorage, key: string, library: LibraryV1): StoreError | undefined {
  try {
    storage.setItem(key, JSON.stringify(library));
    return undefined;
  } catch {
    return { code: 'quota', message: 'The browser would not save your library. Changes are kept until you close the page.' };
  }
}

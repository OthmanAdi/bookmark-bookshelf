import type { KeyValueStorage } from './types';

export function createMemoryStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const values = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, String(value));
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

export interface ResolvedStorage {
  storage: KeyValueStorage;
  persistence: 'local' | 'memory';
}

function probeLocalStorage(key: string): KeyValueStorage | undefined {
  try {
    const candidate = globalThis.localStorage;
    if (!candidate) return undefined;
    const probeKey = `${key}:probe`;
    candidate.setItem(probeKey, '1');
    candidate.removeItem(probeKey);
    return candidate;
  } catch {
    // Access itself can throw (blocked site data) as well as the write.
    return undefined;
  }
}

/**
 * An explicit storage is trusted as is: probing it would hide quota failures
 * the caller wants to see. The default is `localStorage` after a probe write.
 */
export function resolveStorage(explicit: KeyValueStorage | undefined, key: string): ResolvedStorage {
  if (explicit) return { storage: explicit, persistence: 'local' };
  const local = probeLocalStorage(key);
  if (local) return { storage: local, persistence: 'local' };
  return { storage: createMemoryStorage(), persistence: 'memory' };
}

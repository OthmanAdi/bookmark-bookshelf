/** Random UUID when the platform has one, otherwise time plus randomness. */
export function defaultIdFactory(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return `${time}-${random}`;
}

/** What a stored id may look like. `__proto__` fits the pattern and is refused separately. */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value !== '__proto__' && ID_PATTERN.test(value);
}

/**
 * Own-property lookup for records keyed by an id. Ids such as `constructor` or `toString` exist on every
 * plain object, so a bare `record[id]` would answer with an inherited function.
 */
export function ownValue<T>(record: Readonly<Record<string, T>>, id: string): T | undefined {
  return Object.hasOwn(record, id) ? record[id] : undefined;
}

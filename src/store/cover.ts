import type { CoverSpec } from './types';

const CLOTHS = ['ink', 'bone', 'rust', 'moss', 'plum', 'ochre', 'slate', 'teal'] as const;
const PATTERNS = ['arcs', 'bars', 'dots', 'rays', 'tiles', 'waves'] as const;

const MAX_NAME = 24;
export const MAX_SEED = 2147483647;

/** FNV-1a, 32 bit, over UTF-16 code units. Unsigned result. */
export function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function pick(list: readonly string[], index: number): string {
  return list[index % list.length] ?? list[0] ?? '';
}

/** Lower-case letters, digits and hyphens, at most 24 of them. Anything else is removed; empty gives undefined. */
export function coverName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const name = value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, MAX_NAME);
  return name === '' ? undefined : name;
}

/** A whole number from 0 to 2,147,483,647. Larger values wrap round so covers stay varied. */
export function coverSeed(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.abs(Math.trunc(value)) % (MAX_SEED + 1);
}

export function defaultCover(seedText: string): CoverSpec {
  const hash = hashText(seedText);
  return {
    cloth: pick(CLOTHS, hash),
    pattern: pick(PATTERNS, Math.floor(hash / CLOTHS.length)),
    seed: hash % (MAX_SEED + 1),
  };
}

/** Applies the usable fields of a partial cover on top of a base cover, keeping every field in range. */
export function mergeCover(base: CoverSpec, partial: Partial<CoverSpec> | undefined): CoverSpec {
  if (!partial) return { ...base };
  return {
    cloth: coverName(partial.cloth) ?? base.cloth,
    pattern: coverName(partial.pattern) ?? base.pattern,
    seed: coverSeed(partial.seed) ?? base.seed,
  };
}

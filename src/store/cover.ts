import type { CoverSpec } from './types';

const CLOTHS = ['ink', 'bone', 'rust', 'moss', 'plum', 'ochre', 'slate', 'teal'] as const;
const PATTERNS = ['arcs', 'bars', 'dots', 'rays', 'tiles', 'waves'] as const;

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

export function defaultCover(seedText: string): CoverSpec {
  const seed = hashText(seedText);
  return {
    cloth: pick(CLOTHS, seed),
    pattern: pick(PATTERNS, Math.floor(seed / CLOTHS.length)),
    seed,
  };
}

/** Applies the usable fields of a partial cover on top of a base cover. */
export function mergeCover(base: CoverSpec, partial: Partial<CoverSpec> | undefined): CoverSpec {
  if (!partial) return { ...base };
  const cloth = typeof partial.cloth === 'string' && partial.cloth !== '' ? partial.cloth : base.cloth;
  const pattern = typeof partial.pattern === 'string' && partial.pattern !== '' ? partial.pattern : base.pattern;
  const seed = typeof partial.seed === 'number' && Number.isFinite(partial.seed) ? Math.trunc(partial.seed) : base.seed;
  return { cloth, pattern, seed };
}

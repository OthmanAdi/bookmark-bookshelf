/**
 * Finding a volume again. A pure function over volumes: text is lower-cased and stripped of accents, and
 * every term of the query has to match somewhere. Results are ranked by where the match is, not by how
 * often it occurs, so the list is easy to explain.
 */

export type SearchField = 'title' | 'tags' | 'author' | 'source' | 'note' | 'text';

export interface SearchableVolume {
  id: string;
  url: string;
  title: string;
  author?: string;
  note?: string;
  tags?: readonly string[];
  reading?: { text: string };
}

export interface SearchHit {
  id: string;
  score: number;
  field: SearchField;
}

export interface SearchOptions {
  /** Also look in the reading text. Off by default because it is the slowest part. */
  includeText?: boolean;
  limit?: number;
}

/** Lower case, accents removed (`Über` becomes `uber`), `ß` written as `ss`. */
export function foldText(value: string): string {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '');
}

/** Best place first: the title starting with the term, then the title, tags, author, host, note and text. */
const RANK = { titleStart: 6, title: 5, tags: 4, author: 3, source: 2, note: 1, text: 0 } as const;

const PHRASE_START = 100000;
const PHRASE_ANYWHERE = 50000;

function hostOf(url: string): string {
  try {
    return foldText(new URL(url).hostname.replace(/^www\./i, ''));
  } catch {
    return '';
  }
}

function squash(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Volumes that match every term of `query`, best first. Equal scores keep the order they came in. */
export function searchVolumes(volumes: readonly SearchableVolume[], query: string, options: SearchOptions = {}): SearchHit[] {
  const phrase = squash(foldText(typeof query === 'string' ? query : ''));
  if (phrase === '') return [];
  const terms = phrase.split(' ');
  const includeText = options.includeText === true;

  const hits: Array<SearchHit & { index: number }> = [];
  volumes.forEach((volume, index) => {
    const title = squash(foldText(volume.title ?? ''));
    const tags = foldText((volume.tags ?? []).join(' '));
    const author = foldText(volume.author ?? '');
    const source = hostOf(volume.url ?? '');
    const note = foldText(volume.note ?? '');
    let text: string | undefined;

    let weakest = Number.POSITIVE_INFINITY;
    let total = 0;
    let best = -1;
    let bestField: SearchField = 'title';
    for (const term of terms) {
      let rank = -1;
      let field: SearchField = 'title';
      if (title.startsWith(term)) rank = RANK.titleStart;
      else if (title.includes(term)) rank = RANK.title;
      else if (tags.includes(term)) [rank, field] = [RANK.tags, 'tags'];
      else if (author.includes(term)) [rank, field] = [RANK.author, 'author'];
      else if (source.includes(term)) [rank, field] = [RANK.source, 'source'];
      else if (note.includes(term)) [rank, field] = [RANK.note, 'note'];
      else if (includeText) {
        text ??= foldText(volume.reading?.text ?? '');
        if (text.includes(term)) [rank, field] = [RANK.text, 'text'];
      }
      if (rank < 0) return;
      weakest = Math.min(weakest, rank);
      total += rank;
      if (rank > best) [best, bestField] = [rank, field];
    }

    let score = weakest * 100 + total;
    if (title.startsWith(phrase)) score += PHRASE_START;
    else if (title.includes(phrase)) score += PHRASE_ANYWHERE;
    hits.push({ id: volume.id, score, field: bestField, index });
  });

  hits.sort((a, b) => b.score - a.score || a.index - b.index);
  const limit = options.limit;
  const kept = typeof limit === 'number' && limit >= 0 ? hits.slice(0, Math.floor(limit)) : hits;
  return kept.map(({ id, score, field }) => ({ id, score, field }));
}

import type { Bookmark, Store } from '../store';

/**
 * What a link says about itself in words, in one place so the shelf, the list and the homepage use the
 * same strings: the name of the main action, and the state a person would read aloud.
 */
export interface LinkState {
  /** `Read`, `Resume at 34%`, `Read again` or `Add text`. */
  action: string;
  /** `Not started`, `34% read`, `Read` or `No text saved yet`. */
  state: string;
  /** Whole percent read, 0 to 100. */
  percent: number;
  done: boolean;
  hasText: boolean;
}

export function linkState(store: Pick<Store, 'progress' | 'isDone'>, bookmark: Pick<Bookmark, 'id' | 'reading'>): LinkState {
  const percent = Math.round((store.progress(bookmark.id)?.percent ?? 0) * 100);
  const done = store.isDone(bookmark.id);
  const hasText = Boolean(bookmark.reading);
  if (!hasText) return { action: 'Add text', state: 'No text saved yet', percent, done, hasText };
  if (done || percent >= 100) return { action: 'Read again', state: 'Read', percent, done, hasText };
  if (percent > 0) return { action: `Resume at ${percent}%`, state: `${percent}% read`, percent, done, hasText };
  return { action: 'Read', state: 'Not started', percent, done, hasText };
}

/** The site an address belongs to, without a leading `www.`. Empty when the address cannot be read. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

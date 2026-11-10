import type { ReaderLabels } from './types';

export const WORDS_PER_MINUTE = 220;

/** `progress` receives a whole percent from 0 to 100. */
export const defaultReaderLabels: ReaderLabels = {
  close: 'Close',
  openOriginal: 'Open original',
  editCopy: 'Edit reading copy',
  saveCopy: 'Save',
  cancel: 'Cancel',
  pasteLabel: 'Reading copy (plain text or markdown)',
  emptyTitle: 'No reading copy yet',
  emptyBody:
    'This app never fetches pages for you. Most sites block it, and doing it safely needs a server. ' +
    'Paste the text you want to read here, or open the original.',
  progress: (percent) => `${percent}% read`,
  minutes: (minutes) => `${minutes} min read`,
};

/** Merges overrides over the defaults, ignoring keys that are explicitly undefined. */
export function resolveLabels(overrides?: Partial<ReaderLabels>): ReaderLabels {
  const merged: ReaderLabels = { ...defaultReaderLabels };
  if (!overrides) return merged;
  for (const key of Object.keys(overrides) as (keyof ReaderLabels)[]) {
    const value = overrides[key];
    if (value !== undefined) Object.assign(merged, { [key]: value });
  }
  return merged;
}

/** Reading time in whole minutes, at least 1. */
export function estimateMinutes(text: string): number {
  const words = typeof text === 'string' ? text.split(/\s+/).filter(Boolean).length : 0;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/** Hostname without a leading `www.`, or an empty string when the URL is not parseable. */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export interface SavedDate {
  text: string;
  iso: string;
}

export function formatSavedDate(addedAt: string | undefined, locale?: string): SavedDate | null {
  if (!addedAt) return null;
  const date = new Date(addedAt);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const text = new Intl.DateTimeFormat(locale || undefined, { dateStyle: 'medium' }).format(date);
    return { text, iso: date.toISOString() };
  } catch {
    return null;
  }
}

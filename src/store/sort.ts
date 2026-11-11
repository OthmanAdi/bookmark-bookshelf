/** Ways to order the volumes of a shelf. Ordering never changes what is stored; `manual` is the stored order. */

import { minutesOf } from './reading-time';

export type SortMode = 'manual' | 'added-new' | 'added-old' | 'title' | 'source' | 'unread-first' | 'shortest';

export const SORT_MODES: ReadonlyArray<{ mode: SortMode; label: string }> = [
  { mode: 'manual', label: 'Shelf order' },
  { mode: 'added-new', label: 'Newest first' },
  { mode: 'added-old', label: 'Oldest first' },
  { mode: 'title', label: 'Title, A to Z' },
  { mode: 'source', label: 'Source, A to Z' },
  { mode: 'unread-first', label: 'Unread first' },
  { mode: 'shortest', label: 'Shortest first' },
];

export interface SortableVolume {
  id: string;
  url: string;
  title: string;
  addedAt: string;
  minutes?: number;
  reading?: { text: string };
}

export interface SortContext {
  /** Reading position from 0 to 1. */
  percentOf(id: string): number;
  isDone(id: string): boolean;
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

function timeOf(value: string): number {
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

/** 0 not started, 1 started, 2 done. */
function stage(id: string, context: SortContext): number {
  if (context.isDone(id)) return 2;
  return context.percentOf(id) > 0 ? 1 : 0;
}

/** A new, stably sorted array. Volumes that compare equal keep the order they came in. */
export function sortVolumes<T extends SortableVolume>(volumes: readonly T[], mode: SortMode, context: SortContext): T[] {
  const entries = volumes.map((volume, index) => ({ volume, index }));
  const byIndex = (a: { index: number }, b: { index: number }): number => a.index - b.index;

  switch (mode) {
    case 'added-new': {
      const times = new Map(entries.map((entry) => [entry.index, timeOf(entry.volume.addedAt)]));
      entries.sort((a, b) => (times.get(b.index) ?? 0) - (times.get(a.index) ?? 0) || byIndex(a, b));
      break;
    }
    case 'added-old': {
      const times = new Map(entries.map((entry) => [entry.index, timeOf(entry.volume.addedAt)]));
      entries.sort((a, b) => (times.get(a.index) ?? 0) - (times.get(b.index) ?? 0) || byIndex(a, b));
      break;
    }
    case 'title':
      entries.sort((a, b) => collator.compare(a.volume.title, b.volume.title) || byIndex(a, b));
      break;
    case 'source': {
      const hosts = new Map(entries.map((entry) => [entry.index, hostOf(entry.volume.url)]));
      entries.sort((a, b) => collator.compare(hosts.get(a.index) ?? '', hosts.get(b.index) ?? '') || byIndex(a, b));
      break;
    }
    case 'unread-first': {
      const stages = new Map(entries.map((entry) => [entry.index, stage(entry.volume.id, context)]));
      entries.sort((a, b) => (stages.get(a.index) ?? 0) - (stages.get(b.index) ?? 0) || byIndex(a, b));
      break;
    }
    case 'shortest': {
      const lengths = new Map(entries.map((entry) => [entry.index, minutesOf(entry.volume) ?? Number.POSITIVE_INFINITY]));
      entries.sort((a, b) => {
        const left = lengths.get(a.index) ?? Number.POSITIVE_INFINITY;
        const right = lengths.get(b.index) ?? Number.POSITIVE_INFINITY;
        if (left === right) return byIndex(a, b);
        return left < right ? -1 : 1;
      });
      break;
    }
    default:
      break;
  }
  return entries.map((entry) => entry.volume);
}

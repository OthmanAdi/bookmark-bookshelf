/** Reading status of a shelf: what is done, how long is left and what to read next. */

import { formatMinutes, minutesOf } from './reading-time';

export interface StatsVolume {
  id: string;
  title: string;
  /** Absent means required. */
  required?: boolean;
  minutes?: number;
  reading?: { text: string };
}

export interface StatsContext {
  /** Reading position from 0 to 1. */
  percentOf(id: string): number;
  isDone(id: string): boolean;
}

export interface ShelfStats {
  volumes: number;
  required: number;
  done: number;
  requiredDone: number;
  /** Total of the lengths that are known. Absent when none is known. */
  minutesTotal?: number;
  /** Known lengths of what is not done, less what has been read of it. Absent when none is known. */
  minutesLeft?: number;
  next?: { id: string; title: string; minutes?: number };
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** `next` is the first volume that is required and not done, otherwise the first that is not done. */
export function shelfStats(volumes: readonly StatsVolume[], context: StatsContext): ShelfStats {
  let required = 0;
  let done = 0;
  let requiredDone = 0;
  let total = 0;
  let totalKnown = false;
  let left = 0;
  let leftKnown = false;
  let nextRequired: StatsVolume | undefined;
  let nextAny: StatsVolume | undefined;

  for (const volume of volumes) {
    const isRequired = volume.required !== false;
    const isDone = context.isDone(volume.id);
    const minutes = minutesOf(volume);
    if (isRequired) required += 1;
    if (isDone) {
      done += 1;
      if (isRequired) requiredDone += 1;
    } else {
      nextAny ??= volume;
      if (isRequired) nextRequired ??= volume;
    }
    if (minutes !== undefined) {
      total += minutes;
      totalKnown = true;
      if (!isDone) {
        left += minutes * (1 - clamp01(context.percentOf(volume.id)));
        leftKnown = true;
      }
    }
  }

  const stats: ShelfStats = { volumes: volumes.length, required, done, requiredDone };
  if (totalKnown) stats.minutesTotal = total;
  if (leftKnown) stats.minutesLeft = Math.round(left);
  const next = nextRequired ?? nextAny;
  if (next) {
    const minutes = minutesOf(next);
    stats.next = minutes === undefined ? { id: next.id, title: next.title } : { id: next.id, title: next.title, minutes };
  }
  return stats;
}

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * One line for the top of a shelf, for example `2 of 6 read. About 35 min left. Next: Title`.
 * Lengths are left out when none is known.
 */
export function formatShelfStatus(stats: ShelfStats): string {
  if (stats.volumes === 0) return 'Nothing on this shelf yet.';
  if (stats.done >= stats.volumes) return stats.volumes === 1 ? 'Read.' : `All ${stats.volumes} read.`;

  const parts: string[] = [];
  if (stats.done === 0) {
    parts.push('Nothing read yet.');
    if (stats.minutesTotal !== undefined) parts.push(`${sentence(formatMinutes(Math.max(1, stats.minutesTotal)))} in all.`);
  } else {
    parts.push(`${stats.done} of ${stats.volumes} read.`);
    if (stats.minutesLeft !== undefined) parts.push(`${sentence(formatMinutes(Math.max(1, stats.minutesLeft)))} left.`);
  }
  if (stats.next) parts.push(`Next: ${stats.next.title}`);
  return parts.join(' ');
}

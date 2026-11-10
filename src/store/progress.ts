import type { Progress } from './types';

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizeProgress(
  value: { block: number; ratio: number; percent: number },
  updatedAt: string,
): Progress {
  const block = Number.isFinite(value.block) ? Math.max(0, Math.floor(value.block)) : 0;
  return { block, ratio: clampUnit(value.ratio), percent: clampUnit(value.percent), updatedAt };
}

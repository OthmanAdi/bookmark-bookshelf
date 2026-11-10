import type { Box } from './types';

export interface RevealFrame {
  /** True when nothing should be visible. */
  closed: boolean;
  /** True when the sheet is fully open and interactive. */
  open: boolean;
  windowTransform: string;
  sheetTransform: string;
  /** Opacity of the sheet content. */
  opacity: string;
}

const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);
const round = (value: number): number => Math.round(value * 1000) / 1000;
const usable = (box: Box | null | undefined): box is Box =>
  !!box && box.width > 0 && box.height > 0 && [box.x, box.y, box.width, box.height].every(Number.isFinite);

/**
 * Pure maths for the open transition. `progress` is already eased by the caller.
 * The window box grows from `from` to the viewport; the sheet gets the inverse transform
 * so the content keeps its place while the clip grows.
 */
export function revealFrame(
  progress: number,
  from: Box | null | undefined,
  viewport: { width: number; height: number },
): RevealFrame {
  const p = clamp01(progress);
  if (p <= 0) return { closed: true, open: false, windowTransform: '', sheetTransform: '', opacity: '' };
  if (p >= 1) return { closed: false, open: true, windowTransform: '', sheetTransform: '', opacity: '' };
  if (!usable(from) || viewport.width <= 0 || viewport.height <= 0) {
    return { closed: false, open: false, windowTransform: '', sheetTransform: '', opacity: String(round(p)) };
  }
  const x = from.x * (1 - p);
  const y = from.y * (1 - p);
  const scaleX = (from.width + (viewport.width - from.width) * p) / viewport.width;
  const scaleY = (from.height + (viewport.height - from.height) * p) / viewport.height;
  return {
    closed: false,
    open: false,
    windowTransform: `translate(${round(x)}px, ${round(y)}px) scale(${round(scaleX)}, ${round(scaleY)})`,
    sheetTransform: `translate(${round(-x / scaleX)}px, ${round(-y / scaleY)}px) scale(${round(1 / scaleX)}, ${round(1 / scaleY)})`,
    opacity: String(round(clamp01(p / 0.4))),
  };
}

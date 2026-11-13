import type { Paint } from '../studio/types';

/**
 * Whether this browser can draw the shelf in Studio, which needs WebGL2. The question is asked once, with a
 * canvas that never joins the page, and the answer is kept for the visit: the View menu asks every time
 * it opens, and a browser does not gain or lose WebGL2 while a page is open.
 *
 * Forced colours are asked about every time, because a person can turn them on while the page is open.
 * Studio paints its own colours over the page, which would undo what the system asked for.
 */

let known: boolean | undefined;

function probe(): boolean {
  try {
    if (typeof document === 'undefined') return false;
    const context = document.createElement('canvas').getContext('webgl2');
    if (!context) return false;
    // Hand the context back at once, so the probe does not hold one of the few a page may have.
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export const FORCED_COLORS_QUERY = '(forced-colors: active)';

/** True while the system draws the page in its own few colours. */
export function forcedColors(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(FORCED_COLORS_QUERY).matches;
  } catch {
    return false;
  }
}

export function canUseStudio(): boolean {
  if (forcedColors()) return false;
  known ??= probe();
  return known;
}

/** The ways to draw the shelf, as the View menu offers them. */
export const PAINT_CHOICES = [
  { name: 'classic', label: 'Classic', summary: 'CSS 3D, light and fast.' },
  { name: 'studio', label: 'Studio', summary: 'Lit materials, drawn with WebGL.' },
] as const;

/** What the Studio item says instead of its summary in a browser without WebGL2. */
export const STUDIO_UNAVAILABLE = 'Needs WebGL2, which this browser does not offer.';
/** And while the system has forced colours on. */
export const STUDIO_FORCED_COLORS = 'Not drawn in forced colours.';
/** And while Studio is loading and has not drawn the shelf yet. */
export const STUDIO_PREPARING = 'Preparing…';

/** Why Studio cannot be used right now, in a few words, or undefined when it can. */
export function studioUnavailable(): string | undefined {
  if (forcedColors()) return STUDIO_FORCED_COLORS;
  return canUseStudio() ? undefined : STUDIO_UNAVAILABLE;
}

/**
 * How the shelf is drawn right now, and the way to ask for another drawing. The app shell fills this in
 * once the bookshelf exists, so a dialog can read the drawing and offer Studio without knowing the shell.
 */
export interface PaintControl {
  current(): Paint;
  /** Asks for a drawing exactly as the View menu does: it is drawn, and remembered for the next visit. */
  choose(paint: Paint): void;
}

let control: PaintControl | undefined;

export function setPaintControl(next: PaintControl | undefined): void {
  control = next;
}

export function paintControl(): PaintControl | undefined {
  return control;
}

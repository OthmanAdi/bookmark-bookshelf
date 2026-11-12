/**
 * Whether this browser can draw the shelf in Studio, which needs WebGL2. The question is asked once, with a
 * canvas that never joins the page, and the answer is kept for the visit: the View menu asks every time
 * it opens, and a browser does not gain or lose WebGL2 while a page is open.
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

export function canUseStudio(): boolean {
  known ??= probe();
  return known;
}

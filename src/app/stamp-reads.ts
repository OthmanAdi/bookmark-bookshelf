/**
 * Whether a title stamp can be read on a cover, asked before the link is saved. The editor still lets a
 * person choose any stamp; it only says when a choice will be hard to read on a spine.
 *
 * Studio makes the same test when it chooses a stamp itself (`legibleStamp` in the Studio kit). That
 * file loads three.js with it, so the few figures the test needs are kept here as well.
 */

/** How each foil reads on a shelf, on average over what it mirrors. */
const FOIL_READS: Readonly<Record<string, string>> = { gold: '#d9b45a', silver: '#d8d6cf', copper: '#c98a5e', holo: '#d8d6cf' };
/** A spine title is how a link is found: a stamp must stand at least this far off its cloth. */
const LEGIBLE = 3;
/** Boards that are metal themselves, where a foil title has nothing to stand against. */
const METAL_BOARDS: readonly string[] = ['foil', 'holo'];

export type StampTrouble = 'cloth' | 'binding' | 'blind';

/** The short note a stamp carries, by what stands in its way. */
export const STAMP_TROUBLE: Readonly<Record<StampTrouble, string>> = {
  cloth: 'Hard to read on this cloth.',
  binding: 'Hard to read on this binding.',
  blind: 'Pressed without colour, hard to read on a spine.',
};

/** Relative luminance of a `#rgb` or `#rrggbb` colour, 0 to 1. Anything else counts as mid grey. */
export function luminance(color: string): number {
  const hex = color.trim().replace('#', '');
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return 0.2;
  const channel = (at: number): number => {
    const value = parseInt(full.slice(at, at + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * What stands in the way of reading `stamp` on a cover bound in `binding` over cloth of the colour
 * `cloth`, or undefined when it reads well. Printed ink always reads: every look pairs it with its cloth.
 */
export function stampTrouble(stamp: string, binding: string | undefined, cloth: string | undefined): StampTrouble | undefined {
  if (stamp === 'blind') return 'blind';
  const foil = FOIL_READS[stamp];
  if (foil === undefined) return undefined;
  if (binding !== undefined && METAL_BOARDS.includes(binding)) return 'binding';
  if (cloth !== undefined && cloth !== '' && contrast(foil, cloth) < LEGIBLE) return 'cloth';
  return undefined;
}

/** The colour a cloth has in the look the page is in, read from the page's own styles. */
export function clothColor(within: HTMLElement, cloth: string): string | undefined {
  const probe = document.createElement('span');
  probe.className = `bb-book bb-cloth--${cloth}`;
  probe.hidden = true;
  within.appendChild(probe);
  const value = getComputedStyle(probe).getPropertyValue('--cloth').trim();
  probe.remove();
  return value || undefined;
}

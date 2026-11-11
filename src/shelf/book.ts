import { createCover } from './cover-art';
import type { TitleFit } from './title-fit';
import { resolveCloth } from './variants';
import type { ShelfItem } from './types';

/**
 * One volume: a list item holding three faces that always exist (the spine, the front board on its right
 * and the back board on its left), the printed cover laid on the front board only near the centre and,
 * for the real (non-repeated) copy of an item, one native button that keyboard and screen-reader users
 * operate. Pointer taps land on the faces and are handled by the shelf through delegation.
 */
export interface BookNode {
  element: HTMLLIElement;
  slot: number;
  index: number;
  item: ShelfItem;
  /** The lettering on the spine; the shelf fits it to the spine's size. */
  title: HTMLElement;
  spineShade: HTMLElement;
  /** The front board. The printed cover is laid on it. */
  cover: HTMLElement;
  coverShade: HTMLElement;
  back: HTMLElement;
  backShade: HTMLElement;
  print: HTMLElement | null;
  /** Last `--bb-turn` written, so a volume at rest is not written again on every frame. */
  turn: number;
  /** Last shade written on the spine, the front board and the back board. */
  shades: [number, number, number];
  control: HTMLButtonElement | null;
}

function span(className: string, text?: string): HTMLSpanElement {
  const element = document.createElement('span');
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function markFor(item: ShelfItem, index: number): string {
  return item.mark ?? String(index + 1).padStart(2, '0');
}

export function createBook(item: ShelfItem, index: number, slot: number): BookNode {
  const element = document.createElement('li');
  element.className = `bb-book bb-cloth--${resolveCloth(item.cloth)}`;
  element.dataset.slot = String(slot);
  element.dataset.index = String(index);
  element.dataset.id = item.id;

  const body = span('bb-book__body');
  body.setAttribute('aria-hidden', 'true');

  const spine = span('bb-book__spine');
  spine.appendChild(span('bb-spine__mark', markFor(item, index)));
  spine.appendChild(span('bb-spine__rule'));
  const title = span('bb-spine__title', item.title);
  if (item.lang) title.lang = item.lang;
  spine.appendChild(title);
  spine.appendChild(span('bb-spine__rule'));
  spine.appendChild(span('bb-spine__sigil'));
  const spineShade = span('bb-book__shade');
  spine.appendChild(spineShade);
  body.appendChild(spine);

  if ((item.progress ?? 0) > 0) {
    const ribbon = span('bb-book__ribbon');
    // The ribbon grows with progress: a just-started volume shows a short tab.
    ribbon.style.setProperty('--bb-ribbon', String(Math.min(1, Math.max(0.12, item.progress ?? 0))));
    body.appendChild(ribbon);
  }

  // Both boards are plain cloth, so they cost two spans and no decision about when to show them: the
  // browser culls whichever faces away. Only the printed cover is built on demand.
  const cover = span('bb-book__cover bb-book__board bb-book__board--front');
  const coverShade = span('bb-book__shade');
  cover.appendChild(coverShade);
  const back = span('bb-book__board bb-book__board--back');
  const backShade = span('bb-book__shade');
  back.appendChild(backShade);
  body.append(cover, back);

  element.appendChild(body);
  return { element, slot, index, item, title, spineShade, cover, coverShade, back, backShade, print: null, turn: 0, shades: [-1, -1, -1], control: null };
}

/**
 * Lays the printed cover on the front board. The print only shows as the volume turns toward the viewer,
 * so a volume that is still at rest looks the same with or without it.
 */
export function ensurePrint(node: BookNode): void {
  if (node.print) return;
  const print = createCover(node.item, markFor(node.item, node.index));
  node.cover.insertBefore(print, node.coverShade);
  const seal = span('bb-book__seal', 'Open');
  node.cover.insertBefore(seal, node.coverShade);
  node.cover.appendChild(span('bb-book__sheen'));
  node.print = print;
}

export function dropPrint(node: BookNode): void {
  if (!node.print) return;
  node.print.remove();
  node.cover.querySelector('.bb-book__seal')?.remove();
  node.cover.querySelector('.bb-book__sheen')?.remove();
  node.print = null;
}

export function describe(item: ShelfItem, index: number, count: number): string {
  const parts = [item.title];
  if (item.source) parts.push(item.source);
  parts.push(`Volume ${index + 1} of ${count}`);
  const progress = item.progress ?? 0;
  if (progress > 0) parts.push(`${Math.round(progress * 100)} percent read`);
  return parts.join('. ');
}

/** Letters the spine with a fitted title: its size, and a line break when it is set on two lines. */
export function letterSpine(node: BookNode, fit: TitleFit): void {
  const text = fit.lines.join('\n');
  if (node.title.textContent !== text) node.title.textContent = text;
  node.title.style.fontSize = `${fit.size.toFixed(2)}px`;
  node.title.dataset.lines = String(fit.lines.length);
  node.title.classList.toggle('is-clipped', fit.clipped);
}

/** Adds or removes the single operable control, depending on whether this copy is the real one. */
export function setReal(node: BookNode, real: boolean, count: number): void {
  if (real && !node.control) {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'bb-book__control';
    control.tabIndex = -1;
    control.setAttribute('aria-label', describe(node.item, node.index, count));
    node.element.prepend(control);
    node.control = control;
    node.element.removeAttribute('aria-hidden');
  } else if (!real && node.control) {
    node.control.remove();
    node.control = null;
  }
  if (!real) node.element.setAttribute('aria-hidden', 'true');
}

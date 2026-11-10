import { createCover } from './cover-art';
import { resolveCloth } from './variants';
import type { ShelfItem } from './types';

/**
 * One volume: a list item holding a spine face, a lazily built cover face and,
 * for the real (non-repeated) copy of an item, one native button that keyboard
 * and screen-reader users operate. Pointer taps land on the faces and are
 * handled by the shelf through delegation.
 */
export interface BookNode {
  element: HTMLLIElement;
  slot: number;
  index: number;
  item: ShelfItem;
  spineShade: HTMLElement;
  cover: HTMLElement | null;
  coverShade: HTMLElement | null;
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
  spine.appendChild(span('bb-spine__title', item.title));
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

  element.appendChild(body);
  return { element, slot, index, item, spineShade, cover: null, coverShade: null, control: null };
}

/** Builds the cover face the first time a volume comes near the centre. */
export function ensureCover(node: BookNode): void {
  if (node.cover) return;
  const face = span('bb-book__cover');
  face.appendChild(createCover(node.item, markFor(node.item, node.index)));
  const seal = span('bb-book__seal', 'Open');
  face.appendChild(seal);
  const shade = span('bb-book__shade');
  face.appendChild(shade);
  node.element.querySelector('.bb-book__body')?.appendChild(face);
  node.cover = face;
  node.coverShade = shade;
}

export function dropCover(node: BookNode): void {
  node.cover?.remove();
  node.cover = null;
  node.coverShade = null;
}

export function describe(item: ShelfItem, index: number, count: number): string {
  const parts = [item.title];
  if (item.source) parts.push(item.source);
  parts.push(`Volume ${index + 1} of ${count}`);
  const progress = item.progress ?? 0;
  if (progress > 0) parts.push(`${Math.round(progress * 100)} percent read`);
  return parts.join('. ');
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

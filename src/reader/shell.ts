import { el } from './dom';
import type { ReaderLabels } from './types';

export const DEFAULT_COVER_ASPECT = 0.62;

export interface ShellRefs {
  root: HTMLElement;
  windowEl: HTMLElement;
  sheet: HTMLElement;
  bar: HTMLElement;
  closeButton: HTMLButtonElement;
  /** Holds the thumbnail and the title; it appears once the title has scrolled under the bar. */
  barTitle: HTMLElement;
  barText: HTMLElement;
  /** Small copy of the cover in the bar, where the cover lands when the one beside the text has scrolled away. */
  thumb: HTMLElement;
  readout: HTMLElement;
  lineFill: HTMLElement;
  layout: HTMLElement;
  article: HTMLElement;
  coverSlot: HTMLElement;
}

export interface ShellInput {
  titleId: string;
  labels: ReaderLabels;
  cover: HTMLElement | null;
  coverAspect: number | undefined;
}

function buildThumb(dom: Document, cover: HTMLElement | null, ratio: string): HTMLElement {
  const thumb = el(dom, 'div', 'bb-reader__thumb');
  thumb.setAttribute('aria-hidden', 'true');
  thumb.style.setProperty('--bb-reader-cover-aspect-given', ratio);
  const face = el(dom, 'div', 'bb-reader__thumb-face');
  if (cover) {
    // A scaled copy, so the thumbnail is the same cover at a smaller size and the copy takes no part in navigation.
    const copy = cover.cloneNode(true) as HTMLElement;
    copy.removeAttribute('id');
    copy.removeAttribute('tabindex');
    copy.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    copy.setAttribute('inert', '');
    face.appendChild(copy);
  }
  thumb.appendChild(face);
  return thumb;
}

function buildBar(dom: Document, labels: ReaderLabels, cover: HTMLElement | null, ratio: string) {
  const bar = el(dom, 'header', 'bb-reader__bar');
  const closeButton = el(dom, 'button', 'bb-reader__close bb-button', labels.close);
  closeButton.type = 'button';
  const readout = el(dom, 'span', 'bb-reader__readout bb-label');
  readout.setAttribute('aria-live', 'off');
  const thumb = buildThumb(dom, cover, ratio);
  const barTitle = el(dom, 'div', 'bb-reader__bar-title');
  // The title is already the dialog's name and the page's heading, so this copy stays out of the reading order.
  barTitle.setAttribute('aria-hidden', 'true');
  const barText = el(dom, 'span', 'bb-reader__bar-text');
  barTitle.append(thumb, barText);
  const line = el(dom, 'div', 'bb-reader__line');
  line.setAttribute('aria-hidden', 'true');
  const lineFill = el(dom, 'div', 'bb-reader__line-fill');
  line.appendChild(lineFill);
  bar.append(closeButton, barTitle, readout, line);
  return { bar, closeButton, barTitle, barText, thumb, readout, lineFill };
}

function coverRatio(aspect: number | undefined): string {
  return String(aspect && Number.isFinite(aspect) && aspect > 0 ? aspect : DEFAULT_COVER_ASPECT);
}

function buildCover(dom: Document, cover: HTMLElement | null, ratio: string) {
  const aside = el(dom, 'aside', 'bb-reader__cover');
  const slot = el(dom, 'div', 'bb-reader__cover-slot');
  // A custom property instead of a direct style, so a look can override the proportion with a token.
  slot.style.setProperty('--bb-reader-cover-aspect-given', ratio);
  if (cover) slot.appendChild(cover);
  aside.appendChild(slot);
  return { aside, slot };
}

/** Builds the static frame of the dialog. The article is filled separately. */
export function buildShell(dom: Document, input: ShellInput): ShellRefs {
  const root = el(dom, 'div', 'bb-reader');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', input.titleId);
  root.setAttribute('data-open', '0');
  root.setAttribute('data-content', '0');
  root.setAttribute('data-closed', '1');
  root.style.visibility = 'hidden';

  const windowEl = el(dom, 'div', 'bb-reader__window');
  const sheet = el(dom, 'div', 'bb-reader__sheet');
  sheet.style.opacity = '0';
  sheet.tabIndex = -1; // clicks inside land here, so Escape and Tab keep working
  const ratio = coverRatio(input.coverAspect);
  const { bar, closeButton, barTitle, barText, thumb, readout, lineFill } = buildBar(dom, input.labels, input.cover, ratio);
  const layout = el(dom, 'div', 'bb-reader__layout');
  if (!input.cover) layout.classList.add('bb-reader__layout--bare');
  const article = el(dom, 'article', 'bb-reader__doc');
  const { aside, slot } = buildCover(dom, input.cover, ratio);

  layout.append(article, aside);
  sheet.append(bar, layout);
  windowEl.appendChild(sheet);
  root.appendChild(windowEl);
  return { root, windowEl, sheet, bar, closeButton, barTitle, barText, thumb, readout, lineFill, layout, article, coverSlot: slot };
}

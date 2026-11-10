import { el } from './dom';
import type { ReaderLabels } from './types';

export const DEFAULT_COVER_ASPECT = 0.62;

export interface ShellRefs {
  root: HTMLElement;
  windowEl: HTMLElement;
  sheet: HTMLElement;
  bar: HTMLElement;
  closeButton: HTMLButtonElement;
  hostLabel: HTMLElement;
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

function buildBar(dom: Document, labels: ReaderLabels) {
  const bar = el(dom, 'header', 'bb-reader__bar');
  const closeButton = el(dom, 'button', 'bb-reader__close bb-button', labels.close);
  closeButton.type = 'button';
  const hostLabel = el(dom, 'span', 'bb-reader__host-label bb-label');
  const readout = el(dom, 'span', 'bb-reader__readout bb-label');
  readout.setAttribute('aria-live', 'off');
  const line = el(dom, 'div', 'bb-reader__line');
  line.setAttribute('aria-hidden', 'true');
  const lineFill = el(dom, 'div', 'bb-reader__line-fill');
  line.appendChild(lineFill);
  bar.append(closeButton, hostLabel, readout, line);
  return { bar, closeButton, hostLabel, readout, lineFill };
}

function buildCover(dom: Document, cover: HTMLElement | null, aspect: number | undefined) {
  const aside = el(dom, 'aside', 'bb-reader__cover');
  const slot = el(dom, 'div', 'bb-reader__cover-slot');
  const ratio = aspect && Number.isFinite(aspect) && aspect > 0 ? aspect : DEFAULT_COVER_ASPECT;
  // A custom property instead of a direct style, so a look can override the proportion with a token.
  slot.style.setProperty('--bb-reader-cover-aspect-given', String(ratio));
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
  root.style.visibility = 'hidden';

  const windowEl = el(dom, 'div', 'bb-reader__window');
  const sheet = el(dom, 'div', 'bb-reader__sheet');
  sheet.tabIndex = -1; // clicks inside land here, so Escape and Tab keep working
  const { bar, closeButton, hostLabel, readout, lineFill } = buildBar(dom, input.labels);
  const layout = el(dom, 'div', 'bb-reader__layout');
  if (!input.cover) layout.classList.add('bb-reader__layout--bare');
  const article = el(dom, 'article', 'bb-reader__doc');
  const { aside, slot } = buildCover(dom, input.cover, input.coverAspect);

  layout.append(article, aside);
  sheet.append(bar, layout);
  windowEl.appendChild(sheet);
  root.appendChild(windowEl);
  return { root, windowEl, sheet, bar, closeButton, hostLabel, readout, lineFill, layout, article, coverSlot: slot };
}

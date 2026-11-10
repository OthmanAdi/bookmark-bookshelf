import './reader.css';
import { buildArticleParts, fillBody } from './article';
import type { ArticleHandlers } from './article';
import { hostnameOf, resolveLabels } from './meta';
import { createProgressTracker, measureBlocks } from './progress';
import { revealFrame } from './reveal';
import { buildShell } from './shell';
import type { Box, ReaderDoc, ReaderHandle, ReaderOptions, ReaderProgress } from './types';

let instanceCounter = 0;

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function mountReader(host: HTMLElement, options: ReaderOptions): ReaderHandle {
  const dom = host.ownerDocument;
  const labels = resolveLabels(options.labels);
  const uid = `bb-reader-${++instanceCounter}`;
  const titleId = `${uid}-title`;
  const canEdit = typeof options.onSaveText === 'function';
  const cover = options.cover ?? null;
  const shell = buildShell(dom, { titleId, labels, cover, coverAspect: options.coverAspect });
  const { root, windowEl, sheet, bar } = shell;

  let source: ReaderDoc = options.doc;
  let editing = false;
  let body: HTMLElement = dom.createElement('div');
  let editButton: HTMLButtonElement | null = null;
  let destroyed = false;

  const tracker = createProgressTracker({
    scroller: sheet,
    measure: () => measureBlocks(sheet, body),
    topInset: () => bar.offsetHeight,
    onChange: (position, silent) => {
      showProgress(position);
      if (!silent) options.onProgress?.(position);
    },
  });

  function showProgress(position: ReaderProgress): void {
    shell.readout.textContent = labels.progress(Math.round(position.percent * 100));
    shell.lineFill.style.transform = `scaleX(${position.percent})`;
  }

  const handlers: ArticleHandlers = {
    edit() {
      editing = true;
      render('field');
    },
    save(text) {
      options.onSaveText?.(text);
      source = { ...source, text };
      editing = false;
      render('edit');
    },
    cancel() {
      editing = false;
      render('edit');
    },
  };

  function render(focusTarget: 'field' | 'edit' | null = null, relayout = true): void {
    const parts = buildArticleParts(dom, { source, labels, titleId, canEdit, handlers });
    shell.article.replaceChildren(...parts.nodes);
    body = parts.body;
    editButton = parts.editButton;
    shell.hostLabel.textContent = hostnameOf(source.url);
    const field = fillBody({ dom, body, source, labels, fieldId: `${uid}-paste`, canEdit, editing, handlers });
    if (focusTarget === 'field') field?.focus({ preventScroll: true });
    if (focusTarget === 'edit') (editButton ?? sheet).focus({ preventScroll: true });
    if (relayout) tracker.settle();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      options.onClose?.();
    } else if (event.key === 'Tab' && root.dataset.open === '1') {
      trapTab(event);
    }
  }

  function trapTab(event: KeyboardEvent): void {
    const stops = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = stops[0];
    const last = stops[stops.length - 1];
    const active = dom.activeElement;
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    const backwards = event.shiftKey && (active === first || active === sheet || active === root || !root.contains(active));
    const forwards = !event.shiftKey && (active === last || !root.contains(active));
    if (backwards) {
      event.preventDefault();
      last.focus();
    } else if (forwards) {
      event.preventDefault();
      first.focus();
    }
  }

  function applyReveal(progress: number, from?: Box | null): void {
    const view = dom.defaultView;
    const viewport = { width: root.clientWidth || view?.innerWidth || 0, height: root.clientHeight || view?.innerHeight || 0 };
    const frame = revealFrame(progress, from, viewport);
    root.dataset.open = frame.open ? '1' : '0';
    root.style.visibility = frame.closed ? 'hidden' : 'visible';
    windowEl.style.transform = frame.windowTransform;
    sheet.style.transform = frame.sheetTransform;
    sheet.style.opacity = frame.opacity;
  }

  const closeClick = (): void => options.onClose?.();
  shell.closeButton.addEventListener('click', closeClick);
  root.addEventListener('keydown', onKeydown);

  host.appendChild(root);
  render(null, false);
  tracker.sync(true);
  if (options.progress) tracker.restore(options.progress);

  const settle = (): void => {
    if (!destroyed) tracker.settle();
  };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(settle) : null;
  observer?.observe(shell.layout);
  void dom.fonts?.ready.then(settle, () => undefined);

  return {
    element: root,
    scroller: sheet,
    coverSlotRect() {
      if (!cover) return null;
      const { x, y, width, height } = shell.coverSlot.getBoundingClientRect();
      return { x, y, width, height };
    },
    setReveal: applyReveal,
    setCoverVisible(visible) {
      if (cover) cover.style.visibility = visible ? '' : 'hidden';
      shell.coverSlot.toggleAttribute('data-cover-hidden', !visible);
    },
    focus() {
      shell.closeButton.focus({ preventScroll: true });
    },
    update(next) {
      if (destroyed) return;
      source = next;
      editing = false;
      tracker.restore(null);
      render();
    },
    progress: () => tracker.current(),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      tracker.destroy();
      observer?.disconnect();
      shell.closeButton.removeEventListener('click', closeClick);
      root.removeEventListener('keydown', onKeydown);
      root.remove();
    },
  };
}

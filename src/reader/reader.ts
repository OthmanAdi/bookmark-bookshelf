import './reader.css';
import './reader-text.css';
import { buildArticleParts, fillBody } from './article';
import type { ArticleHandlers } from './article';
import { resolveLabels } from './meta';
import { createProgressTracker, measureBlocks } from './progress';
import { revealFrame } from './reveal';
import { buildShell } from './shell';
import type { Box, ReaderDoc, ReaderHandle, ReaderOptions, ReaderProgress } from './types';

let instanceCounter = 0;

const box = ({ x, y, width, height }: DOMRect): Box => ({ x, y, width, height });

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function mountReader(host: HTMLElement, options: ReaderOptions): ReaderHandle {
  const dom = host.ownerDocument;
  const labels = resolveLabels(options.labels);
  const uid = `bb-reader-${++instanceCounter}`;
  const titleId = `${uid}-title`;
  const canEdit = typeof options.onSaveText === 'function';
  const cover = options.cover ?? null;
  const shell = buildShell(dom, { titleId, labels, cover, coverAspect: options.coverAspect });
  const { root, sheet, bar } = shell;

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
      // Once the person moves, the bar thumbnail goes back to following the cover beside the text.
      if (!silent) bar.removeAttribute('data-landing');
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

  let titleWatch: IntersectionObserver | null = null;

  // The bar shows the title once the heading has scrolled out under it.
  function watchTitle(): void {
    titleWatch?.disconnect();
    titleWatch = null;
    const heading = shell.article.querySelector('h1');
    if (!heading || typeof IntersectionObserver !== 'function') return;
    titleWatch = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        const gone = !entry.isIntersecting && entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0) + 1;
        bar.toggleAttribute('data-away', gone);
      },
      { root: sheet, rootMargin: `-${Math.round(bar.getBoundingClientRect().height)}px 0px 0px 0px`, threshold: [0, 1] },
    );
    titleWatch.observe(heading);
  }

  function render(focusTarget: 'field' | 'edit' | null = null, relayout = true): void {
    const parts = buildArticleParts(dom, { source, labels, titleId, canEdit, handlers });
    shell.article.replaceChildren(...parts.nodes);
    Array.from(shell.article.children).forEach((child, index) => {
      child.classList.add('bb-reader__enter');
      (child as HTMLElement).style.setProperty('--bb-enter-index', String(Math.min(index, 4)));
    });
    body = parts.body;
    editButton = parts.editButton;
    shell.barText.textContent = source.title;
    watchTitle();
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

  const reducedQuery = dom.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
  let lastProgress = 0;

  // The second argument is accepted for older callers and no longer used: the sheet only fades.
  function applyReveal(progress: number, _from?: Box | null): void {
    const frame = revealFrame(progress, reducedQuery?.matches === true);
    // Going from closed straight to open (a restored session) shows the text at once instead of letting it rise.
    if (frame.open && lastProgress <= 0) root.dataset.enter = 'instant';
    else if (!frame.open && !frame.closed) delete root.dataset.enter;
    lastProgress = progress;
    root.dataset.open = frame.open ? '1' : '0';
    root.dataset.content = frame.content ? '1' : '0';
    root.dataset.closed = frame.closed ? '1' : '0';
    root.style.visibility = frame.closed ? 'hidden' : 'visible';
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
    flightTarget() {
      if (!cover) return null;
      const slot = box(shell.coverSlot.getBoundingClientRect());
      const barBottom = bar.getBoundingClientRect().bottom;
      const height = root.clientHeight || dom.defaultView?.innerHeight || 0;
      const onScreen = slot.width > 0 && slot.height > 0 && slot.y >= barBottom - 1 && slot.y + slot.height <= height + 1;
      if (onScreen) {
        bar.removeAttribute('data-landing');
        return slot;
      }
      // Beside the text the cover has scrolled away (or is not laid out): land in the bar.
      bar.setAttribute('data-landing', '');
      const thumb = box(shell.thumb.getBoundingClientRect());
      if (thumb.width > 0 && thumb.height > 0) return thumb;
      bar.removeAttribute('data-landing');
      return slot.width > 0 && slot.height > 0 ? slot : null;
    },
    coverSlotRect() {
      if (!cover) return null;
      return box(shell.coverSlot.getBoundingClientRect());
    },
    setReveal: applyReveal,
    setCoverVisible(visible) {
      if (cover) cover.style.visibility = visible ? '' : 'hidden';
      shell.thumb.toggleAttribute('data-cover-hidden', !visible);
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
      titleWatch?.disconnect();
      shell.closeButton.removeEventListener('click', closeClick);
      root.removeEventListener('keydown', onKeydown);
      root.remove();
    },
  };
}

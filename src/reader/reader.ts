import './reader.css';
import './reader-text.css';
import { buildArticleParts, fillBody } from './article';
import type { ArticleHandlers } from './article';
import { resolveLabels } from './meta';
import { buildEnd } from './end';
import type { End } from './end';
import { createProgressTracker, measureBlocks } from './progress';
import { trapTab } from './focus-trap';
import { measureFlightTarget, toBox } from './landing';
import { createRevealer } from './reveal';
import { TEXT_SIZES, normaliseScale, stepScale } from './text-size';
import { buildShell } from './shell';
import { createTitleWatch } from './title-watch';
import type { NextLink, ReaderDoc, ReaderHandle, ReaderOptions, ReaderProgress } from './types';

let instanceCounter = 0;

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
  let scale = normaliseScale(options.textScale);
  let done = options.done === true;
  let next: NextLink | null = options.next ?? null;
  let end: End | null = null;

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

  function applyScale(): void {
    if (scale === null) root.style.removeProperty('--bb-reader-size');
    else root.style.setProperty('--bb-reader-size', `${TEXT_SIZES[scale]}px`);
    shell.sizeDown.toggleAttribute('aria-disabled', scale === 0);
    shell.sizeUp.toggleAttribute('aria-disabled', scale === TEXT_SIZES.length - 1);
  }

  // The same words stay at the top of the screen: the position is put back once the lines have reflowed.
  function stepText(delta: -1 | 1): void {
    const measured = Number.parseFloat(dom.defaultView?.getComputedStyle(body).fontSize ?? '') || TEXT_SIZES[0];
    const next = stepScale(scale, delta, measured);
    if (next === scale) return;
    const here = tracker.current();
    scale = next;
    applyScale();
    tracker.restore({ block: here.block, ratio: here.ratio, percent: here.percent });
    options.onTextScale?.(next);
  }

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

  const titleWatch = createTitleWatch(sheet, bar, (gone) => bar.toggleAttribute('data-away', gone));

  // The closing block belongs to a text that is being read, not to the empty state or the paste panel.
  function renderEnd(): void {
    end?.root.remove();
    end = null;
    if (!source.text?.trim() || editing) return;
    end = buildEnd(dom, {
      labels,
      done,
      canMark: typeof options.onDone === 'function',
      next,
      onDone: (value) => {
        done = value;
        options.onDone?.(value);
      },
      onNext: () => options.onNext?.(),
    });
    if (end) shell.article.appendChild(end.root);
  }

  function render(focusTarget: 'field' | 'edit' | null = null, relayout = true): void {
    const parts = buildArticleParts(dom, { source, labels, titleId, canEdit, handlers });
    shell.article.replaceChildren(...parts.nodes);
    body = parts.body;
    editButton = parts.editButton;
    shell.barText.textContent = source.title;
    titleWatch.watch(shell.article.querySelector('h1'));
    const field = fillBody({ dom, body, source, labels, fieldId: `${uid}-paste`, canEdit, editing, handlers });
    renderEnd();
    Array.from(shell.article.children).forEach((child, index) => {
      child.classList.add('bb-reader__enter');
      (child as HTMLElement).style.setProperty('--bb-enter-index', String(Math.min(index, 4)));
    });
    if (focusTarget === 'field') field?.focus({ preventScroll: true });
    if (focusTarget === 'edit') (editButton ?? sheet).focus({ preventScroll: true });
    if (relayout) tracker.settle();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      options.onClose?.();
    } else if (event.key === 'Tab' && root.dataset.open === '1') {
      trapTab(event, root, sheet);
    }
  }

  const applyReveal = createRevealer(root, sheet);

  const closeClick = (): void => options.onClose?.();
  shell.closeButton.addEventListener('click', closeClick);
  root.addEventListener('keydown', onKeydown);
  shell.sizeDown.addEventListener('click', () => stepText(-1));
  shell.sizeUp.addEventListener('click', () => stepText(1));
  applyScale();

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
    setDone(value) {
      done = value;
      end?.setDone(value);
    },
    setNext(value) {
      next = value;
      renderEnd();
      tracker.settle();
    },
    flightTarget() {
      return cover ? measureFlightTarget(shell, root.clientHeight || dom.defaultView?.innerHeight || 0) : null;
    },
    coverSlotRect() {
      return cover ? toBox(shell.coverSlot.getBoundingClientRect()) : null;
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
    update(doc) {
      if (destroyed) return;
      source = doc;
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
      titleWatch.destroy();
      shell.closeButton.removeEventListener('click', closeClick);
      root.removeEventListener('keydown', onKeydown);
      root.remove();
    },
  };
}

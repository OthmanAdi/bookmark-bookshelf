import './shelf.css';
import './variants.css';
import { createBook, dropCover, ensureCover, setReal, type BookNode } from './book';
import { computeRow, restPitch, scaleGeometry, visibleRange } from './layout';
import { resolveVariant } from './variants';
import type { Box, Geometry, Pose, ShelfHandle, ShelfIntent, ShelfItem, ShelfOptions, Variant } from './types';

const DEG = Math.PI / 180;
/** Room kept above the books for a leaning or lifted volume, and below for the contact shadow. */
const HEADROOM = 26;
const FLOOR_ROOM = 30;
const MIN_SCALE = 0.5;
const MAX_SCALE = 1.5;

function wrap(index: number, count: number): number {
  return count <= 0 ? 0 : ((index % count) + count) % count;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function mountShelf(host: HTMLElement, options: ShelfOptions): ShelfHandle {
  let items: ShelfItem[] = options.items.slice();
  let variant: Variant = resolveVariant(options.variant);
  let loop = options.loop ?? variant.loop;
  let pose: Pose = options.pose ?? { position: 0, open: 0 };
  let stage: Box | null = null;
  let geometry: Geometry = variant.geometry;
  let sceneWidth = 0;
  let centre = Number.NaN;
  let openSlot: number | null = null;
  const nodes = new Map<number, BookNode>();
  const listeners = new Set<(intent: ShelfIntent) => void>();

  const root = el('section', 'bb-shelf');
  root.setAttribute('aria-label', options.label ?? 'Bookshelf');
  root.dataset.variant = variant.name;
  root.dataset.open = '0';

  const scene = el('div', 'bb-shelf__scene');
  const backdrop = el('div', 'bb-shelf__backdrop');
  backdrop.setAttribute('aria-hidden', 'true');
  const row = el('ul', 'bb-shelf__row');
  row.setAttribute('role', 'list');
  const floor = el('div', 'bb-shelf__floor');
  floor.setAttribute('aria-hidden', 'true');
  scene.append(backdrop, floor, row);

  const nav = el('div', 'bb-shelf__nav');
  const previous = el('button', 'bb-shelf__arrow bb-shelf__arrow--prev');
  previous.type = 'button';
  previous.setAttribute('aria-label', 'Previous volume');
  previous.textContent = '←';
  const next = el('button', 'bb-shelf__arrow bb-shelf__arrow--next');
  next.type = 'button';
  next.setAttribute('aria-label', 'Next volume');
  next.textContent = '→';
  nav.append(previous, next);
  nav.hidden = options.arrows === false;

  const caption = el('div', 'bb-shelf__caption');
  caption.setAttribute('aria-hidden', 'true');
  const captionTitle = el('p', 'bb-shelf__title');
  const captionMeta = el('p', 'bb-shelf__meta bb-label');
  caption.append(captionTitle, captionMeta);
  caption.hidden = options.caption === false;

  const actions = el('div', 'bb-shelf__actions');
  const empty = el('p', 'bb-shelf__empty', 'This shelf is empty.');
  empty.hidden = true;

  root.append(scene, nav, caption, actions, empty);
  host.appendChild(root);

  const emit = (intent: ShelfIntent): void => {
    for (const listener of listeners) listener(intent);
  };

  function measure(): void {
    sceneWidth = scene.clientWidth || root.clientWidth || 1280;
    const available = Math.max(120, (scene.clientHeight || 400) - HEADROOM - FLOOR_ROOM);
    const base = variant.geometry;
    const byHeight = available / base.bookHeight;
    // On a narrow screen the turned cover and at least one spine each side must still fit.
    const byWidth = (sceneWidth * 0.94) / (base.coverWidth + 2 * (base.spineWidth + base.gap) + 2 * base.focusGap);
    const factor = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(byHeight, byWidth)));
    geometry = scaleGeometry(base, factor);
    root.style.setProperty('--bb-spine-w', `${geometry.spineWidth}px`);
    root.style.setProperty('--bb-book-h', `${geometry.bookHeight}px`);
    root.style.setProperty('--bb-cover-w', `${geometry.coverWidth}px`);
    root.style.setProperty('--bb-floor-y', `${FLOOR_ROOM}px`);
    scene.style.perspective = `${geometry.perspective}px`;
  }

  function isReal(slot: number): boolean {
    if (!loop) return true;
    const count = items.length;
    const first = centre - Math.floor((count - 1) / 2);
    return slot >= first && slot < first + count;
  }

  /** Keeps exactly one operable control per item and one tab stop for the whole row. */
  function syncSemantics(moveFocus: boolean): void {
    for (const node of nodes.values()) {
      setReal(node, isReal(node.slot), items.length);
      if (node.control) node.control.tabIndex = node.slot === centre ? 0 : -1;
      node.element.classList.toggle('is-centre', node.slot === centre);
    }
    if (moveFocus) nodes.get(centre)?.control?.focus({ preventScroll: true });
  }

  function syncCaption(): void {
    const item = items[wrap(centre, items.length)];
    captionTitle.textContent = item?.title ?? '';
    const parts: string[] = [];
    if (item?.source) parts.push(item.source);
    if (item) parts.push(`${wrap(centre, items.length) + 1} / ${items.length}`);
    if (item && (item.progress ?? 0) > 0) parts.push(`${Math.round((item.progress ?? 0) * 100)}% read`);
    captionMeta.textContent = parts.join('  ·  ');
    root.dataset.focus = String(wrap(centre, items.length));
    root.dataset.focusId = item?.id ?? '';
  }

  function syncNodes(from: number, to: number): void {
    for (const [slot, node] of nodes) {
      if (slot >= from && slot <= to) continue;
      // Never recycle the volume that holds keyboard focus.
      if (node.control && node.control === document.activeElement) continue;
      node.element.remove();
      nodes.delete(slot);
    }
    for (let slot = from; slot <= to; slot++) {
      if (nodes.has(slot)) continue;
      const index = wrap(slot, items.length);
      const item = items[index];
      if (!item) continue;
      const node = createBook(item, index, slot);
      setReal(node, isReal(slot), items.length);
      nodes.set(slot, node);
      row.appendChild(node.element);
    }
  }

  function flightTransform(e: number, x: number, lift: number, z: number, lean: number): string {
    if (!stage) return '';
    const sceneBox = scene.getBoundingClientRect();
    const originX = sceneBox.left + sceneBox.width / 2;
    const floorY = sceneBox.bottom - FLOOR_ROOM;
    const scale = stage.width / geometry.coverWidth;
    // At a full turn the cover's left edge is on the pivot and its plane sits half a spine in front of it.
    // Pulling the pivot back by that much puts the cover exactly on the z = 0 plane, where perspective does not resize it.
    const targetX = stage.x - originX;
    const targetY = stage.y + stage.height - floorY;
    const targetZ = -(geometry.spineWidth / 2) * scale;
    const mix = (from: number, to: number): number => from + (to - from) * e;
    return (
      `translate3d(${mix(x, targetX)}px, ${mix(-lift, targetY)}px, ${mix(z, targetZ)}px) ` +
      `rotateZ(${mix(lean, 0)}deg) rotateY(${-geometry.focusAngle}deg) scale3d(${mix(1, scale)}, ${mix(1, scale)}, ${mix(1, scale)})`
    );
  }

  function render(): void {
    const count = items.length;
    empty.hidden = count > 0;
    root.dataset.empty = count > 0 ? '0' : '1';
    if (count === 0) {
      for (const node of nodes.values()) node.element.remove();
      nodes.clear();
      captionTitle.textContent = '';
      captionMeta.textContent = '';
      // An empty shelf has no centred volume.
      centre = Number.NaN;
      root.dataset.focus = '';
      root.dataset.focusId = '';
      return;
    }

    const position = loop ? pose.position : Math.min(count - 1 + 0.49, Math.max(-0.49, pose.position));
    const nextCentre = Math.round(position);
    const centreChanged = nextCentre !== centre;
    const focusInside = row.contains(document.activeElement);
    centre = nextCentre;

    const range = visibleRange(position, geometry, sceneWidth, count, loop);
    syncNodes(range.from, range.to);
    if (centreChanged) {
      syncSemantics(focusInside);
      syncCaption();
    }

    const opening = pose.open > 0;
    if (opening && openSlot === null) openSlot = centre;
    if (!opening) openSlot = null;
    const flying = opening && !pose.reduced && stage !== null;
    const slide = sceneWidth / 2 + geometry.coverWidth * 1.4;

    for (const slotPose of computeRow(position, geometry, range.from, range.to)) {
      const node = nodes.get(slotPose.slot);
      if (!node) continue;
      const distance = Math.abs(slotPose.slot - position);
      if (distance < 2.4 || slotPose.slot === openSlot) ensureCover(node);
      else if (distance > 4) dropCover(node);

      const style = node.element.style;
      if (flying && slotPose.slot === openSlot) {
        style.transform = flightTransform(pose.open, slotPose.x, slotPose.lift, slotPose.z, slotPose.lean);
        style.zIndex = '3';
      } else {
        const away = flying && openSlot !== null ? Math.sign(slotPose.slot - openSlot) * pose.open * slide : 0;
        style.transform =
          `translate3d(${slotPose.x + away}px, ${-slotPose.lift}px, ${slotPose.z}px) ` +
          `rotateZ(${slotPose.lean}deg) rotateY(${-slotPose.angle}deg)`;
        style.zIndex = slotPose.weight > 0 ? '2' : '';
      }

      const turn = Math.sin(slotPose.angle * DEG);
      node.spineShade.style.opacity = String(Math.min(0.6, turn * 0.6));
      if (node.coverShade) node.coverShade.style.opacity = String((1 - turn) * 0.55);
      node.element.classList.toggle('is-turned', slotPose.weight > 0.98);
    }

    root.dataset.open = pose.open <= 0 ? '0' : pose.open >= 1 ? '1' : 'moving';
    scene.style.opacity = pose.reduced && opening ? String(1 - pose.open) : '';
  }

  const onClick = (event: MouseEvent): void => {
    const target = event.target as Element | null;
    const book = target?.closest<HTMLElement>('.bb-book');
    if (!book || pose.open > 0) return;
    const slot = Number(book.dataset.slot);
    const index = Number(book.dataset.index);
    const item = items[index];
    if (!item || Number.isNaN(slot)) return;
    const atRest = Math.abs(pose.position - slot) < 0.25;
    if (slot === centre && atRest) emit({ type: 'open', id: item.id, index });
    else emit({ type: 'focus', id: item.id, index, slot });
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (pose.open > 0 || event.altKey || event.ctrlKey || event.metaKey) return;
    const intent: ShelfIntent | null =
      event.key === 'ArrowRight'
        ? { type: 'step', direction: 1 }
        : event.key === 'ArrowLeft'
          ? { type: 'step', direction: -1 }
          : event.key === 'Home'
            ? { type: 'jump', to: 'first' }
            : event.key === 'End'
              ? { type: 'jump', to: 'last' }
              : null;
    if (!intent) return;
    event.preventDefault();
    emit(intent);
  };

  // A screen reader can move focus straight to any volume. Bring that volume to the centre.
  const onFocusIn = (event: FocusEvent): void => {
    const book = (event.target as Element | null)?.closest<HTMLElement>('.bb-book');
    if (!book) return;
    const slot = Number(book.dataset.slot);
    const index = Number(book.dataset.index);
    const item = items[index];
    if (item && slot !== centre) emit({ type: 'focus', id: item.id, index, slot });
  };

  const onPrevious = (): void => emit({ type: 'step', direction: -1 });
  const onNext = (): void => emit({ type: 'step', direction: 1 });

  row.addEventListener('click', onClick);
  row.addEventListener('keydown', onKeyDown);
  row.addEventListener('focusin', onFocusIn);
  previous.addEventListener('click', onPrevious);
  next.addEventListener('click', onNext);

  const refresh = (): void => {
    measure();
    render();
  };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(refresh) : null;
  observer?.observe(scene);

  refresh();

  return {
    element: root,
    surface: scene,
    actions,
    get variant() {
      return variant;
    },
    get loop() {
      return loop;
    },
    setItems(nextItems) {
      items = nextItems.slice();
      for (const node of nodes.values()) node.element.remove();
      nodes.clear();
      centre = Number.NaN;
      render();
    },
    setPose(nextPose) {
      pose = nextPose;
      render();
    },
    setStage(box) {
      stage = box;
    },
    setVariant(nextVariant) {
      variant = resolveVariant(nextVariant);
      loop = options.loop ?? variant.loop;
      root.dataset.variant = variant.name;
      for (const node of nodes.values()) node.element.remove();
      nodes.clear();
      centre = Number.NaN;
      refresh();
    },
    pitch: () => restPitch(geometry),
    coverBox() {
      const cover = nodes.get(centre)?.cover;
      if (!cover) return null;
      const box = cover.getBoundingClientRect();
      return { x: box.left, y: box.top, width: box.width, height: box.height };
    },
    focusCurrent() {
      nodes.get(centre)?.control?.focus({ preventScroll: true });
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    destroy() {
      observer?.disconnect();
      row.removeEventListener('click', onClick);
      row.removeEventListener('keydown', onKeyDown);
      row.removeEventListener('focusin', onFocusIn);
      previous.removeEventListener('click', onPrevious);
      next.removeEventListener('click', onNext);
      listeners.clear();
      root.remove();
    },
  };
}

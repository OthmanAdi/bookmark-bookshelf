import './shelf.css';
import './cover.css';
import './variants.css';
import {
  createBook,
  createBookend,
  dropPrint,
  ensurePrint,
  letterSpine,
  setReal,
  type BookendNode,
  type BookNode,
} from './book';
import { fitTitle, forgetTitleWidths, type TitleFont } from './title-fit';
import {
  computeRow,
  computeStandingRow,
  extentOf,
  pitchAt,
  restPitch,
  rowStands,
  scaleGeometry,
  visibleRange,
  volumeSize,
  type SlotPose,
  type VolumeSize,
} from './layout';
import { faceShades, resolveLight, sheenOf, sweepOf } from './light';
import { resolveVariant } from './variants';
import type { Geometry, Light, Pose, ShelfHandle, ShelfIntent, ShelfItem, ShelfOptions, Variant } from './types';

const DEG = Math.PI / 180;
/** Room kept above the books for a leaning or lifted volume, and below for the contact shadow. */
const HEADROOM = 26;
const FLOOR_ROOM = 30;
/**
 * While a volume is out of the row its neighbours stand aside, the nearest by this many px at scale 1,
 * each further one by less, up to `PART_REACH` slots away. Nothing leaves the scene.
 */
const PART = 28;
const PART_REACH = 4;
/** The printed cover is laid on a volume closer than this many steps to the centre and dropped beyond the second. */
const PRINT_NEAR = 1.5;
const PRINT_FAR = 2.5;
/** A change of shade smaller than this cannot be seen. */
const SHADE_STEP = 0.002;
/**
 * Share of the measured room a fitted spine title may fill. The room of other spine widths is worked out
 * from one measured spine, and a letter cut at the end of a title is worse than a title a little smaller.
 */
const TITLE_ROOM = 0.97;
/** Space a pasted label keeps around its title along the spine, in spine widths, at each end. */
const LABEL_INSET = 0.16;
/** Below this spine width in px the number at the head would fall under 9 px, so it is left off. */
const NARROW_SPINE = 40;
/** A bookend's plate is this share of the look's spine width thick, and never thinner than the minimum. */
const BOOKEND_SHARE = 0.1;
const BOOKEND_MIN = 4;
/** How tall a bookend stands, as a share of the look's volume height. */
const BOOKEND_TALL = 0.62;
/** The lamp's place in the scene is written again only once it has moved this many px. */
const LAMP_STEP = 0.5;
/** Space in px a standing row keeps between each bookend and the edge of the scene. */
const BOOKEND_AIR = 4;
/** A touch that moves less than this many px and lifts within this many ms is a tap. */
const TAP_SLOP = 10;
const TAP_MAX_MS = 700;
const MIN_SCALE = 0.5;
const MAX_SCALE = 1.5;

/** The old caption leaves quickly and the new one arrives a little slower, so the eye lands on it. */
const CAPTION_OUT_MS = 90;
const CAPTION_IN_MS = 160;

interface CaptionText {
  title: string;
  meta: string;
  /** True when the meta line is the person's own note rather than the source. */
  note: boolean;
}

/** Counts mounted shelves, so ids inside each one stay unique on a page with several. */
let shelfCount = 0;

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
  let light: Light = resolveLight(variant.light);
  let loop = options.loop ?? variant.loop;
  /** The row is short enough to stand whole in the middle of the scene, and does not travel. */
  let fixed = false;
  let pose: Pose = options.pose ?? { position: 0, open: 0 };
  let geometry: Geometry = variant.geometry;
  let sceneWidth = 0;
  let centre = Number.NaN;
  let openSlot: number | null = null;
  /** Pose of the centred volume as last drawn. */
  let presented: SlotPose | null = null;
  /**
   * Where a lamp stands along the scene, in px from its centre: over the presented volume. A travelling
   * row brings that volume to the centre; in a row that stands still the lamp goes to the volume.
   */
  let lampX = 0;
  let lampWritten = 0;
  /** Each item's volume size at the current scale; null when every volume has the look's size. */
  let sizes: VolumeSize[] | null = null;
  const sizeOf = (slot: number): VolumeSize => sizeAt(slot) ?? geometry;
  /** The spine title's font as the page sets it, and how many spine widths the other spine parts take. */
  let titleFont: TitleFont = { family: 'serif', weight: '600', letterSpacing: 0, upper: false };
  let spineParts = 1.45;
  const nodes = new Map<number, BookNode>();
  const listeners = new Set<(intent: ShelfIntent) => void>();
  /** Set once mounting is done, so a host is never called back before it has the handle. */
  let mounted = false;
  /** Keyboard focus was in the row when its volumes were rebuilt: put it back on the centre. */
  let refocus = false;
  const bookends = { start: createBookend('start'), end: createBookend('end') };

  const root = el('section', 'bb-shelf');
  root.setAttribute('aria-label', options.label ?? 'Bookshelf');
  root.dataset.variant = variant.name;
  root.dataset.open = '0';
  root.style.setProperty('--bb-light-tint', light.tint);

  const scene = el('div', 'bb-shelf__scene');
  const backdrop = el('div', 'bb-shelf__backdrop');
  backdrop.setAttribute('aria-hidden', 'true');
  const row = el('ul', 'bb-shelf__row');
  row.setAttribute('role', 'list');
  const floor = el('div', 'bb-shelf__floor');
  floor.setAttribute('aria-hidden', 'true');
  scene.append(backdrop, floor, row);
  row.append(bookends.start.element, bookends.end.element);

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
  const captionMeta = el('p', 'bb-shelf__meta');
  caption.append(captionTitle, captionMeta);
  let captionFade: Animation | null = null;
  let nextCaption: CaptionText | null = null;
  caption.hidden = options.caption === false;

  // How to use the row, read with every volume's name, so the keyboard model never has to be guessed.
  const hint = el('p', 'bb-shelf__hint', 'Arrow keys move along the shelf, Enter opens.');
  hint.id = `bb-shelf-hint-${++shelfCount}`;

  const actions = el('div', 'bb-shelf__actions');
  const empty = el('p', 'bb-shelf__empty', 'This shelf is empty.');
  empty.hidden = true;

  root.append(scene, nav, caption, actions, empty, hint);
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
    root.style.setProperty('--bb-gap', `${geometry.gap}px`);
    root.style.setProperty('--bb-bookend-w', `${bookendWidth()}px`);
    root.style.setProperty('--bb-bookend-h', `${geometry.bookHeight * BOOKEND_TALL}px`);
    scene.style.perspective = `${geometry.perspective}px`;
    measureSizes();
    decideRow();
  }

  /**
   * A row that would leave part of the stage bare does not travel: it stands whole in the middle of the
   * scene between two bookends, and the presented volume turns where it stands. A longer row repeats, so
   * the stage is full wherever the row stops, and at most a sliver of it can be seen twice at the edges.
   */
  function decideRow(): void {
    // Past each end volume stands its bookend, with a little air between it and the edge of the scene.
    const ends = bookendWidth() + BOOKEND_AIR;
    fixed = rowStands(geometry, items.length, sceneWidth, sizes ? sizeOf : undefined, ends);
    const next = !fixed && (options.loop ?? variant.loop);
    root.dataset.loop = next ? '1' : '0';
    root.dataset.fixed = fixed ? '1' : '0';
    if (next === loop) return;
    loop = next;
    // Slots mean something else in the other kind of row, so every volume is built again.
    refocus = refocus || row.contains(document.activeElement);
    for (const node of nodes.values()) node.element.remove();
    nodes.clear();
    centre = Number.NaN;
    if (mounted) options.onLoopChange?.(loop);
  }

  /** Works out each volume's own size at the current scale. A shelf whose items carry no size skips it all. */
  function measureSizes(): void {
    const any = items.some((item) => item.thickness !== undefined || item.stature !== undefined);
    sizes = any ? items.map((item) => volumeSize(geometry, item.thickness, item.stature)) : null;
    for (const node of nodes.values()) {
      applySize(node);
      fitSpine(node);
    }
  }

  function sizeAt(slot: number): VolumeSize | undefined {
    return sizes?.[wrap(slot, items.length)];
  }

  /**
   * Fits the spine's lettering. The font and the share of the spine its other parts take are read from
   * the page once per refresh; volumes built while the row moves reuse them and read no layout.
   */
  function fitSpine(node: BookNode): void {
    const size = sizeOf(node.slot);
    const label = node.treatment === 'label' ? 2 * LABEL_INSET * size.spineWidth : 0;
    const length = (size.bookHeight - spineParts * size.spineWidth) * TITLE_ROOM - label;
    letterSpine(node, fitTitle(node.item.title, { length, breadth: size.spineWidth }, titleFont));
    // Too narrow for a number at the head to stay at a readable size: leave it off rather than shrink it.
    node.element.toggleAttribute('data-narrow', size.spineWidth < NARROW_SPINE);
  }

  function readLettering(): void {
    // A look asks for the number at the head of each spine through a custom property.
    root.dataset.mark = getComputedStyle(root).getPropertyValue('--bb-spine-mark').trim() === '1' ? '1' : '0';
    const node = nodes.get(centre) ?? nodes.values().next().value;
    if (!node || !node.title.isConnected) return;
    const style = getComputedStyle(node.title);
    const fontSize = parseFloat(style.fontSize) || 16;
    const font: TitleFont = {
      family: style.fontFamily || titleFont.family,
      weight: style.fontWeight || titleFont.weight,
      letterSpacing: (parseFloat(style.letterSpacing) || 0) / fontSize,
      upper: style.textTransform === 'uppercase',
    };
    const size = sizeOf(node.slot);
    const room = node.title.clientHeight;
    const parts = room > 0 ? (size.bookHeight - room) / size.spineWidth : spineParts;
    const changed =
      Math.abs(parts - spineParts) > 0.01 ||
      font.family !== titleFont.family ||
      font.weight !== titleFont.weight ||
      Math.abs(font.letterSpacing - titleFont.letterSpacing) > 0.001 ||
      font.upper !== titleFont.upper;
    titleFont = font;
    spineParts = parts;
    if (changed) for (const each of nodes.values()) fitSpine(each);
  }

  function applySize(node: BookNode): void {
    const size = sizeAt(node.slot);
    const style = node.element.style;
    if (!size) {
      style.removeProperty('--bb-spine-w');
      style.removeProperty('--bb-book-h');
      style.removeProperty('--bb-cover-w');
      return;
    }
    style.setProperty('--bb-spine-w', `${size.spineWidth}px`);
    style.setProperty('--bb-book-h', `${size.bookHeight}px`);
    style.setProperty('--bb-cover-w', `${size.coverWidth}px`);
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
      setReal(node, isReal(node.slot), items.length, hint.id);
      if (node.control) node.control.tabIndex = node.slot === centre ? 0 : -1;
      node.element.classList.toggle('is-centre', node.slot === centre);
    }
    if (moveFocus) nodes.get(centre)?.control?.focus({ preventScroll: true });
  }

  function syncCaption(): void {
    const item = items[wrap(centre, items.length)];
    // The note says why the link was kept; without one, where it comes from.
    const note = item?.note?.trim() ?? '';
    showCaption({ title: item?.title ?? '', meta: note || item?.source || '', note: note !== '' });
    root.dataset.focus = String(wrap(centre, items.length));
    root.dataset.focusId = item?.id ?? '';
  }

  function writeCaption(text: CaptionText): void {
    captionTitle.textContent = text.title;
    captionMeta.textContent = text.meta;
    captionMeta.classList.toggle('is-note', text.note);
  }

  /**
   * A new caption replaces the old one by a quick fade out and a slower fade in, never by sliding. While
   * the row travels fast the fade simply continues and the caption that lands is the latest one.
   */
  function showCaption(text: CaptionText): void {
    const quiet =
      pose.reduced === true ||
      typeof caption.animate !== 'function' ||
      (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (quiet || caption.hidden || captionTitle.textContent === '') {
      captionFade?.cancel();
      captionFade = null;
      writeCaption(text);
      return;
    }
    nextCaption = text;
    if (captionFade) return;
    const out = caption.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: CAPTION_OUT_MS,
      easing: 'ease-in',
      fill: 'forwards',
    });
    captionFade = out;
    out.onfinish = () => {
      if (captionFade !== out) return;
      captionFade = null;
      if (nextCaption) writeCaption(nextCaption);
      nextCaption = null;
      caption.animate([{ opacity: 0 }, { opacity: 1 }], { duration: CAPTION_IN_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      out.cancel();
    };
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
      applySize(node);
      fitSpine(node);
      setReal(node, isReal(slot), items.length, hint.id);
      nodes.set(slot, node);
      row.appendChild(node.element);
    }
  }

  /** Most volumes hold still in most frames: write a shade only when it has visibly changed. */
  function writeShade(node: BookNode | BookendNode, face: 0 | 1 | 2, film: HTMLElement, value: number): void {
    if (Math.abs(node.shades[face] - value) <= SHADE_STEP) return;
    node.shades[face] = value;
    film.style.opacity = value.toFixed(3);
  }

  /** Stands a bookend against the outer side of the end volume, or hides it where the row has no end in view. */
  function placeBookend(bookend: BookendNode, x: number | null): void {
    const element = bookend.element;
    if (x === null) {
      if (!element.hidden) element.hidden = true;
      return;
    }
    element.hidden = false;
    element.style.transform = `translate3d(${x}px, 0, 0)`;
    const shades = faceShades(light, 0, light.lamp ? (x - lampX) / geometry.coverWidth : 0);
    writeShade(bookend, 0, bookend.edgeShade, shades.spine);
    writeShade(bookend, 1, bookend.frontShade, shades.front);
    writeShade(bookend, 2, bookend.backShade, shades.back);
  }

  function render(): void {
    const count = items.length;
    empty.hidden = count > 0;
    root.dataset.empty = count > 0 ? '0' : '1';
    if (count === 0) {
      for (const node of nodes.values()) node.element.remove();
      nodes.clear();
      placeBookend(bookends.start, null);
      placeBookend(bookends.end, null);
      captionFade?.cancel();
      captionFade = null;
      writeCaption({ title: '', meta: '', note: false });
      // An empty shelf has no centred volume.
      centre = Number.NaN;
      presented = null;
      root.dataset.focus = '';
      root.dataset.focusId = '';
      return;
    }

    const position = fixed
      ? Math.min(count - 1, Math.max(0, pose.position))
      : loop
        ? pose.position
        : Math.min(count - 1 + 0.49, Math.max(-0.49, pose.position));
    const nextCentre = Math.round(position);
    const centreChanged = nextCentre !== centre;
    const focusInside = row.contains(document.activeElement);
    centre = nextCentre;

    const sized = sizes ? sizeOf : undefined;
    // A row that stands still shows every volume it has.
    const range = fixed ? { from: 0, to: count - 1 } : visibleRange(position, geometry, sceneWidth, count, loop, 2, sized);
    syncNodes(range.from, range.to);
    if (centreChanged) {
      syncSemantics(focusInside || refocus);
      refocus = false;
      syncCaption();
    }

    const opening = pose.open > 0;
    if (opening && openSlot === null) openSlot = centre;
    if (!opening) openSlot = null;
    // The host carries a copy of the cover to the page. The shelf only leaves its place empty and makes
    // room around it. Under reduced motion nothing in the row moves; the page simply fades in over it.
    const parting = opening && !pose.reduced && openSlot !== null;
    const scale = geometry.spineWidth / variant.geometry.spineWidth;

    presented = null;
    let start: number | null = null;
    let end: number | null = null;
    // A bookend presses against the end volume; a hair of space keeps the two faces from flickering.
    const bookendGap = bookendWidth() / 2 + 1;
    const standing = fixed ? computeStandingRow(position, geometry, count, sized) : null;
    const poses = standing ? standing.poses : computeRow(position, geometry, range.from, range.to, sized);
    lampX = standing ? standing.origin : 0;
    if (light.lamp && Math.abs(lampX - lampWritten) > LAMP_STEP) {
      // The look can lay its pool of light on the floor where the lamp stands.
      lampWritten = lampX;
      root.style.setProperty('--bb-lamp-x', `${lampX.toFixed(1)}px`);
    }
    // A bookend is shorter than a volume: it meets a volume leaning toward it below the head.
    const bookendTall = geometry.bookHeight * BOOKEND_TALL;
    for (const slotPose of poses) {
      const node = nodes.get(slotPose.slot);
      if (!node) continue;
      if (slotPose.slot === centre) presented = slotPose;
      // The print is laid on well before the volume starts to turn and kept a while after, so a volume
      // drifting back and forth at the edge of the band does not build and drop it over and over.
      const distance = Math.abs(slotPose.slot - position);
      // Every cover keeps the look's proportion, however tall its volume is.
      if (distance < PRINT_NEAR || slotPose.slot === openSlot) ensurePrint(node, geometry.coverWidth / geometry.bookHeight);
      else if (distance > PRINT_FAR) dropPrint(node);

      const offset = parting && openSlot !== null ? slotPose.slot - openSlot : Number.NaN;
      const reach = Math.abs(offset);
      const away = reach > 0 && reach <= PART_REACH ? Math.sign(offset) * PART * scale * (1 - reach / 5) * pose.open : 0;
      const style = node.element.style;
      style.visibility = reach === 0 ? 'hidden' : '';
      style.transform =
        slotPose.lean === 0
          ? `translate3d(${slotPose.x + away}px, ${-slotPose.lift}px, ${slotPose.z}px) rotateY(${-slotPose.angle}deg)`
          : `translate3d(${slotPose.x + slotPose.corner + away}px, ${-slotPose.lift}px, ${slotPose.z}px) ` +
            `rotateZ(${slotPose.lean}deg) translateX(${-slotPose.corner}px) rotateY(${-slotPose.angle}deg)`;
      style.zIndex = slotPose.weight > 0 ? '2' : '';

      // Distance of the volume's middle from the lamp, in cover widths.
      const along = light.lamp
        ? (slotPose.x - lampX + away + (geometry.coverWidth * Math.sin(slotPose.angle * DEG)) / 2) / geometry.coverWidth
        : 0;
      const shades = faceShades(light, slotPose.angle, along);
      writeShade(node, 0, node.spineShade, shades.spine);
      writeShade(node, 1, node.coverShade, shades.front);
      writeShade(node, 2, node.backShade, shades.back);
      const turn = Math.sin(slotPose.angle * DEG);
      if (slotPose.weight > 0 || node.turn !== 0) {
        const turning = slotPose.weight > 0;
        node.turn = turning ? turn : 0;
        node.element.style.setProperty('--bb-turn', String(node.turn));
        node.element.style.setProperty('--bb-sheen', turning ? sheenOf(light, slotPose.angle, along).toFixed(4) : '0');
        node.element.style.setProperty('--bb-sweep', sweepOf(turning ? slotPose.weight : 0).toFixed(4));
      }
      node.element.classList.toggle('is-turned', slotPose.weight > 0.98);

      if (!loop && slotPose.slot === 0) start = extentOf(slotPose, sizeOf(0), bookendTall)[0] + away - bookendGap;
      if (!loop && slotPose.slot === count - 1) end = extentOf(slotPose, sizeOf(count - 1), bookendTall)[1] + away + bookendGap;
    }
    placeBookend(bookends.start, start);
    placeBookend(bookends.end, end);

    root.dataset.open = pose.open <= 0 ? '0' : pose.open >= 1 ? '1' : 'moving';
  }

  function bookendWidth(): number {
    return Math.max(BOOKEND_MIN, geometry.spineWidth * BOOKEND_SHARE);
  }

  function activate(book: HTMLElement): void {
    if (pose.open > 0) return;
    const slot = Number(book.dataset.slot);
    const index = Number(book.dataset.index);
    const item = items[index];
    if (!item || Number.isNaN(slot)) return;
    const atRest = Math.abs(pose.position - slot) < 0.25;
    if (slot === centre && atRest) emit({ type: 'open', id: item.id, index });
    else emit({ type: 'focus', id: item.id, index, slot });
  }

  // Touch taps are recognised here from pointer events instead of waiting for `click`: after a quick swipe
  // some browsers swallow the next tap's click, and a volume that ignores a tap feels broken.
  let touchDown: { id: number; x: number; y: number; time: number; book: HTMLElement } | null = null;
  let handledTapUntil = 0;

  const onPointerDown = (event: PointerEvent): void => {
    touchDown = null;
    if (event.pointerType === 'mouse') return;
    const book = (event.target as Element | null)?.closest<HTMLElement>('.bb-book');
    if (book) touchDown = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, book };
  };

  // A touch that ever leaves the slop radius is a drag for good, even if it comes back to where it started.
  const onPointerMove = (event: PointerEvent): void => {
    if (!touchDown || touchDown.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - touchDown.x, event.clientY - touchDown.y) > TAP_SLOP) touchDown = null;
  };

  const onPointerUp = (event: PointerEvent): void => {
    const down = touchDown;
    touchDown = null;
    if (!down || down.id !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    if (moved > TAP_SLOP || event.timeStamp - down.time > TAP_MAX_MS) return;
    handledTapUntil = event.timeStamp + TAP_MAX_MS;
    activate(down.book);
  };

  const onPointerCancel = (): void => {
    touchDown = null;
  };

  const onClick = (event: MouseEvent): void => {
    // Skip the browser's own click for a tap that was already handled above: one activation per tap.
    // A click with detail 0 comes from the keyboard or from script, never from that tap, so it always counts.
    const fromKeyboard = event.detail === 0;
    if (!fromKeyboard && event.timeStamp < handledTapUntil) return;
    const book = (event.target as Element | null)?.closest<HTMLElement>('.bb-book');
    if (book) activate(book);
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
  scene.addEventListener('pointerdown', onPointerDown);
  scene.addEventListener('pointermove', onPointerMove);
  scene.addEventListener('pointerup', onPointerUp);
  scene.addEventListener('pointercancel', onPointerCancel);
  row.addEventListener('keydown', onKeyDown);
  row.addEventListener('focusin', onFocusIn);
  previous.addEventListener('click', onPrevious);
  next.addEventListener('click', onNext);

  const refresh = (): void => {
    measure();
    render();
    readLettering();
  };

  // Titles measured before the web fonts arrived were measured in a fallback face.
  let alive = true;
  void document.fonts?.ready.then(() => {
    if (!alive) return;
    forgetTitleWidths();
    for (const node of nodes.values()) fitSpine(node);
  });
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(refresh) : null;
  observer?.observe(scene);

  refresh();
  mounted = true;

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
    get fixed() {
      return fixed;
    },
    setItems(nextItems) {
      items = nextItems.slice();
      refocus = refocus || row.contains(document.activeElement);
      for (const node of nodes.values()) node.element.remove();
      nodes.clear();
      centre = Number.NaN;
      measureSizes();
      decideRow();
      render();
    },
    setPose(nextPose) {
      pose = nextPose;
      render();
    },
    setVariant(nextVariant) {
      variant = resolveVariant(nextVariant);
      light = resolveLight(variant.light);
      root.dataset.variant = variant.name;
      root.style.setProperty('--bb-light-tint', light.tint);
      refocus = refocus || row.contains(document.activeElement);
      for (const node of nodes.values()) node.element.remove();
      nodes.clear();
      centre = Number.NaN;
      refresh();
    },
    pitch() {
      if (!sizes || sizes.length === 0) return restPitch(geometry);
      return sizes.reduce((sum, size) => sum + size.spineWidth, 0) / sizes.length + geometry.gap;
    },
    pitchAt: (position) => pitchAt(position, geometry, sizes ? sizeOf : undefined),
    coverSize: () => ({ width: geometry.coverWidth, height: geometry.bookHeight }),
    coverBox() {
      const cover = nodes.get(centre)?.cover;
      if (!cover) return null;
      const box = cover.getBoundingClientRect();
      return { x: box.left, y: box.top, width: box.width, height: box.height };
    },
    coverPlacement() {
      const cover = nodes.get(centre)?.cover;
      if (!cover || !presented) return null;
      // A rotated, slightly turned rectangle keeps its centre at the centre of its bounding box to well
      // under a pixel, so one layout read gives the centre of the face as drawn.
      const box = cover.getBoundingClientRect();
      const turn = presented.angle * DEG;
      const size = sizeOf(centre);
      const half = size.spineWidth / 2;
      // Depth of the face's centre: the cover hinges on the spine's edge and turns about the spine's middle.
      const depth = presented.z + half * Math.sin(turn) - (size.coverWidth / 2) * Math.cos(turn);
      const along = light.lamp ? (presented.x - lampX + (size.coverWidth * Math.sin(turn)) / 2) / geometry.coverWidth : 0;
      return {
        cx: box.left + box.width / 2,
        cy: box.top + box.height / 2,
        width: size.coverWidth,
        height: size.bookHeight,
        lean: presented.lean,
        yaw: 90 - presented.angle,
        scale: geometry.perspective / Math.max(1, geometry.perspective - depth),
        sheen: presented.weight > 0 ? sheenOf(light, presented.angle, along) : 0,
        sweep: sweepOf(presented.weight),
      };
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
      alive = false;
      captionFade?.cancel();
      observer?.disconnect();
      row.removeEventListener('click', onClick);
      scene.removeEventListener('pointerdown', onPointerDown);
      scene.removeEventListener('pointermove', onPointerMove);
      scene.removeEventListener('pointerup', onPointerUp);
      scene.removeEventListener('pointercancel', onPointerCancel);
      row.removeEventListener('keydown', onKeyDown);
      row.removeEventListener('focusin', onFocusIn);
      previous.removeEventListener('click', onPrevious);
      next.removeEventListener('click', onNext);
      listeners.clear();
      root.remove();
    },
  };
}

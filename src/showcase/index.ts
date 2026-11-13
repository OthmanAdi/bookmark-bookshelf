import './showcase.css';
import { createClassicDrawing } from './classic';
import { createDetails } from './details';
import { createRail } from './rail';
import { applyMove, clampIndex, createWheelStepper, keyToMove, swipeToStep, type Move } from './scroll';
import { advance, createTravel, hold, jump, letGo, retarget, shownOf, standAt, type Travel } from './travel';
import { advanceTurn, aim, anglesOf, createTurn, dragBy, grab, release, spinOpening, tiltToward, turning, type Turn } from './turn';
import { type BookBox, type BookFrame, type Drawing, fitBook, type ShowcaseItem, type ShowcaseLook } from './types';

export type { BookBox, BookFrame, Drawing, ShowcaseItem, ShowcaseLook } from './types';
export { TRAVEL_MS, FADE_MS } from './travel';

/**
 * Showcase: one book at a time, large, with what is known about it beside it and a rail of ticks for
 * the whole row. The wheel, a swipe, the keys and the ticks move from one book to the next; the book in
 * view turns toward the pointer and can be turned by hand. It draws with CSS, or with WebGL when asked,
 * and holds no links itself: the host gives it items and hears what the person asked for.
 */

export type ShowcasePaint = 'classic' | 'studio';

export interface ShowcaseOptions {
  items: readonly ShowcaseItem[];
  /** The book in view at the start. */
  index?: number;
  look: ShowcaseLook;
  paint?: ShowcasePaint;
  /** Accessible name of the region. */
  label?: string;
  /** The main action of a book was asked for: its button, or the book itself was pressed. */
  onRead(id: string): void;
  onEdit(id: string): void;
  /** The link to the original was followed. The browser opens it; this only tells the host. */
  onOriginal?(id: string): void;
  /** Another book came into view. */
  onIndex?(index: number, item: ShowcaseItem): void;
  /** A move was asked for past the first or the last book. */
  onEnd?(end: 'first' | 'last'): void;
  /** Whether motion is reduced right now. Defaults to the system setting. */
  reduced?: () => boolean;
  /** Loads the WebGL drawing. Defaults to this module's own, fetched only when Studio is asked for. */
  loadStudio?: () => Promise<{ createStudioDrawing(options: { onFailure(reason: string): void }): Drawing }>;
  /** Studio could not start or lost WebGL; the showcase has gone back to the classic drawing. */
  onPaintFailure?(reason: string): void;
}

export interface ShowcaseHandle {
  readonly element: HTMLElement;
  /** The book in view, or the one the showcase is heading for. */
  readonly index: number;
  /** The drawing in use right now. */
  readonly paint: ShowcasePaint;
  /** Changes the row. The book in view stays in view when `index` still names it. */
  setItems(items: readonly ShowcaseItem[], index?: number): void;
  show(index: number, options?: { immediate?: boolean }): void;
  setLook(look: ShowcaseLook): void;
  setPaint(paint: ShowcasePaint): void;
  /** Measures again, after the host was shown or resized. */
  refresh(): void;
  /** Moves keyboard focus to the book in view. */
  focus(): void;
  destroy(): void;
}

/** Seconds the book takes to open a little under the hand, and to close: the pace of Studio's shelf. */
const PEEK_OPEN_S = 0.22;
const PEEK_CLOSE_S = 0.16;
/** A press that moved less than this is a click. */
const DRAG_SLOP = 5;
/** The speed of a release is read from this much of the movement before it. */
const RELEASE_WINDOW_MS = 80;
/** A spin opens the book, and the book shuts again, over about this long. */
const SPIN_SMOOTH_S = 0.1;
/** Under this width the book stands above the details and the rail lies across. Matches showcase.css. */
export const NARROW_QUERY = '(max-width: 40rem)';

const systemReduced = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const media = (query: string): boolean => typeof matchMedia === 'function' && matchMedia(query).matches;

let serial = 0;

export function mountShowcase(host: HTMLElement, options: ShowcaseOptions): ShowcaseHandle {
  const reduced = options.reduced ?? systemReduced;
  const id = `bb-showcase-${++serial}`;

  const root = document.createElement('section');
  root.className = 'bb-showcase';
  root.setAttribute('aria-label', options.label ?? 'Showcase');

  const stage = document.createElement('div');
  stage.className = 'bb-showcase__stage';
  const glow = document.createElement('div');
  glow.className = 'bb-showcase__glow';
  const scene = document.createElement('div');
  scene.className = 'bb-showcase__scene';
  const shadow = document.createElement('div');
  shadow.className = 'bb-showcase__shadow';
  /** The book as a control: it takes focus, a press, a drag and a swipe. Everything drawn sits behind it. */
  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'bb-showcase__control';
  control.setAttribute('aria-describedby', `${id}-title`);
  /** A cloth swatch nobody sees: the colour of the book in view is read from it for the wash behind the book. */
  const probe = document.createElement('span');
  probe.hidden = true;
  stage.append(glow, shadow, scene, control, probe);

  let items: readonly ShowcaseItem[] = options.items;
  let index = clampIndex(options.index ?? 0, items.length);
  let look = options.look;
  let travel: Travel = createTravel(index);
  let turn: Turn = createTurn();
  let peek = 0;
  /** How far a spin has thrown the book open, 0 to 1, and the yaw it was last seen at. */
  let spin = 0;
  let lastYaw = 0;
  let box: BookBox | null = null;
  let drawing: Drawing = createClassicDrawing();
  let wanted: ShowcasePaint = 'classic';
  let ticket = 0;
  let queued: number | null = null;
  let last = 0;
  let alive = true;
  let hovering = false;

  const current = (): ShowcaseItem | undefined => items[index];

  const details = createDetails(
    {
      step: (by) => move({ type: 'step', by }),
      primary: () => {
        const item = current();
        if (item) options.onRead(item.book.id);
      },
      original: () => {
        const item = current();
        if (item) options.onOriginal?.(item.book.id);
      },
      edit: () => {
        const item = current();
        if (item) options.onEdit(item.book.id);
      },
    },
    { title: `${id}-title` },
  );
  const rail = createRail((picked) => go(picked));

  scene.appendChild(drawing.element);
  root.append(rail.element, stage, details.element);
  host.appendChild(root);

  /* ---------- drawing ---------- */

  const idle = (): boolean => !reduced() && !hovering && media('(hover: none)');

  function invalidate(): void {
    if (queued !== null || !alive) return;
    queued = requestAnimationFrame(frame);
  }

  function frame(now: number): void {
    queued = null;
    if (!alive) return;
    const dt = last === 0 ? 0 : Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const still = reduced();
    const sway = idle();
    travel = advance(travel, dt);
    turn = advanceTurn(turn, dt, { idle: sway });
    // The book opens a little while the hand rests on it, and never while it is being turned or moved away.
    const open = !still && travel.settled && turn.phase === 'rest' && (hovering || control.matches(':focus-visible')) ? 1 : 0;
    if (open !== peek) {
      const pace = open > peek ? PEEK_OPEN_S : PEEK_CLOSE_S;
      peek += (open - peek) * (1 - Math.exp(-dt / (pace / 3)));
      if (Math.abs(open - peek) < 0.002) peek = open;
    }
    // A book that is spun opens by its speed, so a throw fans the pages; it shuts as the spin dies.
    const speed = turn.phase === 'rest' || dt === 0 ? 0 : Math.abs(turn.drag.yaw - lastYaw) / dt;
    lastYaw = turn.phase === 'rest' ? 0 : turn.drag.yaw;
    const thrown = still ? 0 : spinOpening(speed);
    spin += (thrown - spin) * (dt === 0 ? 0 : 1 - Math.exp(-dt / SPIN_SMOOTH_S));
    if (thrown === 0 && spin < 0.002) spin = 0;
    paint();
    const more = (!travel.settled && !travel.held) || peek !== open || spin > 0 || (!still && turning(turn, { idle: sway }));
    if (more && root.isConnected && !host.hidden) invalidate();
    else last = 0;
  }

  function paint(): void {
    if (!box) return;
    const angles = reduced() ? { yaw: 0, pitch: 0 } : anglesOf(turn, { idle: idle() });
    const frames: BookFrame[] = [];
    let nearest = 1;
    for (const shown of shownOf(travel)) {
      const item = items[shown.index];
      if (!item) continue;
      nearest = Math.min(nearest, Math.abs(shown.offset));
      frames.push({
        index: shown.index,
        item: item.book,
        stand: standAt(shown.offset),
        turn: shown.target ? angles : { yaw: 0, pitch: 0 },
        opacity: shown.opacity,
        peek: shown.target ? Math.max(peek, spin) : 0,
        target: shown.target,
      });
    }
    // The light stands still in the room. Only the move between books sweeps it, by its speed, so the
    // highlight crosses the cover on each change and is back in place when the book has arrived.
    drawing.setPointer(Math.max(-1, Math.min(1, travel.velocity / 3.2)), 0);
    drawing.draw(frames);
    // One shadow on the ground: it fades as a book leaves and comes back under the next.
    const lit = Math.max(0, 1 - nearest * 2.6);
    const fading = travel.fade ? Math.abs(travel.fade.progress * 2 - 1) : 1;
    shadow.style.opacity = (lit * lit * fading).toFixed(3);
    shadow.style.setProperty('--bb-shadow-turn', (angles.yaw / 90).toFixed(3));
    root.dataset.settled = travel.settled ? '1' : '0';
  }

  function measure(): void {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (width <= 0 || height <= 0) return;
    box = fitBook(width, height, look.aspect, window.innerHeight || undefined);
    stage.style.setProperty('--bb-book-w', `${box.width}px`);
    stage.style.setProperty('--bb-book-h', `${box.height}px`);
    drawing.resize(box);
    rail.fit();
    paint();
  }

  /** The wash behind the book takes the colour of its cloth. */
  function tint(): void {
    const item = current();
    probe.className = item ? `bb-cloth--${item.book.cloth ?? 'ink'}` : '';
    const cloth = item ? getComputedStyle(probe).getPropertyValue('--cloth').trim() : '';
    if (cloth) root.style.setProperty('--bb-showcase-cloth', cloth);
    else root.style.removeProperty('--bb-showcase-cloth');
  }

  function describe(swap?: -1 | 1): void {
    const item = current();
    root.dataset.index = String(index);
    root.dataset.count = String(items.length);
    root.dataset.id = item?.book.id ?? '';
    root.dataset.empty = item ? '0' : '1';
    control.setAttribute('aria-label', item ? `${item.book.title}. ${item.action}` : '');
    control.disabled = !item;
    details.show(item ?? null, { index, count: items.length }, swap && !reduced() ? { swap } : undefined);
    rail.mark(index);
    tint();
  }

  /* ---------- moving between books ---------- */

  function go(next: number, goOptions: { immediate?: boolean } = {}): void {
    const target = clampIndex(next, items.length);
    if (target === index || items.length === 0) return;
    const direction = target > index ? 1 : -1;
    index = target;
    travel = goOptions.immediate ? jump(travel, target) : retarget(travel, target, direction, { reduced: reduced() });
    describe(goOptions.immediate ? undefined : direction);
    const item = current();
    if (item) options.onIndex?.(index, item);
    invalidate();
  }

  function move(request: Move): void {
    const target = applyMove(index, items.length, request);
    if (target === index) {
      if (request.type !== 'edge' && items.length > 0) options.onEnd?.(request.by < 0 ? 'first' : 'last');
      return;
    }
    go(target);
  }

  const stepper = createWheelStepper();
  const onWheel = (event: WheelEvent): void => {
    if (event.ctrlKey || event.metaKey) return;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    // Stacked on a narrow screen the page itself scrolls; only the book takes the wheel there.
    if (media(NARROW_QUERY) && !stage.contains(event.target as Node)) return;
    // Past the first or the last book the wheel belongs to the page again.
    const way = event.deltaY > 0 ? 1 : -1;
    if (applyMove(index, items.length, { type: 'step', by: way }) === index) {
      stepper.reset();
      return;
    }
    event.preventDefault();
    const step = stepper.push(event, event.timeStamp || performance.now());
    if (step !== 0) move({ type: 'step', by: step });
  };
  root.addEventListener('wheel', onWheel, { passive: false });

  const typing = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

  const onKey = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || host.hidden || !root.isConnected) return;
    const target = event.target;
    // Keys belong to the showcase while focus is in it, or nowhere in particular.
    const ours = target === document.body || (target instanceof Node && root.contains(target));
    if (!ours || typing(target) || root.closest('[inert]') || document.querySelector('dialog[open]')) return;
    const request = keyToMove(event);
    if (!request) return;
    event.preventDefault();
    move(request);
  };
  document.addEventListener('keydown', onKey);

  /* ---------- the hand on the book ---------- */

  interface Press {
    id: number;
    x: number;
    y: number;
    at: number;
    touch: boolean;
    axis: 'x' | 'y' | null;
    moved: boolean;
    lastX: number;
    lastY: number;
    /** Where the pointer has been lately, newest last, for its speed at the moment it lets go. */
    trail: Array<{ x: number; y: number; at: number }>;
  }
  let press: Press | null = null;

  /** Speed of the hand over its last 80 ms, in px a second. A hand that stopped before letting go has none. */
  function speedOf(done: Press, now: number): { vx: number; vy: number } {
    const recent = done.trail.filter((point) => now - point.at <= RELEASE_WINDOW_MS);
    const first = recent[0];
    const latest = recent[recent.length - 1];
    if (!first || !latest || latest.at - first.at < 8) return { vx: 0, vy: 0 };
    const span = (latest.at - first.at) / 1000;
    return { vx: (latest.x - first.x) / span, vy: (latest.y - first.y) / span };
  }

  /** How far one book travels between its place and the next, in px: the same share `standAt` uses. */
  const slotPx = (): number => Math.max(1, (box?.stageHeight ?? 1) * 0.92);
  let swallowClick = false;

  const centreOf = (): { x: number; y: number } => {
    const rect = control.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' || press) return;
    const centre = centreOf();
    turn = aim(turn, tiltToward(event.clientX - centre.x, event.clientY - centre.y));
    invalidate();
  };
  const onPointerLeave = (): void => {
    turn = aim(turn, { yaw: 0, pitch: 0 });
    invalidate();
  };
  root.addEventListener('pointermove', onPointerMove, { passive: true });
  root.addEventListener('pointerleave', onPointerLeave, { passive: true });

  const onDown = (event: PointerEvent): void => {
    if (event.button !== 0 || press) return;
    const now = event.timeStamp;
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, at: now, touch: event.pointerType === 'touch', axis: null, moved: false, lastX: event.clientX, lastY: event.clientY, trail: [{ x: event.clientX, y: event.clientY, at: now }] };
    swallowClick = false;
    try {
      control.setPointerCapture(event.pointerId);
    } catch {
      // A pointer that is already gone cannot be captured; the drag simply ends with it.
    }
  };
  const onMove = (event: PointerEvent): void => {
    if (!press || event.pointerId !== press.id) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (!press.moved) {
      if (Math.hypot(dx, dy) < DRAG_SLOP) return;
      press.moved = true;
      // A finger moving up or down asks for another book; sideways it turns the one in view.
      press.axis = press.touch ? (Math.abs(dy) > Math.abs(dx) ? 'y' : 'x') : null;
      if (press.axis !== 'y' && !reduced()) {
        turn = grab(aim(turn, { yaw: 0, pitch: 0 }));
        root.dataset.held = '1';
      }
    }
    const stepX = event.clientX - press.lastX;
    const stepY = event.clientY - press.lastY;
    press.lastX = event.clientX;
    press.lastY = event.clientY;
    press.trail.push({ x: event.clientX, y: event.clientY, at: event.timeStamp });
    if (press.trail.length > 12) press.trail.shift();
    if (press.axis !== 'y') turn = dragBy(turn, stepX, press.touch ? 0 : stepY, box?.width ?? 300);
    // Up and down, the row follows the finger exactly: the next book comes as far as the finger has gone.
    else if (!reduced()) travel = hold(travel, -dy / slotPx(), index > 0 ? index - 1 : null, index < items.length - 1 ? index + 1 : null);
    invalidate();
  };
  const onUp = (event: PointerEvent): void => {
    if (!press || event.pointerId !== press.id) return;
    const done = press;
    press = null;
    delete root.dataset.held;
    if (!done.moved) return;
    swallowClick = true;
    const hand = speedOf(done, event.timeStamp);
    if (done.axis === 'y') {
      const dy = event.clientY - done.y;
      let step = event.type === 'pointercancel' ? 0 : swipeToStep(event.clientX - done.x, dy, event.timeStamp - done.at);
      // Pulled more than half way, the next book has won even without a flick.
      if (step === 0 && event.type !== 'pointercancel' && Math.abs(dy) > slotPx() / 2) step = dy < 0 ? 1 : -1;
      if (!travel.held) {
        if (step !== 0) move({ type: 'step', by: step });
        return;
      }
      const target = clampIndex(index + step, items.length);
      travel = letGo(travel, target, -hand.vy / slotPx());
      if (target !== index) {
        index = target;
        describe(step as -1 | 1);
        const item = current();
        if (item) options.onIndex?.(index, item);
      } else if (step !== 0) options.onEnd?.(step < 0 ? 'first' : 'last');
      invalidate();
      return;
    }
    turn = release(turn, hand.vx, done.touch ? 0 : hand.vy, box?.width ?? 300);
    invalidate();
  };
  const onClick = (event: MouseEvent): void => {
    if (swallowClick) {
      swallowClick = false;
      event.preventDefault();
      return;
    }
    const item = current();
    if (item) options.onRead(item.book.id);
  };
  const onEnter = (): void => {
    hovering = true;
    invalidate();
  };
  const onLeave = (): void => {
    hovering = false;
    invalidate();
  };
  control.addEventListener('pointerdown', onDown);
  control.addEventListener('pointermove', onMove);
  control.addEventListener('pointerup', onUp);
  control.addEventListener('pointercancel', onUp);
  control.addEventListener('click', onClick);
  control.addEventListener('pointerenter', onEnter);
  control.addEventListener('pointerleave', onLeave);
  control.addEventListener('focus', invalidate);
  control.addEventListener('blur', invalidate);

  /* ---------- the two drawings ---------- */

  function use(next: Drawing): void {
    drawing.destroy();
    drawing = next;
    scene.appendChild(next.element);
    next.setLook(look);
    if (box) next.resize(box);
    root.dataset.paint = next.kind;
    paint();
    invalidate();
  }

  function setPaint(next: ShowcasePaint): void {
    wanted = next;
    const mine = ++ticket;
    if (next === 'classic') {
      if (drawing.kind !== 'classic') use(createClassicDrawing());
      return;
    }
    if (drawing.kind === 'studio') return;
    const failed = (reason: string): void => {
      if (!alive || mine !== ticket) return;
      wanted = 'classic';
      if (drawing.kind !== 'classic') use(createClassicDrawing());
      options.onPaintFailure?.(reason);
    };
    const load = options.loadStudio ?? (() => import('./studio'));
    load()
      .then((module) => {
        if (!alive || mine !== ticket || wanted !== 'studio') return;
        use(module.createStudioDrawing({ onFailure: failed }));
      })
      .catch((error: unknown) => failed(error instanceof Error ? error.message : String(error)));
  }

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => measure()) : null;
  observer?.observe(stage);

  drawing.setLook(look);
  root.dataset.paint = 'classic';
  rail.render(
    items.map((item) => item.book.title),
    index,
  );
  describe();
  measure();
  if (options.paint === 'studio') setPaint('studio');

  return {
    element: root,
    get index() {
      return index;
    },
    get paint() {
      return drawing.kind;
    },
    setItems(nextItems, nextIndex) {
      const before = current()?.book.id;
      items = nextItems;
      index = clampIndex(nextIndex ?? index, items.length);
      // Another book stands in view now: it is simply there, nothing travels.
      if (current()?.book.id !== before || travel.target.index !== index) travel = jump(travel, index);
      rail.render(
        items.map((item) => item.book.title),
        index,
      );
      describe();
      paint();
      invalidate();
    },
    show(next, showOptions) {
      go(next, showOptions);
    },
    setLook(next) {
      if (next.variant === look.variant && next.aspect === look.aspect) return;
      look = next;
      drawing.setLook(look);
      drawing.reset();
      tint();
      measure();
      invalidate();
    },
    setPaint,
    refresh() {
      measure();
      tint();
      invalidate();
    },
    focus() {
      control.focus({ preventScroll: true });
    },
    destroy() {
      alive = false;
      ticket++;
      if (queued !== null) cancelAnimationFrame(queued);
      observer?.disconnect();
      document.removeEventListener('keydown', onKey);
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerleave', onPointerLeave);
      drawing.destroy();
      details.destroy();
      rail.destroy();
      root.remove();
    },
  };
}

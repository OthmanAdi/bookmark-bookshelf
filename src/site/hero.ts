import '../showcase/showcase.css';
import { createClassicDrawing } from '../showcase/classic';
import { advanceTurn, aim, anglesOf, createTurn, tiltToward, turning, type Turn } from '../showcase/turn';
import type { BookBox, BookFrame, Drawing, ShowcaseLook } from '../showcase/types';
import type { ShelfItem } from '../shelf/types';

/**
 * The homepage's one large book. It is painted at once with CSS, as a poster. Where WebGL 2 is there and
 * neither reduced motion nor data saving is asked for, the lit drawing is fetched afterwards and the book
 * makes one entrance: it rises and turns into its pose while a strip of light crosses the title once.
 * After that nothing moves by itself; the book only tilts toward the pointer.
 */

export interface HeroOptions {
  item: ShelfItem;
  look: ShowcaseLook;
  /** Whether the lit drawing may be fetched at all. */
  studio: boolean;
  reduced: () => boolean;
}

export interface Hero {
  setLook(look: ShowcaseLook): void;
  /** Which drawing is on the page right now. */
  readonly paint: 'classic' | 'studio';
  destroy(): void;
}

/** How long the entrance takes, and where it starts: turned away by this much and this far below its place. */
export const ENTRANCE_MS = 1350;
export const ENTRANCE_YAW = -62;
export const ENTRANCE_RISE = 0.09;
/** The light strip runs from here to here across the room while the book turns in. */
const LIGHT_FROM = -1;
const LIGHT_TO = 0.33;
/** The lit drawing waits this long after it is built, so its painted faces are ready before it is seen. */
const DRESS_MS = 420;
/** The poster gives way to the lit book over this long. */
const SWAP_MS = 220;

/** Ease-out quint: quick away, long settle. */
export function entranceAt(ms: number): number {
  const t = Math.min(1, Math.max(0, ms / ENTRANCE_MS));
  return 1 - (1 - t) ** 5;
}

/** The book as large as its host allows, with room for its lean, and never wider than the host can turn it in. */
export function fitHero(width: number, height: number, aspect: number): BookBox {
  const ratio = aspect > 0 && Number.isFinite(aspect) ? aspect : 0.68;
  const bookHeight = Math.max(120, Math.min(height * 0.86, (width * 0.6) / ratio));
  return { width: bookHeight * ratio, height: bookHeight, perspective: bookHeight * 4.2, stageWidth: width, stageHeight: height };
}

export function mountHero(host: HTMLElement, options: HeroOptions): Hero {
  const shadow = document.createElement('div');
  shadow.className = 'bb-showcase__shadow';
  const scene = document.createElement('div');
  scene.className = 'bb-showcase__scene';
  host.replaceChildren(shadow, scene);

  let look = options.look;
  let box: BookBox | null = null;
  let turn: Turn = createTurn();
  let poster: Drawing | null = createClassicDrawing();
  let lit: Drawing | null = null;
  /** When the entrance began, or null before it and after it. */
  let entered: number | null = null;
  let arrived = false;
  let queued: number | null = null;
  let last = 0;
  let alive = true;
  let onScreen = true;
  const timers: Array<ReturnType<typeof setTimeout>> = [];

  poster.setLook(look);
  scene.appendChild(poster.element);

  function invalidate(): void {
    if (queued !== null || !alive || !onScreen) return;
    queued = requestAnimationFrame(frame);
  }

  function frameOf(progress: number): BookFrame {
    const angles = options.reduced() ? { yaw: 0, pitch: 0 } : anglesOf(turn);
    const away = 1 - progress;
    return {
      index: 0,
      item: options.item,
      stand: { y: ENTRANCE_RISE * away, back: 0, yaw: ENTRANCE_YAW * away, pitch: 0, roll: 0 },
      turn: angles,
      opacity: 1,
      peek: 0,
      target: true,
    };
  }

  function frame(now: number): void {
    queued = null;
    if (!alive) return;
    const dt = last === 0 ? 0 : Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    turn = advanceTurn(turn, dt);
    let progress = 1;
    if (entered !== null) {
      progress = entranceAt(now - entered);
      lit?.setPointer(LIGHT_FROM + (LIGHT_TO - LIGHT_FROM) * progress, 0);
      if (now - entered >= ENTRANCE_MS) {
        entered = null;
        arrived = true;
        host.dataset.arrived = '1';
      }
    }
    draw(progress);
    if (entered !== null || (!options.reduced() && turning(turn))) invalidate();
    else last = 0;
  }

  function draw(progress: number): void {
    if (!box) return;
    // Before its entrance the lit book waits out of sight at its starting pose; the poster stands at rest.
    if (lit) lit.draw([frameOf(arrived || entered !== null ? progress : 0)]);
    if (poster) poster.draw([frameOf(1)]);
    shadow.style.opacity = (progress * progress).toFixed(3);
  }

  function measure(): void {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width <= 0 || height <= 0) return;
    box = fitHero(width, height, look.aspect);
    host.style.setProperty('--bb-book-w', `${box.width}px`);
    host.style.setProperty('--bb-book-h', `${box.height}px`);
    poster?.resize(box);
    lit?.resize(box);
    draw(1);
  }

  /** The lit drawing is built out of sight, dressed, and then makes its entrance as the poster leaves. */
  function bringStudio(): void {
    import('../showcase/studio')
      .then((module) => {
        if (!alive || options.reduced()) return;
        const drawing = module.createStudioDrawing({ onFailure: () => dropStudio() });
        lit = drawing;
        drawing.element.style.opacity = '0';
        drawing.element.style.transition = `opacity ${SWAP_MS}ms ease`;
        scene.appendChild(drawing.element);
        drawing.setLook(look);
        if (box) drawing.resize(box);
        drawing.setPointer(LIGHT_FROM, 0);
        draw(1);
        timers.push(
          setTimeout(() => {
            if (!alive || lit !== drawing) return;
            entered = performance.now();
            drawing.element.style.opacity = '1';
            host.dataset.paint = 'studio';
            if (poster) {
              poster.element.style.transition = `opacity ${SWAP_MS}ms ease`;
              poster.element.style.opacity = '0';
            }
            timers.push(
              setTimeout(() => {
                poster?.destroy();
                poster = null;
              }, SWAP_MS + 40),
            );
            invalidate();
          }, DRESS_MS),
        );
      })
      .catch(() => dropStudio());
  }

  /** Without the lit drawing the poster simply stays: it is a whole book already. */
  function dropStudio(): void {
    if (!alive) return;
    lit?.destroy();
    lit = null;
    entered = null;
    arrived = true;
    if (!poster) {
      poster = createClassicDrawing();
      poster.setLook(look);
      if (box) poster.resize(box);
      scene.appendChild(poster.element);
    }
    poster.element.style.opacity = '1';
    host.dataset.paint = 'classic';
    draw(1);
  }

  const onPointer = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' || options.reduced() || entered !== null) return;
    const rect = host.getBoundingClientRect();
    turn = aim(turn, tiltToward(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2)));
    invalidate();
  };
  window.addEventListener('pointermove', onPointer, { passive: true });

  const resizer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => measure()) : null;
  resizer?.observe(host);
  // Out of sight, no frame is drawn at all.
  const watcher =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
          onScreen = entries.some((entry) => entry.isIntersecting);
          if (onScreen && (entered !== null || turning(turn))) invalidate();
        })
      : null;
  watcher?.observe(host);

  host.dataset.paint = 'classic';
  measure();
  if (options.studio && !options.reduced()) timers.push(setTimeout(bringStudio, 0));

  return {
    setLook(next) {
      look = next;
      for (const drawing of [poster, lit]) {
        if (!drawing) continue;
        drawing.setLook(look);
        drawing.reset();
      }
      measure();
    },
    get paint() {
      return lit && !poster ? 'studio' : 'classic';
    },
    destroy() {
      alive = false;
      if (queued !== null) cancelAnimationFrame(queued);
      for (const timer of timers) clearTimeout(timer);
      window.removeEventListener('pointermove', onPointer);
      resizer?.disconnect();
      watcher?.disconnect();
      poster?.destroy();
      lit?.destroy();
      host.replaceChildren();
    },
  };
}

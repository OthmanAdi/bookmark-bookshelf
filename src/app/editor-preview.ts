import type { ShelfItem } from '../shelf';
import { createClassicDrawing } from '../showcase/classic';
import type { BookBox, BookFrame, Drawing, ShowcaseLook } from '../showcase/types';

/**
 * The small book in the editor: one link's cover as it will stand on the shelf, redrawn on every change
 * before anything is saved. It is drawn by the showcase's own drawings, so it is the same book: the CSS
 * one at once, and the lit WebGL one when the shelf is drawn in Studio. Studio is loaded only then, holds
 * one WebGL context, and gives it back when the dialog closes.
 *
 * A cover leaves its title out when it is drawn very small, as the volumes behind the front one do. The
 * small book is therefore drawn at twice its size on a plate that is shown at half size: it keeps its
 * title and its source line, and the lit one is the sharper for it.
 *
 * The book turns once, slowly, when a choice changes, so the light crosses the material, and leans
 * toward a pointer held over it. At rest nothing is drawn, and under reduced motion nothing moves.
 */

export type PreviewState =
  /** The CSS book, and no lit one was asked for. */
  | 'classic'
  /** The CSS book, while Studio loads. */
  | 'preparing'
  /** The lit book. */
  | 'studio'
  /** The CSS book, because Studio could not start or lost WebGL. */
  | 'stopped';

interface StudioModule {
  createStudioDrawing(options: { onFailure(reason: string): void }): Drawing;
}

export interface EditorPreviewOptions {
  /** Where the book stands. */
  stage: HTMLElement;
  /** The look the page is in. */
  look(): ShowcaseLook;
  /** True when nothing may move. */
  reduced(): boolean;
  /** Told whenever what is shown changes, so the words beside the book can say it. */
  onState?(state: PreviewState): void;
  /** Stands in for the lazy import in tests. */
  loadStudio?: () => Promise<StudioModule>;
}

export interface EditorPreview {
  readonly state: PreviewState;
  /** Shows the CSS book at once. With `lit`, loads the WebGL book and puts it in its place when it is ready. */
  open(lit: boolean): void;
  /** Draws this item from now on. With `turn`, the book turns once so the light shows what changed. */
  show(item: ShelfItem, turn?: boolean): void;
  /** Takes the book away and gives back what it held. */
  close(): void;
}

const AT_REST = { y: 0, back: 0, yaw: 0, pitch: 0, roll: 0 } as const;
/** How much larger than shown the book is drawn. The plate's style shows it at one over this. */
export const PREVIEW_SCALE = 2;
/** The height of the book as shown, in px: about this at most and at least. */
const TALLEST = 160;
const SHORTEST = 112;
/** The turn after a change: this far toward the viewer and back, once. */
const TURN_DEG = 20;
const TURN_MS = 2200;
/** The lean toward a pointer over the book. */
const LEAN_YAW = 14;
const LEAN_PITCH = 6;
/** How quickly the lean follows the pointer, per second. */
const FOLLOW = 9;

export function createEditorPreview(options: EditorPreviewOptions): EditorPreview {
  const { stage } = options;
  const plate = document.createElement('div');
  plate.className = 'bb-look__plate';
  stage.appendChild(plate);
  let drawing: Drawing | null = null;
  let item: ShelfItem | null = null;
  let state: PreviewState = 'classic';
  /** Goes up whenever what was asked for changes, so a Studio that arrives late knows it is not wanted. */
  let ticket = 0;
  let frame: number | null = null;
  let last = 0;
  let turnFrom: number | null = null;
  let turned = 0;
  const lean = { yaw: 0, pitch: 0 };
  const goal = { yaw: 0, pitch: 0 };

  function setState(next: PreviewState): void {
    state = next;
    stage.dataset.preview = next;
    options.onState?.(next);
  }

  function box(): BookBox {
    const width = stage.clientWidth || 152;
    const height = stage.clientHeight || 184;
    const { aspect } = options.look();
    const ratio = aspect > 0 && Number.isFinite(aspect) ? aspect : 0.68;
    const shown = Math.max(SHORTEST, Math.min(TALLEST, height * 0.8, (width * 0.62) / ratio));
    const bookHeight = shown * PREVIEW_SCALE;
    return {
      width: bookHeight * ratio,
      height: bookHeight,
      perspective: bookHeight * 4.2,
      stageWidth: width * PREVIEW_SCALE,
      stageHeight: height * PREVIEW_SCALE,
    };
  }

  function draw(): void {
    if (!drawing || !item) return;
    const frames: BookFrame[] = [
      { index: 0, item, stand: AT_REST, turn: { yaw: lean.yaw + turned, pitch: lean.pitch }, opacity: 1, peek: 0, target: true },
    ];
    drawing.draw(frames);
  }

  function tick(now: number): void {
    frame = null;
    const seconds = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const share = 1 - Math.exp(-FOLLOW * seconds);
    lean.yaw += (goal.yaw - lean.yaw) * share;
    lean.pitch += (goal.pitch - lean.pitch) * share;
    turned = 0;
    if (turnFrom !== null) {
      const through = (now - turnFrom) / TURN_MS;
      if (through >= 1) turnFrom = null;
      else turned = -TURN_DEG * Math.sin(Math.PI * through);
    }
    draw();
    if (turnFrom !== null || Math.abs(goal.yaw - lean.yaw) > 0.05 || Math.abs(goal.pitch - lean.pitch) > 0.05) request();
  }

  function request(): void {
    if (frame !== null || !drawing) return;
    frame = requestAnimationFrame(tick);
  }

  function still(): void {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    turnFrom = null;
    turned = 0;
    lean.yaw = lean.pitch = goal.yaw = goal.pitch = 0;
  }

  /** Gives a drawing's WebGL context back at once instead of leaving it to the garbage collector. */
  function retire(old: Drawing): void {
    const canvas = old.kind === 'studio' ? old.element.querySelector('canvas') : null;
    old.destroy();
    try {
      canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      // Already gone.
    }
  }

  function use(next: Drawing): void {
    const before = drawing;
    drawing = next;
    next.setLook(options.look());
    next.resize(box());
    plate.appendChild(next.element);
    if (before) retire(before);
    draw();
  }

  function stop(): void {
    ticket++;
    if (drawing && drawing.kind !== 'classic') use(createClassicDrawing());
    setState('stopped');
  }

  function prepare(): void {
    const mine = ++ticket;
    setState('preparing');
    const load = options.loadStudio ?? (() => import('../showcase/studio'));
    load()
      .then((module) => {
        if (mine !== ticket || !drawing) return;
        use(
          module.createStudioDrawing({
            onFailure: () => {
              if (mine === ticket) stop();
            },
          }),
        );
        setState('studio');
        if (!options.reduced()) {
          turnFrom = performance.now();
          request();
        }
      })
      .catch(() => {
        if (mine === ticket) stop();
      });
  }

  const onMove = (event: PointerEvent): void => {
    if (!drawing || options.reduced() || event.pointerType === 'touch') return;
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = Math.min(1, Math.max(-1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
    const y = Math.min(1, Math.max(-1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
    goal.yaw = x * LEAN_YAW;
    goal.pitch = -y * LEAN_PITCH;
    drawing.setPointer(x, y);
    request();
  };
  const onLeave = (): void => {
    if (!drawing) return;
    goal.yaw = goal.pitch = 0;
    drawing.setPointer(0, 0);
    if (!options.reduced()) request();
  };
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerleave', onLeave);

  return {
    get state() {
      return state;
    },
    open(lit) {
      ticket++;
      still();
      use(createClassicDrawing());
      setState('classic');
      if (lit) prepare();
    },
    show(next, turn = false) {
      item = next;
      if (!drawing) return;
      draw();
      if (!turn || options.reduced() || turnFrom !== null) return;
      turnFrom = performance.now();
      request();
    },
    close() {
      ticket++;
      still();
      if (drawing) retire(drawing);
      drawing = null;
      item = null;
      delete stage.dataset.preview;
    },
  };
}

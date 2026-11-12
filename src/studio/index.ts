import './studio.css';
import { BoxGeometry, Matrix4, Mesh, MeshStandardMaterial } from 'three';
import type { FrameVolume, ShelfFrame, ShelfHandle } from '../shelf/types';
import { fromCssMatrix, volumeMatrix } from './camera';
import { type DressKit, Dresser } from './dress';
import { Stage, webglAvailable } from './stage';
import { LEAVES, type Opening, VolumeMesh } from './volume';

export type { Binding, Paint, PaintedFace, PaintedVolume, Stamp } from './types';
export { webglAvailable } from './stage';

/**
 * Studio: paints the shelf a second time, in WebGL, with lit materials. The DOM shelf stays and keeps
 * every control, gesture and focus ring; its faces turn transparent and the canvas behind them shows
 * the same volumes at the same places, because the camera repeats the CSS perspective exactly.
 */

export interface StudioOptions {
  /** Materials and painting. Left out, volumes are drawn in plain lit cloth. */
  kit?: DressKit;
  /** Called when WebGL is lost or cannot start; the host should go back to the CSS shelf. */
  onFailure?: (reason: string) => void;
}

export interface StudioHandle {
  readonly canvas: HTMLCanvasElement;
  /** Swaps the materials kit, for example once the full one has loaded. */
  setKit(kit: DressKit): void;
  destroy(): void;
}

/** How long a volume keeps being read from the DOM after a pointer touched it: its CSS reaction runs this long. */
const LIVELY_MS = 900;

/** Seconds the presented volume takes to breathe open under the hand, and to close again. */
const PEEK_OPEN_S = 0.22;
const PEEK_CLOSE_S = 0.16;

/**
 * The presented volume opens a little under the pointer or keyboard focus: the board lifts and the first
 * leaves follow it, each a little less and a little later, their free edges trailing.
 */
export function peekOpening(amount: number): Opening {
  const leaves = Array.from({ length: LEAVES }, (_, index) => {
    const share = Math.max(0, 1 - index / LEAVES);
    const lag = Math.min(1, Math.max(0, amount * (1 + index * 0.18) - index * 0.18 * amount * amount));
    return { angle: 0.34 * share * share * lag, curl: -0.22 * share * lag };
  });
  return { cover: 0.42 * amount, leaves };
}

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const plainKit: DressKit = {
  bindingOf: () => ({ binding: 'cloth', stamp: 'gold' }),
};

export function mountStudio(shelf: ShelfHandle, options: StudioOptions = {}): StudioHandle {
  if (!webglAvailable()) throw new Error('WebGL 2 is not available.');
  const stage = new Stage();
  const canvas = stage.canvas;
  canvas.className = 'bb-studio';
  canvas.setAttribute('aria-hidden', 'true');
  const root = shelf.element;
  root.dataset.paint = 'studio';

  const meshes = new Map<number, VolumeMesh>();
  const bookendMaterial = new MeshStandardMaterial({ color: '#4b4842', roughness: 0.45, metalness: 0.35 });
  const bookendGeometry = new BoxGeometry(1, 1, 1);
  bookendGeometry.translate(0, 0.5, -0.5);
  const bookends = [new Mesh(bookendGeometry, bookendMaterial), new Mesh(bookendGeometry, bookendMaterial)];
  for (const bookend of bookends) {
    bookend.castShadow = true;
    bookend.receiveShadow = true;
    bookend.visible = false;
    stage.row.add(bookend);
  }

  let frame: ShelfFrame | null = null;
  let variant = '';
  let queued: number | null = null;
  let alive = true;
  let drawn = 0;
  const lively = new Map<Element, number>();
  /** How far each slot's volume stands open under the hand, 0 to 1, and when that was last stepped. */
  const peeks = new Map<number, number>();
  let peekAt = performance.now();
  let hovered: Element | null = null;
  const matrix = new Matrix4();
  const body = new Matrix4();
  const dresser = new Dresser(options.kit ?? plainKit, () => invalidate());

  const fail = (reason: string) => {
    if (!alive) return;
    options.onFailure?.(reason);
  };
  const onLost = (event: Event) => {
    event.preventDefault();
    fail('The WebGL context was lost.');
  };
  canvas.addEventListener('webglcontextlost', onLost);

  function invalidate(): void {
    if (queued !== null || !alive) return;
    queued = requestAnimationFrame(draw);
  }

  /** Detail of the painted faces: more for a large shelf on a sharp screen, never more than the canvas shows. */
  function density(volume: FrameVolume): number {
    const screen = Math.min(2, window.devicePixelRatio || 1);
    return volume.weight > 0 || volume.centre ? Math.min(2.5, screen * 1.25) : screen;
  }

  function draw(): void {
    queued = null;
    if (!frame || !alive) return;
    const current = frame;
    if (current.scene !== canvas.parentElement) placeCanvas(current.scene);
    if (current.variant !== variant) {
      variant = current.variant;
      stage.setRoom(variant);
      dresser.clear();
    }
    let deepest = 0;
    for (const volume of current.volumes) deepest = Math.max(deepest, volume.coverWidth);
    stage.fit(current, deepest);
    const origin = { x: current.rowGive, y: current.floorY - current.height / 2 };
    const now = performance.now();
    const elapsed = Math.min(0.05, Math.max(0, (now - peekAt) / 1000));
    peekAt = now;
    const still = reducedMotion();
    let moving = false;
    const seen = new Set<number>();
    for (const volume of current.volumes) {
      seen.add(volume.slot);
      let mesh = meshes.get(volume.slot);
      if (!mesh) {
        mesh = new VolumeMesh();
        meshes.set(volume.slot, mesh);
        stage.row.add(mesh.group);
      }
      mesh.setSize(volume);
      mesh.setParts(dresser.partsFor(volume, variant, density(volume)));
      const progress = volume.item.done ? 0 : Math.min(1, Math.max(0, volume.item.progress ?? 0));
      mesh.setSlip(progress, dresser.slipMaterial);
      volumeMatrix(volume, origin, matrix);
      // A volume reacting to the pointer (rising, tipping, pressed) moves its body by CSS; follow it.
      const until = lively.get(volume.element);
      const reacting = until !== undefined && until > now;
      const arriving = volume.element.classList.contains('is-rising') || volume.element.classList.contains('is-arriving');
      if (reacting || arriving) {
        const bodyElement = volume.element.querySelector<HTMLElement>('.bb-book__body');
        const transform = bodyElement ? getComputedStyle(bodyElement).transform : 'none';
        if (transform && transform !== 'none') matrix.multiply(fromCssMatrix(new DOMMatrixReadOnly(transform), body));
        moving = true;
      } else if (until !== undefined) lively.delete(volume.element);
      // The presented volume breathes open while the hand rests on it, as the CSS one lifts.
      const wanted =
        !still && current.open === 0 && volume.centre && volume.weight > 0.98 && (hovered === volume.element || ringed(volume.element)) ? 1 : 0;
      const was = peeks.get(volume.slot) ?? 0;
      if (wanted !== was) {
        const pace = wanted > was ? PEEK_OPEN_S : PEEK_CLOSE_S;
        let next = was + (wanted - was) * (1 - Math.exp(-elapsed / (pace / 3)));
        if (Math.abs(wanted - next) < 0.002) next = wanted;
        if (next === 0) peeks.delete(volume.slot);
        else peeks.set(volume.slot, next);
        moving = true;
      }
      mesh.setOpening(was > 0 || wanted > 0 ? peekOpening(peeks.get(volume.slot) ?? 0) : null);
      mesh.group.matrix.copy(matrix);
      mesh.group.matrixWorldNeedsUpdate = true;
      mesh.group.visible = !volume.hidden;
    }
    for (const [slot, mesh] of meshes) {
      if (seen.has(slot)) continue;
      stage.row.remove(mesh.group);
      mesh.dispose();
      meshes.delete(slot);
    }
    bookends.forEach((bookend, index) => {
      const end = current.bookends[index];
      bookend.visible = end !== undefined;
      if (!end) return;
      bookend.scale.set(end.width, end.height, end.depth);
      bookend.position.set(origin.x + end.x, origin.y, 0);
    });
    stage.render();
    // What was drawn, for tests and for anyone checking Studio in the inspector.
    drawn++;
    canvas.dataset.drawn = String(drawn);
    canvas.dataset.volumes = String(current.volumes.filter((volume) => !volume.hidden).length);
    if (moving) invalidate();
  }

  function placeCanvas(scene: HTMLElement): void {
    const row = scene.querySelector('.bb-shelf__row');
    scene.insertBefore(canvas, row);
  }

  const stopFrames = shelf.onFrame((next) => {
    frame = next;
    invalidate();
  });

  // The light leans toward the pointer, so moving over the shelf moves the reflections on the covers.
  const scene = shelf.surface;
  const onMove = (event: PointerEvent) => {
    const box = scene.getBoundingClientRect();
    stage.setPointer(((event.clientX - box.left) / Math.max(1, box.width)) * 2 - 1, ((event.clientY - box.top) / Math.max(1, box.height)) * 2 - 1);
    invalidate();
  };
  const onTouch = (event: Event) => {
    const book = (event.target as Element | null)?.closest?.('.bb-book') ?? null;
    if (book) lively.set(book, performance.now() + LIVELY_MS);
    if (event.type === 'pointerover') hovered = book;
    else if (event.type === 'pointerout' && book === hovered) {
      const into = (event as PointerEvent).relatedTarget as Element | null;
      if (!into || into.closest?.('.bb-book') !== book) hovered = null;
    }
    invalidate();
  };
  const ringed = (element: HTMLElement): boolean => element.querySelector('.bb-book__control:focus-visible') !== null;
  window.addEventListener('pointermove', onMove, { passive: true });
  const reactions = ['pointerover', 'pointerout', 'pointerdown', 'pointerup', 'focusin', 'focusout'] as const;
  for (const type of reactions) scene.addEventListener(type, onTouch, { passive: true });

  return {
    canvas,
    setKit(kit) {
      dresser.setKit(kit);
      invalidate();
    },
    destroy() {
      alive = false;
      if (queued !== null) cancelAnimationFrame(queued);
      stopFrames();
      window.removeEventListener('pointermove', onMove);
      for (const type of reactions) scene.removeEventListener(type, onTouch);
      canvas.removeEventListener('webglcontextlost', onLost);
      for (const mesh of meshes.values()) mesh.dispose();
      meshes.clear();
      bookendGeometry.dispose();
      bookendMaterial.dispose();
      dresser.dispose();
      stage.dispose();
      delete root.dataset.paint;
    },
  };
}

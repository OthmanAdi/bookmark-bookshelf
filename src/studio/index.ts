import './studio.css';
import { BoxGeometry, Matrix4, Mesh, MeshStandardMaterial } from 'three';
import type { FrameVolume, ShelfFrame, ShelfHandle } from '../shelf/types';
import { fromCssMatrix, volumeMatrix } from './camera';
import { type DressKit, Dresser } from './dress';
import { Stage, webglAvailable } from './stage';
import { VolumeMesh } from './volume';

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
  const lively = new Map<Element, number>();
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
    const book = (event.target as Element | null)?.closest?.('.bb-book');
    if (book) lively.set(book, performance.now() + LIVELY_MS);
    invalidate();
  };
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

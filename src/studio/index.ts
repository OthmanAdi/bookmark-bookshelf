import './studio.css';
import { BoxGeometry, Matrix4, Mesh, MeshStandardMaterial } from 'three';
import type { Flight, FlightOptions } from '../app/flight';
import type { FrameVolume, ShelfFrame, ShelfHandle } from '../shelf/types';
import { fromCssMatrix, volumeMatrix } from './camera';
import { type DressKit, Dresser } from './dress';
import { Stage, webglAvailable } from './stage';
import { type FlightBook, FlightStage } from './flight';
import { leafTangent } from './leaf';
import { arrivalAt, ARRIVE_MS, isShut, layer, PEEK_COVER, PEEK_REST_MS, peekAt, shut } from './riffle';
import { type Opening, VolumeMesh } from './volume';

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
  /**
   * Carries the volume `id` from the row to its place beside the page as the lit volume itself, pages and
   * all, in a canvas above everything. It takes what the CSS flight takes and gives back the same handle:
   * `set(time)` with 0 on the shelf and 1 landed, and `destroy()`. It lands as the flat cover it was given,
   * in the same box. Throws when it cannot fly (the volume is not drawn, WebGL is gone); the caller then
   * flies the CSS cover.
   */
  createFlight(options: FlightOptions, id: string): Flight;
  destroy(): void;
}

/** How long a volume keeps being read from the DOM after a pointer touched it: its CSS reaction runs this long. */
const LIVELY_MS = 900;

/** Nearer the centre than this, a volume counts as presented: it has arrived. */
const PRESENTED = 0.98;

/** How far an open volume turns its fore-edge toward the viewer, in radians, when its board stands fully open. */
const SHOW_TURN = 0.3;

/** A volume opening or closing under the hand: which way, since when, and how it stood at that moment. */
interface Peek {
  open: boolean;
  since: number;
  from: Opening;
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
  /** Volumes that stand open under the hand or are closing again, by slot. The page motion itself is in riffle.ts. */
  const peeks = new Map<number, Peek>();
  /** Volumes whose pages flutter because they have just arrived at the centre, by slot. */
  const arrivals = new Map<number, { since: number; steps: number }>();
  /** The volume that was last presented, to tell an arrival from a volume that simply stands there. */
  let home: { id: string; slot: number } | null = null;
  let hovered: Element | null = null;
  const matrix = new Matrix4();
  const body = new Matrix4();
  const dresser = new Dresser(options.kit ?? plainKit, () => invalidate());
  /** The canvas a volume flies in, made for the first flight and kept for the next. */
  let flights: FlightStage | null = null;

  function flightStage(): FlightStage {
    if (flights && !flights.usable) {
      flights.dispose();
      flights = null;
    }
    flights ??= new FlightStage();
    return flights;
  }

  /** A volume as the flight draws it: with the same materials as in the row, so nothing changes when it leaves. */
  function bookOf(volume: FrameVolume): FlightBook {
    const detail = density(volume);
    const look = variant;
    const id = volume.id;
    return {
      size: { spineWidth: volume.spineWidth, bookHeight: volume.bookHeight, coverWidth: volume.coverWidth },
      variant: look,
      environment: stage.scene.environment,
      parts: () => dresser.partsFor(frame?.volumes.find((entry) => entry.id === id) ?? volume, look, detail),
    };
  }

  /** When there is time, the presented volume is drawn once in the flight canvas, so a flight starts without a hitch. */
  let warming: number | null = null;
  function warmFlight(): void {
    if (warming !== null || !alive) return;
    warming = window.setTimeout(() => {
      warming = null;
      const presented = frame?.volumes.find((entry) => entry.centre && !entry.hidden);
      if (!alive || !presented || frame?.open !== 0) return;
      try {
        flightStage().warm(bookOf(presented));
      } catch {
        // A flight that cannot be prepared falls back to the CSS cover when it is asked for.
      }
    }, 240);
  }

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
      const presented = current.open === 0 && volume.centre && volume.weight > PRESENTED && !volume.hidden;
      // A volume that reaches the centre from another place lets its pages run on for a moment.
      if (presented && (home?.id !== volume.id || home.slot !== volume.slot)) {
        const moved = home !== null && current.volumes.some((other) => other.id === home?.id);
        if (moved && !still && home) arrivals.set(volume.slot, { since: now, steps: Math.max(1, Math.abs(volume.slot - home.slot)) });
        home = { id: volume.id, slot: volume.slot };
        warmFlight();
      }
      const arrival = arrivals.get(volume.slot);
      let flutter: Opening | null = null;
      if (arrival) {
        if (!presented || still || now - arrival.since >= ARRIVE_MS) arrivals.delete(volume.slot);
        else {
          flutter = arrivalAt(now - arrival.since, arrival.steps);
          moving = true;
        }
      }
      // The presented volume opens while the hand rests on it, as the CSS one lifts, and closes when it leaves.
      const wanted = !still && presented && (hovered === volume.element || ringed(volume.element));
      let peek = peeks.get(volume.slot);
      if (!peek && wanted) {
        peek = { open: true, since: now, from: shut() };
        peeks.set(volume.slot, peek);
      } else if (peek && peek.open !== wanted) {
        peek.from = peekAt(now - peek.since, peek.open, peek.from);
        peek.open = wanted;
        peek.since = now;
      }
      let opening: Opening | null = null;
      if (peek) {
        const age = now - peek.since;
        if (!peek.open && (age >= PEEK_REST_MS || still)) peeks.delete(volume.slot);
        else {
          opening = peekAt(age, peek.open, peek.from);
          if (age < PEEK_REST_MS) moving = true;
        }
      }
      if (flutter) opening = opening ? layer(opening, flutter) : flutter;
      const shown = opening && !isShut(opening) ? opening : null;
      mesh.setOpening(shown);
      // An open volume turns its fore-edge a little toward the viewer, or the board would hide its own pages.
      if (shown) matrix.multiply(body.makeRotationY(-SHOW_TURN * Math.min(1, shown.cover / PEEK_COVER)));
      if (presented) {
        canvas.dataset.cover = shown ? ((shown.cover * 180) / Math.PI).toFixed(2) : '0';
        canvas.dataset.edge = shown ? ((leafTangent(shown.leaves[0]!, 1) * 180) / Math.PI).toFixed(2) : '0';
      }
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
    createFlight(flightOptions, id) {
      const volume = frame?.volumes.find((entry) => entry.id === id && entry.centre) ?? frame?.volumes.find((entry) => entry.id === id);
      if (!alive || !volume) throw new Error('Studio has not drawn this volume.');
      return flightStage().fly(flightOptions, bookOf(volume));
    },
    destroy() {
      alive = false;
      if (warming !== null) clearTimeout(warming);
      flights?.dispose();
      flights = null;
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

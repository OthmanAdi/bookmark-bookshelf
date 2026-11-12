import { CanvasTexture, Matrix4, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, SRGBColorSpace } from 'three';
import { resolveCloth } from '../shelf/variants';
import type { FrameVolume, ShelfFrame, ShelfItem } from '../shelf/types';
import { peekOpening } from '../studio';
import { type DressKit, Dresser } from '../studio/dress';
import { paintVolume } from '../studio/paint';
import { Stage, webglAvailable } from '../studio/stage';
import { VolumeMesh } from '../studio/volume';
import { type BookBox, type BookFrame, type Drawing, REST, type ShowcaseLook, thicknessShare } from './types';

/**
 * The Studio drawing: the same book as a lit solid in WebGL, built from Studio's own parts. A Stage
 * gives renderer, camera and the light of the look, a VolumeMesh the boards, spine and leaves, and a
 * Dresser the materials. It is loaded only when Studio is asked for.
 */

const DEG = Math.PI / 180;
/** Solids kept at most, in view or not. */
const KEEP = 6;

/**
 * The kit the showcase dresses with until Studio's full materials kit is passed in: the painter's faces
 * as printed cloth, matt, with no foil. Titles and drawings are there; the shine is the full kit's work.
 */
export const printedKit: DressKit = {
  bindingOf: () => ({ binding: 'cloth', stamp: 'ink' }),
  paint: (request) =>
    paintVolume({
      item: request.volume.item,
      source: request.volume.element,
      size: request.size,
      binding: request.binding,
      stamp: request.stamp,
      density: request.density,
    }),
  materials(_volume, style, _binding, _stamp, faces) {
    const textures = [faces.front.color, faces.spine.color, faces.back.color].map((canvas) => {
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 8;
      return texture;
    });
    const printed = textures.map((map) => new MeshPhysicalMaterial({ map, roughness: 0.74, sheen: 0.55, sheenRoughness: 0.55, sheenColor: style.cloth }));
    const edge = new MeshPhysicalMaterial({ color: style.cloth, roughness: 0.78, sheen: 0.5, sheenRoughness: 0.6, sheenColor: style.cloth });
    const pages = new MeshStandardMaterial({ color: '#efe6d2', roughness: 0.92 });
    const endpaper = new MeshStandardMaterial({ color: '#e8dfcc', roughness: 0.9 });
    return {
      front: printed[0]!,
      spine: printed[1]!,
      back: printed[2]!,
      boardEdge: edge,
      pages,
      endpaper,
      dispose() {
        for (const texture of textures) texture.dispose();
        for (const material of [...printed, edge, pages, endpaper]) material.dispose();
      },
    };
  },
};

export interface StudioDrawingOptions {
  /** Materials and painting. Left out, books are dressed with `printedKit`. */
  kit?: DressKit;
  onFailure(reason: string): void;
}

interface Stood {
  mesh: VolumeMesh;
  /** Stands in for the volume's element on a shelf: the painter and the dresser read the cloth from it. */
  source: HTMLElement;
  item: ShelfItem;
}

export function createStudioDrawing(options: StudioDrawingOptions): Drawing {
  if (!webglAvailable()) throw new Error('WebGL 2 is not available.');
  const element = document.createElement('div');
  element.className = 'bb-showcase__studio';
  const sources = document.createElement('ul');
  sources.hidden = true;
  element.appendChild(sources);

  const stage = new Stage();
  const canvas = stage.canvas;
  canvas.setAttribute('aria-hidden', 'true');
  element.appendChild(canvas);
  // The showcase has no board: the book stands in the air over a shadow the page draws.
  const noBoard = new MeshBasicMaterial({ visible: false });
  stage.setBoardMaterial(noBoard);

  const books = new Map<number, Stood>();
  let look: ShowcaseLook = { variant: 'paper', aspect: 0.68 };
  let box: BookBox | null = null;
  let frames: readonly BookFrame[] = [];
  let alive = true;
  let queued: number | null = null;
  let drawn = 0;
  const dresser = new Dresser(options.kit ?? printedKit, () => schedule());
  const matrix = new Matrix4();
  const part = new Matrix4();

  const onLost = (event: Event): void => {
    event.preventDefault();
    if (alive) options.onFailure('The WebGL context was lost.');
  };
  canvas.addEventListener('webglcontextlost', onLost);

  /** Materials arrive later than the frame that asked for them: draw that frame again. */
  function schedule(): void {
    if (queued !== null || !alive) return;
    queued = requestAnimationFrame(() => {
      queued = null;
      render();
    });
  }

  function sizeOf(item: ShelfItem, bookBox: BookBox): { spineWidth: number; bookHeight: number; coverWidth: number } {
    return { spineWidth: bookBox.width * thicknessShare(item.thickness), bookHeight: bookBox.height, coverWidth: bookBox.width };
  }

  function fit(bookBox: BookBox): void {
    const frame: ShelfFrame = {
      scene: element,
      width: bookBox.stageWidth,
      height: bookBox.stageHeight,
      // The light of a look is set against the floor a row stands on: here, the foot of the book.
      floorY: bookBox.stageHeight / 2 - bookBox.height / 2,
      perspective: bookBox.perspective,
      rowGive: 0,
      volumes: [],
      bookends: [],
      light: { x: -0.42, z: 0.91, ambient: 0.5, tint: '#000' },
      lampX: 0,
      open: 0,
      variant: look.variant,
    };
    stage.fit(frame, bookBox.width * 0.4);
  }

  function render(): void {
    if (!alive || !box) return;
    const bookBox = box;
    fit(bookBox);
    // Two books in one place are a crossfade: the canvas dips and the nearer one is drawn.
    const fading = frames.length > 1 && frames.every((frame) => frame.stand.y === 0);
    const strongest = frames.reduce((most, frame) => Math.max(most, frame.opacity), 0);
    element.style.opacity = fading ? Math.abs(strongest * 2 - 1).toFixed(3) : '1';
    const density = Math.min(2.5, Math.min(2, window.devicePixelRatio || 1) * 1.25);
    const seen = new Set<number>();
    for (const frame of frames) {
      if (fading && frame.opacity < strongest) continue;
      if (frame.opacity <= 0.01) continue;
      seen.add(frame.index);
      let stood = books.get(frame.index);
      if (!stood || stood.item !== frame.item) {
        if (stood) drop(stood);
        const source = document.createElement('li');
        source.className = `bb-book bb-cloth--${resolveCloth(frame.item.cloth)}`;
        sources.appendChild(source);
        stood = { mesh: new VolumeMesh(), source, item: frame.item };
        books.set(frame.index, stood);
        stage.row.add(stood.mesh.group);
      }
      const size = sizeOf(frame.item, bookBox);
      const volume: FrameVolume = {
        id: frame.item.id,
        index: frame.index,
        slot: frame.index,
        item: frame.item,
        element: stood.source,
        ...size,
        x: 0,
        corner: 0,
        lean: 0,
        tilt: 0,
        angle: 90,
        lift: 0,
        z: 0,
        weight: 1,
        centre: frame.target,
        hidden: false,
      };
      const { mesh } = stood;
      mesh.setSize(size);
      mesh.setParts(dresser.partsFor(volume, look.variant, density));
      const progress = frame.item.done ? 0 : Math.min(1, Math.max(0, frame.item.progress ?? 0));
      mesh.setSlip(progress, dresser.slipMaterial);
      mesh.setOpening(frame.peek > 0 ? peekOpening(frame.peek) : null);

      const yaw = (REST.yaw + frame.stand.yaw + frame.turn.yaw) * DEG;
      const pitch = (REST.pitch + frame.stand.pitch + frame.turn.pitch) * DEG;
      const roll = (REST.roll + frame.stand.roll) * DEG;
      // CSS has y down and turns clockwise: the same pose here takes the opposite sign for tip and roll.
      matrix.makeTranslation(0, -frame.stand.y * bookBox.stageHeight, -frame.stand.back * bookBox.stageHeight);
      matrix.multiply(part.makeRotationZ(-roll));
      matrix.multiply(part.makeRotationX(-pitch));
      matrix.multiply(part.makeRotationY(yaw));
      // A volume's own space has its spine toward the viewer and its foot at the origin: turn the front
      // board to the viewer and bring the middle of the book to the origin, so it turns about its middle.
      matrix.multiply(part.makeRotationY(-Math.PI / 2));
      matrix.multiply(part.makeTranslation(0, -size.bookHeight / 2, size.coverWidth / 2));
      mesh.group.matrix.copy(matrix);
      mesh.group.matrixWorldNeedsUpdate = true;
      mesh.group.visible = true;
    }
    for (const [index, stood] of books) {
      if (seen.has(index)) continue;
      // A book just out of view keeps its solid for the way back; older ones are dropped.
      stood.mesh.group.visible = false;
      if (books.size > KEEP) {
        drop(stood);
        books.delete(index);
      }
    }
    stage.render();
    drawn++;
    canvas.dataset.drawn = String(drawn);
    canvas.dataset.volumes = String(seen.size);
  }

  function drop(stood: Stood): void {
    stage.row.remove(stood.mesh.group);
    stood.mesh.dispose();
    stood.source.remove();
  }

  function clear(): void {
    for (const stood of books.values()) drop(stood);
    books.clear();
  }

  return {
    kind: 'studio',
    element,
    setLook(next) {
      const changed = next.variant !== look.variant;
      look = next;
      stage.setRoom(look.variant);
      if (changed) dresser.clear();
    },
    resize(next) {
      box = next;
    },
    setPointer(x, y) {
      stage.setPointer(x, y);
    },
    draw(next) {
      frames = next;
      render();
    },
    reset() {
      clear();
      dresser.clear();
    },
    destroy() {
      alive = false;
      if (queued !== null) cancelAnimationFrame(queued);
      canvas.removeEventListener('webglcontextlost', onLost);
      clear();
      dresser.dispose();
      noBoard.dispose();
      stage.dispose();
      element.remove();
    },
  };
}

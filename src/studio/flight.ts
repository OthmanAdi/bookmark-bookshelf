import {
  ACESFilmicToneMapping,
  DirectionalLight,
  HemisphereLight,
  Matrix4,
  NeutralToneMapping,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  type Texture,
  WebGLRenderer,
} from 'three';
import { createFlight as createCarriedCover, flightPose, type Flight, type FlightOptions } from '../app/flight';
import { leafTangent } from './leaf';
import { FLIGHT_COVER, flightOpening } from './riffle';
import { roomOf } from './stage';
import { type VolumeParts, type VolumeSize, VolumeMesh } from './volume';

/**
 * The flight of a volume in Studio: the lit volume itself, with its board and leaves, carried from the row
 * to its place beside the page in a canvas above everything.
 *
 * It is built on the CSS flight and keeps that flight's layer, its long shadow and its box, which follows
 * `flightPose` exactly. The canvas draws the volume at that pose, and over the last fifth of the way the
 * flat cover the CSS flight would have carried shows through and the canvas fades. So the volume lands as
 * the same cover, in the same box, that the reader's own cover then replaces, and nothing jumps. Every
 * frame depends on the time alone, so a flight played backwards, or turned round in the air, is the same
 * flight.
 */

/** What Studio knows about the volume to carry. */
export interface FlightBook {
  size: VolumeSize;
  /** The materials to draw it with right now; asked on every frame, so paint that arrives late is picked up. */
  parts(): VolumeParts;
  variant: string;
  environment: Texture | null;
}

const DEG = Math.PI / 180;
/** The CSS flight layer's `perspective`, in px: the camera stands this far in front of the page. */
const PERSPECTIVE = 2000;
/** Most device pixels per CSS px, and most pixels in all, the flight canvas is drawn at. */
const MAX_DENSITY = 2;
const MAX_PIXELS = 3_600_000;
/** How far the open volume turns its fore-edge toward the viewer, in radians, so its pages can be seen. */
const SHOW_TURN = 0.4;
/** Shares of the flight over which the flat landing cover appears under the canvas, and the canvas fades. */
const COVER_FROM = 0.8;
const COVER_TO = 0.88;
const FADE_FROM = 0.86;
const FADE_TO = 0.985;

const smooth = (from: number, to: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

export class FlightStage {
  readonly canvas = document.createElement('canvas');
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera();
  private readonly key = new DirectionalLight('#fff6ea', 2.3);
  private readonly sky = new HemisphereLight('#f6f1ea', '#5d544a', 0.55);
  private readonly mesh = new VolumeMesh();
  private readonly matrix = new Matrix4();
  private readonly scratch = new Matrix4();
  private active: { stop: () => void } | null = null;
  private lost = false;

  constructor() {
    this.canvas.className = 'bb-studio-flight';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.renderer = new WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.scene.add(this.key, this.key.target, this.sky, this.mesh.group);
    this.canvas.addEventListener('webglcontextlost', this.onLost);
  }

  /** Whether this stage can still draw. A lost context cannot; Studio then makes a new stage for the next flight. */
  get usable(): boolean {
    return !this.lost;
  }

  private readonly onLost = (event: Event): void => {
    event.preventDefault();
    this.lost = true;
    this.active?.stop();
  };

  /**
   * Draws a volume once, out of sight, so its shaders are compiled and its faces are on the graphics card
   * before it has to fly. Without this the first frames of a flight are lost to that work.
   */
  warm(book: FlightBook): void {
    if (this.lost || this.active) return;
    const { mesh, renderer, camera } = this;
    const reach = Math.max(book.size.bookHeight, book.size.coverWidth, 1);
    this.dress(book);
    mesh.setSize(book.size);
    mesh.setParts(book.parts());
    mesh.setOpening(flightOpening(0.4));
    mesh.group.matrix.makeTranslation(0, -book.size.bookHeight / 2, 0);
    mesh.group.matrixWorldNeedsUpdate = true;
    renderer.setPixelRatio(1);
    renderer.setSize(32, 32, false);
    camera.position.set(0, 0, PERSPECTIVE);
    camera.updateMatrixWorld(true);
    const s = reach * 1.5 * 0.1;
    camera.projectionMatrix.makePerspective(-s, s, s, -s, PERSPECTIVE * 0.1, PERSPECTIVE * 4);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    renderer.render(this.scene, camera);
    mesh.setOpening(null);
  }

  /** Lights and tone for the look the volume stands in. */
  private dress(book: FlightBook): void {
    const room = roomOf(book.variant);
    this.renderer.toneMapping = room.lamp ? ACESFilmicToneMapping : NeutralToneMapping;
    this.key.color.set(room.keyColor);
    this.key.intensity = room.lamp ? 2.6 : room.key;
    this.sky.intensity = room.lamp ? 0.3 : 0.55;
    this.scene.environment = book.environment;
    this.scene.environmentIntensity = room.environment;
  }

  /** Puts one volume in the air. Throws when it cannot, leaving nothing behind, so the caller can fly the CSS cover. */
  fly(options: FlightOptions, book: FlightBook): Flight {
    if (this.lost) throw new Error('The flight canvas lost WebGL.');
    if (this.active) throw new Error('A volume is already in the air.');
    const carried = createCarriedCover(options);
    const layer = options.cover.closest<HTMLElement>('.bb-flight');
    if (!layer) {
      carried.destroy();
      throw new Error('The flight has no layer.');
    }
    const { start, end } = options;
    const { canvas, renderer, mesh } = this;
    let drawing = true;

    /** From here on the flat cover flies alone, as it does without Studio. */
    const stop = (): void => {
      if (!drawing) return;
      drawing = false;
      canvas.remove();
      delete layer.dataset.paint;
      options.cover.style.opacity = '';
      options.cover.style.visibility = '';
      if (this.active?.stop === stop) this.active = null;
    };

    try {
      // The canvas covers the whole way from the row to the page, with room for the board to swing in.
      const pad = Math.max(start.width, end.width) * 0.7 + 32;
      const left = Math.max(0, Math.floor(Math.min(start.cx - start.width / 2, end.x) - pad));
      const top = Math.max(0, Math.floor(Math.min(start.cy - start.height / 2, end.y) - pad));
      const right = Math.min(window.innerWidth, Math.ceil(Math.max(start.cx + start.width / 2, end.x + end.width) + pad));
      const bottom = Math.min(window.innerHeight, Math.ceil(Math.max(start.cy + start.height / 2, end.y + end.height) + pad));
      const width = Math.max(1, right - left);
      const height = Math.max(1, bottom - top);
      const density = Math.min(MAX_DENSITY, window.devicePixelRatio || 1, Math.sqrt(MAX_PIXELS / (width * height)));
      renderer.setPixelRatio(density);
      renderer.setSize(width, height, false);
      canvas.style.left = `${left}px`;
      canvas.style.top = `${top}px`;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      this.dress(book);

      mesh.setSize(book.size);
      layer.dataset.paint = 'studio';
      layer.appendChild(canvas);
      this.active = { stop };

      const { spineWidth: w, bookHeight: h, coverWidth: d } = book.size;
      // The reader's cover may be a little taller or shorter for its width than this volume stands on the shelf.
      const landingStretch = end.width > 0 && h > 0 ? end.height / end.width / (h / d) : 1;
      const near = PERSPECTIVE * 0.1;

      const draw = (time: number): void => {
        const fade = 1 - smooth(FADE_FROM, FADE_TO, time);
        const flat = smooth(COVER_FROM, COVER_TO, time);
        options.cover.style.visibility = flat > 0 ? '' : 'hidden';
        options.cover.style.opacity = flat >= 1 ? '' : String(Math.round(flat * 1000) / 1000);
        canvas.style.visibility = fade > 0 ? '' : 'hidden';
        canvas.dataset.time = String(Math.round(time * 10000) / 10000);
        if (fade <= 0) return;
        canvas.style.opacity = fade >= 1 ? '' : String(Math.round(fade * 1000) / 1000);

        const pose = flightPose(time, start, end);
        const opening = flightOpening(time);
        mesh.setParts(book.parts());
        mesh.setOpening(opening);
        // The round of the spine stands out beside the cover; it draws in as the CSS flight's spine edge does.
        mesh.setSpineRound(pose.spine);
        canvas.dataset.cover = ((opening.cover * 180) / Math.PI).toFixed(2);
        canvas.dataset.edge = ((leafTangent(opening.leaves[0]!, 1) * 180) / Math.PI).toFixed(2);

        // Space here is the page in CSS px with y up: (x, -y, 0) is the point (x, y) of the viewport.
        const k = (end.width * pose.scale) / d;
        const stretch = 1 + (landingStretch - 1) * (1 - pose.light);
        const show = -SHOW_TURN * Math.min(1, opening.cover / FLIGHT_COVER);
        // The CSS flight's transform, in its order: place the foot, scale, lean, tip, turn. Then the volume is
        // stood with its front board in the plane of the page, the middle of the board's foot on the origin.
        this.matrix
          .makeTranslation(pose.x, -pose.y, 0)
          .multiply(this.scratch.makeScale(k, k * stretch, k))
          .multiply(this.scratch.makeRotationZ(-pose.lean * DEG))
          .multiply(this.scratch.makeRotationX(-pose.tip * DEG))
          .multiply(this.scratch.makeRotationY(pose.yaw * DEG + show))
          .multiply(this.scratch.makeTranslation(-d / 2, 0, -w / 2))
          .multiply(this.scratch.makeRotationY(-Math.PI / 2));
        mesh.group.matrix.copy(this.matrix);
        mesh.group.matrixWorldNeedsUpdate = true;

        // The camera stands straight in front of the volume, so nothing behind the cover shows as it lands.
        const cameraX = pose.x;
        const cameraY = -(pose.y - (end.height * pose.scale) / 2);
        const camera = this.camera;
        camera.position.set(cameraX, cameraY, PERSPECTIVE);
        camera.updateMatrixWorld(true);
        const s = near / PERSPECTIVE;
        camera.projectionMatrix.makePerspective((left - cameraX) * s, (right - cameraX) * s, (-top - cameraY) * s, (-bottom - cameraY) * s, near, PERSPECTIVE * 4);
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        // Daylight from the upper left and in front, as the row is lit.
        this.key.position.set(pose.x - 0.42 * 1200, -pose.y + 0.62 * 1200, 0.91 * 1200);
        this.key.target.position.set(pose.x, -pose.y, 0);
        this.key.target.updateMatrixWorld();
        renderer.render(this.scene, camera);
      };

      let last = Number.NaN;
      return {
        set: (time) => {
          carried.set(time);
          if (!drawing || time === last) return;
          last = time;
          try {
            draw(time);
          } catch {
            stop();
          }
        },
        destroy: () => {
          stop();
          carried.destroy();
        },
      };
    } catch (error) {
      stop();
      carried.destroy();
      throw error;
    }
  }

  dispose(): void {
    this.active?.stop();
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.mesh.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}

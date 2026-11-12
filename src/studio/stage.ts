import {
  ACESFilmicToneMapping,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  type Material,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SpotLight,
  SRGBColorSpace,
  type Texture,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ShelfFrame } from '../shelf/types';
import { canvasBox, type CanvasBox, fitCamera, rowOrigin } from './camera';

/**
 * The lit room Studio draws in: renderer, camera, a key light that casts soft shadows, a fill from the
 * sky, an environment for reflections, and the board the volumes stand on. It draws only when asked.
 */

/** Most device pixels per CSS px the canvas is drawn at. */
const MAX_DENSITY = 2;
/** Above this many device pixels the density is lowered, so a large window stays smooth. */
const MAX_PIXELS = 5_200_000;

export interface Room {
  /** Colour of the board's top and front. */
  board: string;
  /** Whether a lamp stands over the row (the Night look) instead of a window light. */
  lamp: boolean;
  /** Strength of the key light. */
  key: number;
  /** Strength of the environment in reflections and fill. */
  environment: number;
  /** Colour temperature of the key, as a colour. */
  keyColor: string;
}

export const ROOMS: Record<string, Room> = {
  paper: { board: '#e2dccd', lamp: false, key: 1.7, environment: 0.42, keyColor: '#fff6ea' },
  oak: { board: '#7a5636', lamp: false, key: 1.8, environment: 0.38, keyColor: '#ffe9cf' },
  night: { board: '#2a211b', lamp: true, key: 5.5, environment: 0.16, keyColor: '#ffd9a8' },
  pocket: { board: '#d2bd98', lamp: false, key: 1.6, environment: 0.45, keyColor: '#fff8ee' },
};

export function roomOf(variant: string): Room {
  return ROOMS[variant] ?? ROOMS.paper!;
}

export class Stage {
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(30, 1, 1, 10000);
  /** Everything that stands on the board: volumes and bookends. */
  readonly row = new Group();
  private readonly key = new DirectionalLight('#fff6ea', 2.3);
  private readonly lamp = new SpotLight('#ffd29a', 0, 0, Math.PI / 2.6, 0.95, 1.25);
  private readonly sky = new HemisphereLight('#f6f1ea', '#5d544a', 0.55);
  private readonly board: Mesh;
  private readonly boardMaterial: MeshStandardMaterial;
  private box: CanvasBox | null = null;
  private size = { width: 0, height: 0, perspective: 0, density: 0 };
  private room: Room = roomOf('paper');
  private boardOverride: Material | null = null;
  /** Pointer place over the scene, -1 to 1 each way; the light leans toward it a little. */
  private pointer = { x: 0, y: 0 };
  private origin = { x: 0, y: 0 };
  private span = 1000;
  private depth = 300;
  private lampX = 0;
  /** A room with bright panels, filtered for reflections, until a kit supplies its own studio. */
  private fallbackEnvironment: Texture | null = null;

  constructor(canvas = document.createElement('canvas')) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;

    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.6;
    this.key.shadow.radius = 6;
    this.lamp.castShadow = true;
    this.lamp.shadow.mapSize.set(1024, 1024);
    this.lamp.shadow.bias = -0.0005;
    this.lamp.shadow.radius = 5;
    this.scene.add(this.key, this.key.target, this.lamp, this.lamp.target, this.sky, this.row);

    // The board the row stands on: a top running back under the volumes and a front edge facing the viewer.
    this.boardMaterial = new MeshStandardMaterial({ color: '#e9e3d6', roughness: 0.82, metalness: 0 });
    this.board = new Mesh(new BoxGeometry(1, 1, 1), this.boardMaterial);
    this.board.receiveShadow = true;
    this.scene.add(this.board);
    // Metal foil and gloss need something bright to reflect, or they read as dark paint.
    const pmrem = new PMREMGenerator(this.renderer);
    this.fallbackEnvironment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.fallbackEnvironment;
  }

  setEnvironment(texture: Texture | null): void {
    this.scene.environment = texture ?? this.fallbackEnvironment;
  }

  /** A material for the board from a material kit; null keeps the plain one. */
  setBoardMaterial(material: Material | null): void {
    this.boardOverride = material;
    this.board.material = material ?? this.boardMaterial;
  }

  setRoom(variant: string): void {
    this.room = roomOf(variant);
    this.boardMaterial.color.set(this.room.board);
    this.key.color.set(this.room.keyColor);
    this.lamp.color.set(this.room.keyColor);
    this.scene.environmentIntensity = this.room.environment;
    this.renderer.toneMapping = this.room.lamp ? ACESFilmicToneMapping : NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    if (!this.boardOverride) this.board.material = this.boardMaterial;
  }

  setPointer(x: number, y: number): void {
    this.pointer.x = Math.max(-1, Math.min(1, x));
    this.pointer.y = Math.max(-1, Math.min(1, y));
    this.aimLights();
  }

  /** Fits canvas, camera, board and lights to a frame. Cheap when nothing about the scene changed. */
  fit(frame: ShelfFrame, deepest: number): CanvasBox {
    const wanted = Math.min(MAX_DENSITY, window.devicePixelRatio || 1);
    const box = canvasBox(frame.width, frame.height);
    const density = Math.min(wanted, Math.sqrt(MAX_PIXELS / Math.max(1, box.width * box.height)));
    const changed =
      frame.width !== this.size.width ||
      frame.height !== this.size.height ||
      frame.perspective !== this.size.perspective ||
      density !== this.size.density;
    this.origin = rowOrigin(frame);
    this.lampX = frame.lampX;
    if (changed || !this.box) {
      this.size = { width: frame.width, height: frame.height, perspective: frame.perspective, density };
      this.box = box;
      this.renderer.setPixelRatio(density);
      this.renderer.setSize(box.width, box.height, false);
      this.canvas.style.width = `${box.width}px`;
      this.canvas.style.height = `${box.height}px`;
      this.canvas.style.top = `${-box.top}px`;
      fitCamera(this.camera, frame.width, frame.height, frame.perspective, box);
    }
    this.span = frame.width * 1.6;
    this.depth = Math.max(80, deepest);
    this.placeBoard();
    this.aimLights();
    return this.box;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.board.geometry.dispose();
    this.boardMaterial.dispose();
    this.fallbackEnvironment?.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  private placeBoard(): void {
    const front = Math.max(14, this.depth * 0.14);
    const back = this.depth * 1.25;
    const thick = 14;
    this.board.scale.set(this.span, thick, front + back);
    this.board.position.set(0, this.origin.y - thick / 2, (front - back) / 2);
  }

  private aimLights(): void {
    const { x, y } = this.origin;
    const depth = this.depth;
    const reach = Math.max(this.size.width, 600) * 1.4;
    if (this.room.lamp) {
      this.key.intensity = 0.22;
      // Candela for a lamp about half a metre of px away: the presented volume gets about three lux, the
      // ends of a wide row about a third of that, as the CSS look's lamp falls off.
      this.lamp.intensity = this.room.key * 1500;
      this.lamp.distance = 0;
      this.lamp.decay = 1.25;
      // The lamp hangs over the presented volume, a little in front, and leans with the pointer.
      this.lamp.position.set(this.lampX + this.pointer.x * 90, y + this.size.height * 0.95, depth * 1.6);
      this.lamp.target.position.set(this.lampX, y, -depth * 0.4);
      this.sky.intensity = 0.2;
    } else {
      this.lamp.intensity = 0;
      this.key.intensity = this.room.key;
      // Daylight from the upper left and in front, as the CSS looks are lit, swinging with the pointer.
      const swing = this.pointer.x * 0.35;
      const lx = -0.42 + swing;
      const lz = 0.91;
      this.key.position.set(lx * reach, y + reach * (0.62 - this.pointer.y * 0.12), lz * reach);
      this.key.target.position.set(0, y, -depth * 0.3);
      this.sky.intensity = 0.3;
      const camera = this.key.shadow.camera;
      camera.left = -this.span / 2;
      camera.right = this.span / 2;
      camera.top = this.size.height;
      camera.bottom = -this.size.height;
      camera.near = 1;
      camera.far = reach * 3;
      camera.updateProjectionMatrix();
    }
    this.scene.environmentRotation.set(this.pointer.y * 0.12, this.pointer.x * 0.9, 0);
    this.key.updateMatrixWorld();
    this.key.target.updateMatrixWorld();
    this.lamp.target.updateMatrixWorld();
  }
}

export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

export const colorOf = (value: string, fallback = '#7a6a5a'): Color => {
  const color = new Color();
  try {
    color.setStyle(value.trim() || fallback);
  } catch {
    color.set(fallback);
  }
  return color;
};

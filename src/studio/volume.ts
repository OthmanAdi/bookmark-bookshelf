import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  DoubleSide,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import { bendLeaf, leafGeometry, type LeafShape } from './leaf';

/**
 * One bound volume as solid parts, in the volume's own space: the foot of the spine's middle at the
 * origin, the spine facing +z, the front board on the +x side, the body running back to z = -coverWidth.
 * Boards are real slabs with a little square (overhang) round the text block, the spine is gently rounded,
 * and the text block shows its page edges at the head, the foot and the fore-edge.
 */

export interface VolumeSize {
  spineWidth: number;
  bookHeight: number;
  coverWidth: number;
}

export interface VolumeParts {
  front: Material;
  back: Material;
  spine: Material;
  boardEdge: Material;
  pages: Material;
  endpaper: Material;
}

/** Board thickness in px for a volume: thin for a paperback-slim volume, never thicker than a real board looks. */
export function boardThickness(size: VolumeSize): number {
  return Math.min(3.2, Math.max(1.1, size.spineWidth * 0.07));
}

/** How far the boards stand proud of the text block at head, foot and fore-edge, in px. */
export function squareOf(size: VolumeSize): number {
  return Math.min(4, Math.max(1.2, size.bookHeight * 0.011));
}

/** How far the rounded spine bulges toward the viewer at its middle, in px. */
export function spineBulge(size: VolumeSize): number {
  return Math.min(5, size.spineWidth * 0.07);
}

/**
 * The spine: a strip across the volume's thickness, bowed toward the viewer, with UV (0,0) at its
 * bottom-left as seen from the front. Its two long edges meet the boards' outer faces.
 */
export function spineGeometry(size: VolumeSize, segments = 10): BufferGeometry {
  const { spineWidth: w, bookHeight: h } = size;
  const bulge = spineBulge(size);
  const columns = segments + 1;
  const positions = new Float32Array(columns * 2 * 3);
  const normals = new Float32Array(columns * 2 * 3);
  const uvs = new Float32Array(columns * 2 * 2);
  for (let i = 0; i < columns; i++) {
    const u = i / segments;
    const s = u * 2 - 1;
    const x = s * (w / 2);
    const z = bulge * (1 - s * s);
    // Slope of the bow: dz/dx = -2 s bulge / (w / 2); the normal leans out toward the edges.
    const slope = (-2 * s * bulge) / Math.max(0.001, w / 2);
    const length = Math.hypot(slope, 1);
    const nx = -slope / length;
    const nz = 1 / length;
    for (let j = 0; j < 2; j++) {
      const k = i * 2 + j;
      positions.set([x, j * h, z], k * 3);
      normals.set([nx, 0, nz], k * 3);
      uvs.set([u, j], k * 2);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

/** BoxGeometry face groups, in three's order. */
const PX = 0;
const NX = 1;

/**
 * A board: a slab `thickness` thick, as tall as the volume and as deep as the cover. Its material index
 * per face is chosen so the outer face carries the printed cover and the inner face the endpaper.
 */
function boardGeometry(size: VolumeSize, thickness: number, side: 'front' | 'back'): BoxGeometry {
  const geometry = new BoxGeometry(thickness, size.bookHeight, size.coverWidth);
  // Materials: 0 outer face, 1 inner face, 2 edges.
  const outer = side === 'front' ? PX : NX;
  geometry.groups.forEach((group, face) => {
    group.materialIndex = face === outer ? 0 : face === PX || face === NX ? 1 : 2;
  });
  geometry.translate(0, size.bookHeight / 2, -size.coverWidth / 2);
  return geometry;
}

function pagesGeometry(size: VolumeSize, thickness: number, square: number): BoxGeometry {
  const width = Math.max(0.5, size.spineWidth - thickness * 2 - 0.4);
  const height = Math.max(1, size.bookHeight - square * 2);
  const depth = Math.max(1, size.coverWidth - square - spineBulge(size) * 0.2);
  const geometry = new BoxGeometry(width, height, depth);
  geometry.translate(0, square + height / 2, -depth / 2 - 0.2);
  return geometry;
}

const hiddenMaterial: Material = new MeshBasicMaterial({ visible: false });

/** Loose leaves a volume can lift when it opens or riffles; the rest of the block stays a solid. */
export const LEAVES = 7;

/** Paper of the loose leaves: both sides lit, a warm white a little brighter than the block's edge. */
let leafPaper: MeshStandardMaterial | null = null;
function leafMaterial(): MeshStandardMaterial {
  leafPaper ??= new MeshStandardMaterial({ color: '#f4ecdb', roughness: 0.93, side: DoubleSide });
  return leafPaper;
}

/** How a volume stands open: the front board's turn in radians (0 shut) and the shape of each leaf. */
export interface Opening {
  cover: number;
  leaves: LeafShape[];
}

export class VolumeMesh {
  readonly group = new Group();
  private size: VolumeSize = { spineWidth: 0, bookHeight: 0, coverWidth: 0 };
  private readonly front = new Mesh<BufferGeometry, Material | Material[]>(new BufferGeometry(), [hiddenMaterial, hiddenMaterial, hiddenMaterial]);
  private readonly back = new Mesh<BufferGeometry, Material | Material[]>(new BufferGeometry(), [hiddenMaterial, hiddenMaterial, hiddenMaterial]);
  private readonly spine = new Mesh<BufferGeometry, Material | Material[]>(new BufferGeometry(), hiddenMaterial);
  private readonly pages = new Mesh<BufferGeometry, Material | Material[]>(new BufferGeometry(), hiddenMaterial);
  /** A slip of card standing in the pages, as far from the front board as the reading has got. */
  readonly slip = new Mesh<BufferGeometry, Material | Material[]>(new PlaneGeometry(1, 1), hiddenMaterial);
  /** The front board turns about this line: the edge where it meets the spine. */
  private readonly hinge = new Group();
  private readonly leaves: Array<Mesh<BufferGeometry, Material>> = [];
  private opened = false;

  constructor() {
    this.group.matrixAutoUpdate = false;
    for (const part of [this.front, this.back, this.spine, this.pages]) {
      part.castShadow = true;
      part.receiveShadow = true;
    }
    this.hinge.add(this.front);
    this.group.add(this.hinge, this.back, this.spine, this.pages);
    for (let i = 0; i < LEAVES; i++) {
      const leaf = new Mesh(leafGeometry(), leafMaterial());
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      leaf.visible = false;
      this.leaves.push(leaf);
      this.group.add(leaf);
    }
    this.slip.visible = false;
    this.group.add(this.slip);
  }

  /**
   * Opens the volume: the front board swings out about its hinge and the loose leaves lift and bend.
   * A cover of 0 with no lifted leaf shows the closed solid.
   */
  setOpening(opening: Opening | null): void {
    const { spineWidth: w, bookHeight: h, coverWidth: d } = this.size;
    const cover = opening?.cover ?? 0;
    // The board turns outward, away from the pages: a negative turn about y at the hinge.
    this.hinge.rotation.y = -cover;
    const lifted = opening !== null && opening.leaves.some((leaf) => leaf.angle > 0.002 || Math.abs(leaf.curl) > 0.002);
    if (!lifted && !this.opened) return;
    this.opened = lifted;
    const thickness = boardThickness(this.size);
    const square = squareOf(this.size);
    const length = Math.max(1, d - square * 1.5);
    const height = Math.max(1, h - square * 2);
    this.leaves.forEach((leaf, index) => {
      const shape = opening?.leaves[index];
      const show = lifted && shape !== undefined;
      leaf.visible = show;
      if (!show) return;
      // Leaves are taken from the front of the block, the first nearest the board.
      leaf.position.set(w / 2 - thickness - 0.35 - index * Math.min(0.9, (w - thickness * 2) / (LEAVES * 3)), square, -0.4);
      bendLeaf(leaf.geometry, length, height, shape);
    });
  }

  /** Rebuilds the solid when the volume's size changed; cheap to call every frame. */
  setSize(size: VolumeSize): boolean {
    const same =
      Math.abs(size.spineWidth - this.size.spineWidth) < 0.05 &&
      Math.abs(size.bookHeight - this.size.bookHeight) < 0.05 &&
      Math.abs(size.coverWidth - this.size.coverWidth) < 0.05;
    if (same) return false;
    this.size = { ...size };
    const thickness = boardThickness(size);
    const square = squareOf(size);
    const front = boardGeometry(size, thickness, 'front');
    // The front board hangs from its hinge, at the spine's front edge.
    front.translate(-thickness / 2, 0, 0);
    this.hinge.position.set(size.spineWidth / 2, 0, 0);
    const back = boardGeometry(size, thickness, 'back');
    back.translate(-size.spineWidth / 2 + thickness / 2, 0, 0);
    this.swap(this.front, front);
    this.swap(this.back, back);
    this.swap(this.spine, spineGeometry(size));
    this.swap(this.pages, pagesGeometry(size, thickness, square));
    return true;
  }

  setParts(parts: VolumeParts): void {
    this.front.material = [parts.front, parts.endpaper, parts.boardEdge];
    this.back.material = [parts.back, parts.endpaper, parts.boardEdge];
    this.spine.material = parts.spine;
    this.pages.material = parts.pages;
  }

  /** Shows a reading slip at `progress` (0 to 1) of the way from the front board, or hides it. */
  setSlip(progress: number, material: Material): void {
    if (progress <= 0) {
      this.slip.visible = false;
      return;
    }
    const { spineWidth: w, bookHeight: h, coverWidth: d } = this.size;
    const width = Math.max(8, w * 0.16);
    const height = h * 0.06;
    this.slip.material = material;
    this.slip.scale.set(width, height, 1);
    const x = -w / 2 + (1 - progress) * Math.max(0, w - 10) + 2 + width / 2;
    this.slip.position.set(x, h + height / 2 - h * 0.02, -d * 0.3);
    this.slip.rotation.set(0, Math.PI / 4, 0);
    this.slip.visible = true;
  }

  dispose(): void {
    for (const part of [this.front, this.back, this.spine, this.pages, this.slip, ...this.leaves]) part.geometry.dispose();
  }

  private swap(mesh: Mesh<BufferGeometry, Material | Material[]>, geometry: BufferGeometry): void {
    mesh.geometry.dispose();
    mesh.geometry = geometry;
  }
}

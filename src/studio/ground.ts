import { CanvasTexture, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { ShelfFrame } from '../shelf/types';

/**
 * Contact shadows: where a volume meets the board, the board is dark, and the dark fades back under the
 * body and a little forward of the foot. A lamp far away cannot draw this, because it comes from all the
 * light the volume keeps off the board, so it is laid down as a soft patch under every volume. Each patch
 * turns with its volume, reaches half a gap past each side so neighbours' patches meet and darken the gap
 * between them, and stays on the board when the volume is lifted, where it grows fainter.
 */

const DEG = Math.PI / 180;
/** Most volumes a frame can ground. More than a wide screen ever shows. */
const LIMIT = 192;
/** How far the dark reaches in front of the foot, in px. */
export const FRONT = 10;
/** Where the foot line lies across the depth of a patch: just behind its front edge. */
const FOOT_AT = 0.07;

/** Alpha of the patch across its depth: `v` 0 at the front edge, 1 at the back. Peaks at the foot line. */
export function contactAlpha(v: number, footAt: number): number {
  if (v <= footAt) {
    const t = v / Math.max(1e-6, footAt);
    return t * t * (3 - 2 * t);
  }
  const t = (v - footAt) / Math.max(1e-6, 1 - footAt);
  // Darkest along the foot, half gone a tenth of the way back, nothing at the far edge.
  return Math.max(0, (1 - t) ** 3);
}

function patchTexture(): CanvasTexture | null {
  const width = 32;
  const height = 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    // Row 0 of the canvas is the back of the patch: plane UVs put v = 1 at the top.
    const v = 1 - y / (height - 1);
    const along = contactAlpha(v, FOOT_AT);
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      // Soft at the sides, so two patches side by side read as one shade and not as two tiles.
      const edge = Math.min(1, Math.min(u, 1 - u) / 0.22);
      const side = edge * edge * (3 - 2 * edge);
      const k = (y * width + x) * 4;
      image.data[k] = 26;
      image.data[k + 1] = 24;
      image.data[k + 2] = 21;
      image.data[k + 3] = Math.round(255 * along * (0.55 + 0.45 * side));
    }
  }
  context.putImageData(image, 0, 0);
  return new CanvasTexture(canvas);
}

export class ContactShadows {
  readonly mesh: InstancedMesh;
  private readonly material: MeshBasicMaterial;
  private readonly texture: CanvasTexture | null;
  private readonly matrix = new Matrix4();
  private readonly turn = new Matrix4();
  private readonly scale = new Matrix4();

  constructor() {
    this.texture = patchTexture();
    this.material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
      toneMapped: false,
    });
    // A unit patch lying on the board: x across the volume, its front edge at z = +FRONT share, back toward -z.
    const geometry = new PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    // After the turn the plane's top (v = 1) points to -z, the back. Move it so z runs from 0 (front) to -1.
    geometry.translate(0, 0, -0.5);
    this.mesh = new InstancedMesh(geometry, this.material, LIMIT);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  /** How dark the patches are, 0 to 1. A lamp-lit room at night wants less than daylight. */
  setStrength(value: number): void {
    this.material.opacity = value;
  }

  /** Lays one patch under every volume of the frame that stands in its place. */
  update(frame: ShelfFrame, origin: { x: number; y: number }, gap: number): void {
    let count = 0;
    for (const volume of frame.volumes) {
      if (volume.hidden || count >= LIMIT) continue;
      const depth = volume.coverWidth + FRONT;
      const width = volume.spineWidth + gap;
      // A lifted volume keeps less light off the board right under it.
      const lifted = Math.max(0.35, 1 - volume.lift / 60);
      this.matrix.makeTranslation(origin.x + volume.x, origin.y + 0.35 + count * 0.002, volume.z);
      this.turn.makeRotationY(-volume.angle * DEG);
      this.matrix.multiply(this.turn);
      // The patch starts FRONT px in front of the spine face.
      this.turn.makeTranslation(0, 0, FRONT);
      this.matrix.multiply(this.turn);
      this.scale.makeScale(width * (0.9 + 0.1 * lifted), 1, depth * lifted);
      this.matrix.multiply(this.scale);
      this.mesh.setMatrixAt(count, this.matrix);
      count++;
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture?.dispose();
  }
}

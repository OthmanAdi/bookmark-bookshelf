import { CanvasTexture, type Material, MeshPhysicalMaterial, MeshStandardMaterial, SRGBColorSpace, type Texture } from 'three';
import type { FrameVolume } from '../shelf/types';
import type { DressKit, DressStyle } from './dress';
import { paintVolume } from './paint';
import { type Binding, isBinding, isStamp, type PaintedFace, type PaintedVolume, type Stamp } from './types';
import type { VolumeParts } from './volume';

/**
 * The kit Studio dresses volumes with: faces painted by the painter, lit by materials made from them.
 * The binding and stamp of an item are its own when it names known ones, else they follow from its seed.
 */

/** Default bindings, most of them cloth. A seed picks one, so a shelf is mixed but never random between visits. */
const MIX: Binding[] = ['cloth', 'cloth', 'cloth', 'linen', 'linen', 'leather', 'paper', 'cloth', 'gloss', 'linen', 'leather', 'cloth'];

export function bindingFor(item: FrameVolume['item']): { binding: Binding; stamp: Stamp } {
  const seed = Math.abs(Math.floor(item.seed ?? 0));
  const binding = isBinding(item.binding) ? item.binding : (MIX[seed % MIX.length] ?? 'cloth');
  const fallback: Stamp = binding === 'paper' || binding === 'gloss' ? 'ink' : binding === 'leather' ? 'gold' : seed % 3 === 0 ? 'silver' : 'gold';
  const stamp = isStamp(item.stamp) ? item.stamp : fallback;
  return { binding, stamp };
}

/** Lit materials from painted faces. The materials kit replaces this with its own generated surfaces. */
export type MaterialMaker = (volume: FrameVolume, style: DressStyle, binding: Binding, stamp: Stamp, faces: PaintedVolume) => VolumeParts & { dispose(): void };

export function createKit(materials: MaterialMaker = simpleMaterials): DressKit {
  return {
    bindingOf: (volume) => bindingFor(volume.item),
    paint: ({ volume, size, binding, stamp, density }) =>
      paintVolume({ item: volume.item, source: volume.element, size, binding, stamp, density }),
    materials,
  };
}

/** How rough and how metallic each binding is, before any stamp. */
const SURFACE: Record<Binding, { roughness: number; metalness: number; sheen: number; clearcoat: number }> = {
  cloth: { roughness: 0.82, metalness: 0, sheen: 0.7, clearcoat: 0 },
  linen: { roughness: 0.86, metalness: 0, sheen: 0.5, clearcoat: 0 },
  leather: { roughness: 0.5, metalness: 0, sheen: 0, clearcoat: 0.3 },
  paper: { roughness: 0.9, metalness: 0, sheen: 0, clearcoat: 0 },
  gloss: { roughness: 0.6, metalness: 0, sheen: 0, clearcoat: 1 },
  velvet: { roughness: 1, metalness: 0, sheen: 1, clearcoat: 0 },
  foil: { roughness: 0.25, metalness: 1, sheen: 0, clearcoat: 0 },
  holo: { roughness: 0.2, metalness: 0.9, sheen: 0, clearcoat: 0 },
};

/** A texture whose green says how rough and blue how metallic each pixel is: stamped parts are smooth metal. */
function surfaceMap(mask: HTMLCanvasElement, base: { roughness: number; metalness: number }, stamp: Stamp): Texture | null {
  const context = mask.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  const { width, height } = mask;
  const pixels = context.getImageData(0, 0, width, height);
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const target = out.getContext('2d');
  if (!target) return null;
  const metal = stamp !== 'blind' && stamp !== 'ink';
  const data = pixels.data;
  const result = target.createImageData(width, height);
  const write = result.data;
  for (let i = 0; i < data.length; i += 4) {
    const m = (data[i] ?? 0) / 255;
    const roughness = metal ? base.roughness + (0.2 - base.roughness) * m : base.roughness;
    const metalness = metal ? base.metalness + (1 - base.metalness) * m : base.metalness;
    write[i] = 255;
    write[i + 1] = Math.round(roughness * 255);
    write[i + 2] = Math.round(metalness * 255);
    write[i + 3] = 255;
  }
  target.putImageData(result, 0, 0);
  return new CanvasTexture(out);
}

function colorMap(face: PaintedFace): Texture {
  const texture = new CanvasTexture(face.color);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export const simpleMaterials: MaterialMaker = (_volume, style, binding, stamp, faces) => {
  const surface = SURFACE[binding];
  const textures: Texture[] = [];
  const materials: Material[] = [];
  const face = (painted: PaintedFace): MeshPhysicalMaterial => {
    const map = colorMap(painted);
    const mixed = surfaceMap(painted.mask, surface, stamp);
    textures.push(map);
    if (mixed) textures.push(mixed);
    const material = new MeshPhysicalMaterial({
      map,
      roughness: 1,
      metalness: 1,
      roughnessMap: mixed,
      metalnessMap: mixed,
      sheen: surface.sheen,
      sheenRoughness: 0.55,
      sheenColor: style.cloth,
      clearcoat: surface.clearcoat,
      clearcoatRoughness: 0.08,
      iridescence: binding === 'holo' || stamp === 'holo' ? 1 : 0,
      iridescenceIOR: 1.6,
      iridescenceThicknessMinimum: 180,
      iridescenceThicknessMaximum: 620,
    });
    if (!mixed) {
      material.roughness = surface.roughness;
      material.metalness = surface.metalness;
    }
    materials.push(material);
    return material;
  };
  const front = face(faces.front);
  const spine = face(faces.spine);
  const back = face(faces.back);
  const boardEdge = new MeshPhysicalMaterial({
    color: style.cloth,
    roughness: surface.roughness,
    metalness: surface.metalness,
    sheen: surface.sheen,
    sheenColor: style.cloth,
  });
  const pages = new MeshStandardMaterial({ color: '#efe6d2', roughness: 0.92 });
  const endpaper = new MeshStandardMaterial({ color: '#e8dfcc', roughness: 0.9 });
  materials.push(boardEdge, pages, endpaper);
  return {
    front,
    back,
    spine,
    boardEdge,
    pages,
    endpaper,
    dispose() {
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
};

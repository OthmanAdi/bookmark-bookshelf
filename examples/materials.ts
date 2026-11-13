/**
 * Material lab: every binding of the Studio renderer on a small case-bound volume, with a stamped title,
 * turning under a light that follows the pointer. The covers are painted here with a 2D canvas, the way
 * the cover painter will hand them over: one canvas for the print, one mask for the stamp.
 *
 * Address parameters, for looking at one thing: `only` (a binding, or `floors`), `stamp`, `ground`
 * (`paper` or `night`), `t` (freeze the clock at this many seconds), `yaw` (hold this angle, radians),
 * `at` (pointer position as `x,y`, each -1 to 1), `quality` (`high` or `low`), `near` (0 draws the
 * materials as on a volume at shelf distance, 1 as on a cover shown large; left out, it follows the size),
 * `handled` (0 to 1) and `age` (days since saved), which wear the volumes.
 */
import '../src/styles/base.css';
import './example.css';
import * as THREE from 'three';
import { createMaterialKit, nearness, type VolumeMaterials } from '../src/studio/materials';
import { BINDINGS, BINDING_LABELS, STAMPS, STAMP_LABELS, isBinding, isStamp, type Binding, type PaintedFace, type Stamp } from '../src/studio/types';

interface Shown {
  cloth: string;
  ink: string;
  art: string;
  stamp: Stamp;
  title: string[];
}

/** One volume per binding, in a cloth from the shelf's palette and the stamp a binder would choose. */
const SHOWN: Record<Binding, Shown> = {
  cloth: { cloth: '#1f5a5c', ink: '#eaf2ea', art: '#f0c56b', stamp: 'gold', title: ['Paper,', 'Cloth and', 'Thread'] },
  linen: { cloth: '#e4dccb', ink: '#1f1e1b', art: '#b5301a', stamp: 'copper', title: ['Notes on', 'Slow', 'Reading'] },
  leather: { cloth: '#a4442a', ink: '#f8eedf', art: '#f2c9a0', stamp: 'gold', title: ['Letters', 'to a', 'Librarian'] },
  paper: { cloth: '#c9982f', ink: '#211c12', art: '#5b3b12', stamp: 'ink', title: ['A Field', 'Guide to', 'Margins'] },
  gloss: { cloth: '#40533a', ink: '#f0ebdc', art: '#c9d3a0', stamp: 'holo', title: ['Twelve', 'Small', 'Tools'] },
  velvet: { cloth: '#4b2b3e', ink: '#f3e6e8', art: '#dba8b8', stamp: 'silver', title: ['The', 'Unfinished', 'Pile'] },
  foil: { cloth: '#45515d', ink: '#eff1ee', art: '#adc0ce', stamp: 'blind', title: ['How', 'Springs', 'Settle'] },
  holo: { cloth: '#1f1e1b', ink: '#efe9dc', art: '#c9b78f', stamp: 'ink', title: ['The Shape', 'of a', 'Link'] },
};

const FLOOR_LOOKS = ['paper', 'oak', 'night', 'pocket'];
const SIZE = { spineWidth: 46, bookHeight: 300, coverWidth: 196 };
const SERIF = "'Newsreader Variable', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif";

const params = new URLSearchParams(location.search);
/** `near` in the address holds how near the volumes count as drawn: 0 shelf distance, 1 shown large. */
const nearOverride = params.has('near') ? Math.min(1, Math.max(0, Number(params.get('near')) || 0)) : undefined;
/** `handled` (0 to 1) and `age` (days) in the address wear the volumes: rubbed corners, a sunned spine, dulled foil. */
const handled = Number(params.get('handled')) || 0;
const age = Number(params.get('age')) || 0;
const stage = document.querySelector<HTMLElement>('#stage')!;
const note = document.querySelector<HTMLElement>('#note')!;
const stampPicker = document.querySelector<HTMLSelectElement>('#stamp')!;
const onlyPicker = document.querySelector<HTMLSelectElement>('#only')!;
const groundPicker = document.querySelector<HTMLSelectElement>('#ground')!;

function fill(picker: HTMLSelectElement, options: [string, string][], value: string): void {
  for (const [key, label] of options) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = label;
    picker.appendChild(option);
  }
  picker.value = options.some(([key]) => key === value) ? value : options[0]![0];
}

fill(stampPicker, [['', 'As bound'], ...STAMPS.map((stamp): [string, string] => [stamp, STAMP_LABELS[stamp]])], params.get('stamp') ?? '');
fill(onlyPicker, [['', 'All bindings'], ...BINDINGS.map((binding): [string, string] => [binding, BINDING_LABELS[binding]]), ['floors', 'Shelf floors']], params.get('only') ?? '');
fill(groundPicker, [['paper', 'Paper'], ['night', 'Night']], params.get('ground') ?? 'paper');

/* ---------- painting the faces ---------- */

function canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement('canvas');
  element.width = Math.round(width);
  element.height = Math.round(height);
  return [element, element.getContext('2d')!];
}

/** Print and mask for one face, both drawn in CSS px at `scale` device px each. */
function paint(width: number, height: number, scale: number, cloth: string, draw: (print: CanvasRenderingContext2D, mask: CanvasRenderingContext2D) => void): PaintedFace {
  const [color, print] = canvas(width * scale, height * scale);
  const [mask, stamp] = canvas(width * scale, height * scale);
  print.scale(scale, scale);
  stamp.scale(scale, scale);
  print.fillStyle = cloth;
  print.fillRect(0, 0, width, height);
  stamp.fillStyle = '#000';
  stamp.fillRect(0, 0, width, height);
  stamp.fillStyle = '#fff';
  stamp.strokeStyle = '#fff';
  draw(print, stamp);
  return { color, mask };
}

function paintFront(shown: Shown, scale: number): PaintedFace {
  const { coverWidth: w, bookHeight: h } = SIZE;
  return paint(w, h, scale, shown.cloth, (print, mask) => {
    // Printed in flat ink, not stamped: a band of arcs at the foot.
    print.fillStyle = shown.art;
    print.globalAlpha = 0.92;
    print.fillRect(26, h - 96, w - 44, 58);
    print.globalAlpha = 1;
    print.strokeStyle = shown.cloth;
    print.lineWidth = 1.6;
    for (let index = 0; index < 9; index += 1) {
      print.beginPath();
      print.arc(26 + (index + 0.5) * ((w - 44) / 9), h - 38, 8 + (index % 3) * 9, Math.PI, 0);
      print.stroke();
    }
    // Stamped: a double rule round the board, the title, a small device and the imprint.
    mask.lineWidth = 1.6;
    mask.strokeRect(18, 14, w - 30, h - 28);
    mask.lineWidth = 0.7;
    mask.strokeRect(22, 18, w - 38, h - 36);
    mask.textAlign = 'left';
    mask.textBaseline = 'alphabetic';
    mask.font = `500 30px ${SERIF}`;
    shown.title.forEach((line, index) => mask.fillText(line, 32, 66 + index * 33));
    mask.fillRect(32, 66 + shown.title.length * 33 - 14, 44, 2.4);
    mask.beginPath();
    const cx = w - 44;
    const cy = 172;
    for (let ray = 0; ray < 12; ray += 1) {
      const angle = (ray / 12) * Math.PI * 2;
      mask.moveTo(cx + Math.cos(angle) * 5, cy + Math.sin(angle) * 5);
      mask.lineTo(cx + Math.cos(angle) * 13, cy + Math.sin(angle) * 13);
    }
    mask.lineWidth = 1.4;
    mask.stroke();
    mask.beginPath();
    mask.arc(cx, cy, 3, 0, Math.PI * 2);
    mask.fill();
    mask.font = `600 8.5px ${SERIF}`;
    mask.textAlign = 'center';
    mask.fillText('B O O K M A R K   B O O K S H E L F', 18 + (w - 30) / 2, h - 23);
  });
}

function paintSpine(shown: Shown, scale: number): PaintedFace {
  const { spineWidth: w, bookHeight: h } = SIZE;
  return paint(w, h, scale, shown.cloth, (print, mask) => {
    print.fillStyle = shown.art;
    print.globalAlpha = 0.92;
    print.fillRect(0, h - 96, w, 58);
    print.globalAlpha = 1;
    for (const y of [16, 22, h - 22, h - 16]) mask.fillRect(5, y, w - 10, y === 16 || y === h - 16 ? 2 : 0.9);
    mask.save();
    mask.translate(w / 2, 34);
    mask.rotate(Math.PI / 2);
    mask.font = `500 19px ${SERIF}`;
    mask.textAlign = 'left';
    mask.textBaseline = 'middle';
    mask.fillText(shown.title.join(' '), 0, 1, h - 150);
    mask.restore();
    mask.beginPath();
    mask.arc(w / 2, h - 67, 9, 0, Math.PI * 2);
    mask.lineWidth = 1.6;
    mask.stroke();
    mask.font = `600 11px ${SERIF}`;
    mask.textAlign = 'center';
    mask.textBaseline = 'middle';
    mask.fillText('B', w / 2, h - 66.5);
  });
}

function paintBack(shown: Shown, scale: number): PaintedFace {
  const { coverWidth: w, bookHeight: h } = SIZE;
  return paint(w, h, scale, shown.cloth, (_print, mask) => {
    mask.lineWidth = 1.6;
    mask.strokeRect(12, 14, w - 30, h - 28);
    mask.beginPath();
    mask.arc(w / 2 - 3, h / 2, 17, 0, Math.PI * 2);
    mask.stroke();
    mask.font = `600 21px ${SERIF}`;
    mask.textAlign = 'center';
    mask.textBaseline = 'middle';
    mask.fillText('B', w / 2 - 3, h / 2 + 1);
  });
}

/* ---------- the scene ---------- */

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1;
renderer.setClearColor(0x000000, 0);
stage.prepend(renderer.domElement);
renderer.domElement.setAttribute('aria-hidden', 'true');

const kit = createMaterialKit(renderer, { quality: params.get('quality') === 'low' ? 'low' : 'high' });
const scene = new THREE.Scene();
scene.environment = kit.environment;
scene.environmentIntensity = 0.9;

/** One world unit is one CSS px at the plane of the volumes. */
const camera = new THREE.PerspectiveCamera(28, 1, 10, 6000);
const lamp = new THREE.PointLight(0xfff1dc, 2.6, 0, 0);
scene.add(lamp);

const BOARD = 3;
const SQUARE = 4;

/** Page block edges read sheets along u, so head and tail need their UVs turned a quarter. */
function pageBlock(width: number, height: number, depth: number): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const uv = geometry.getAttribute('uv');
  for (let index = 8; index < 16; index += 1) uv.setXY(index, uv.getY(index), 1 - uv.getX(index));
  return geometry;
}

interface Volume {
  binding: Binding;
  stamp: Stamp;
  group: THREE.Group;
  materials: VolumeMaterials;
  label: HTMLElement;
}

const geometries: THREE.BufferGeometry[] = [];
let volumes: Volume[] = [];
let floorMeshes: { mesh: THREE.Mesh; label: HTMLElement }[] = [];

function label(title: string, detail: string): HTMLElement {
  const element = document.createElement('p');
  element.className = 'bb-lab__label';
  element.textContent = title;
  const small = document.createElement('small');
  small.textContent = detail;
  element.appendChild(small);
  stage.appendChild(element);
  return element;
}

/** How large the lab draws its volumes against their painted size; set by the layout before they are built. */
let drawnScale = 1;

function buildVolume(binding: Binding, stampOverride: Stamp | undefined, seed: number): Volume {
  const shown = SHOWN[binding];
  const stamp = stampOverride ?? shown.stamp;
  const scale = Math.min(3, Math.max(2, Math.ceil(window.devicePixelRatio || 1) + 1));
  const materials = kit.volume(
    { binding, stamp, cloth: shown.cloth, ink: shown.ink, seed, size: SIZE, presented: nearOverride ?? nearness(SIZE.bookHeight * drawnScale), handled, age },
    { front: paintFront(shown, scale), spine: paintSpine(shown, scale), back: paintBack(shown, scale) },
  );
  const { spineWidth: d, bookHeight: h, coverWidth: w } = SIZE;
  const { front, back, spine, boardEdge: edge, pages, endpaper } = materials;
  const group = new THREE.Group();
  const board = new THREE.BoxGeometry(w, h, BOARD);
  const spineBoard = new THREE.BoxGeometry(BOARD, h, d);
  const block = pageBlock(w - SQUARE, h - SQUARE * 2, d - BOARD * 2);
  geometries.push(board, spineBoard, block);

  const frontBoard = new THREE.Mesh(board, [edge, edge, edge, edge, front, endpaper]);
  frontBoard.position.z = d / 2 - BOARD / 2;
  const backBoard = new THREE.Mesh(board, [edge, edge, edge, edge, endpaper, back]);
  backBoard.position.z = -(d / 2 - BOARD / 2);
  const spineMesh = new THREE.Mesh(spineBoard, [edge, spine, edge, edge, edge, edge]);
  spineMesh.position.x = -w / 2 - BOARD / 2;
  const blockMesh = new THREE.Mesh(block, [pages, pages, pages, pages, endpaper, endpaper]);
  blockMesh.position.x = -SQUARE / 2;
  group.add(frontBoard, backBoard, spineMesh, blockMesh);
  scene.add(group);
  return { binding, stamp, group, materials, label: label(BINDING_LABELS[binding], STAMP_LABELS[stamp]) };
}

function clear(): void {
  for (const volume of volumes) {
    scene.remove(volume.group);
    volume.materials.dispose();
    volume.label.remove();
  }
  for (const floor of floorMeshes) {
    scene.remove(floor.mesh);
    floor.label.remove();
  }
  for (const geometry of geometries) geometry.dispose();
  geometries.length = 0;
  volumes = [];
  floorMeshes = [];
}

function build(): void {
  clear();
  const only = onlyPicker.value;
  const stamp = isStamp(stampPicker.value) ? stampPicker.value : undefined;
  if (only === 'floors') {
    const plank = new THREE.PlaneGeometry(1, 1);
    geometries.push(plank);
    FLOOR_LOOKS.forEach((look) => {
      const mesh = new THREE.Mesh(plank, kit.floor(look, { width: 560, depth: 260 }));
      scene.add(mesh);
      floorMeshes.push({ mesh, label: label(`Floor: ${look}`, 'kit.floor()') });
    });
  } else {
    const shownBindings = isBinding(only) ? [only] : [...BINDINGS];
    drawnScale = scaleFor(shownBindings.length);
    volumes = shownBindings.map((binding, index) => buildVolume(binding, stamp, 101 + index * 37));
  }
  layout();
}

let width = 1;
let height = 1;

/** The scale `count` volumes are drawn at in a stage of the present size. */
function scaleFor(count: number): number {
  const w = Math.max(1, stage.clientWidth);
  const h = Math.max(1, stage.clientHeight);
  if (count === 1) return Math.min((h - 90) / SIZE.bookHeight, (w - 60) / (SIZE.coverWidth + 80), 2.6);
  const columns = w > 1080 ? 4 : w > 560 ? 2 : 1;
  const rows = Math.ceil(count / columns);
  return Math.min(1.15, (w / columns - 70) / (SIZE.coverWidth + 30), (Math.max(h / rows, 1) - 120) / SIZE.bookHeight);
}

function layout(): void {
  width = Math.max(1, stage.clientWidth);
  height = Math.max(1, stage.clientHeight);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.position.set(0, 0, height / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  if (floorMeshes.length > 0) {
    const scale = Math.min(1, width / 1300, height / 760);
    floorMeshes.forEach((floor, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      floor.mesh.scale.set(560 * scale, 260 * scale, 1);
      floor.mesh.position.set((column - 0.5) * 620 * scale, (0.5 - row) * 330 * scale + 10, 0);
      floor.mesh.rotation.x = -0.9;
      floor.label.style.left = `${width / 2 + floor.mesh.position.x}px`;
      floor.label.style.top = `${height / 2 - floor.mesh.position.y + 105 * scale}px`;
    });
    return;
  }
  if (volumes.length === 1) {
    const scale = scaleFor(1);
    const volume = volumes[0]!;
    volume.group.scale.setScalar(scale);
    volume.group.position.set(0, 14, 0);
    volume.label.style.left = `${width / 2}px`;
    volume.label.style.top = `${height / 2 + (SIZE.bookHeight * scale) / 2 - 6}px`;
    return;
  }
  const columns = width > 1080 ? 4 : width > 560 ? 2 : 1;
  const rows = Math.ceil(volumes.length / columns);
  const cellWidth = width / columns;
  const cellHeight = Math.max(height / rows, 1);
  const scale = scaleFor(volumes.length);
  volumes.forEach((volume, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = (column + 0.5) * cellWidth - width / 2;
    const y = height / 2 - (row + 0.5) * cellHeight + 30;
    volume.group.scale.setScalar(scale);
    volume.group.position.set(x, y, 0);
    volume.label.style.left = `${width / 2 + x}px`;
    volume.label.style.top = `${height / 2 - y + (SIZE.bookHeight * scale) / 2 + 22}px`;
  });
}

/* ---------- light and motion ---------- */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const frozen = params.has('t') ? Number(params.get('t')) : undefined;
const heldYaw = params.has('yaw') ? Number(params.get('yaw')) : undefined;
const startAt = (params.get('at') ?? '').split(',').map(Number);
const pointer = { x: Number.isFinite(startAt[0]) ? startAt[0]! : -0.3, y: Number.isFinite(startAt[1]) ? startAt[1]! : 0.45, moved: params.has('at') ? Infinity : -Infinity };

stage.addEventListener('pointermove', (event) => {
  const box = stage.getBoundingClientRect();
  pointer.x = ((event.clientX - box.left) / box.width) * 2 - 1;
  pointer.y = -(((event.clientY - box.top) / box.height) * 2 - 1);
  pointer.moved = performance.now();
});

const turn = new THREE.Euler();

function frame(now: number): void {
  const seconds = frozen ?? now / 1000;
  // With no pointer about, the light and the room drift on their own.
  const idle = now - pointer.moved > 4000;
  const x = idle ? Math.sin(seconds * 0.5) * 0.7 : pointer.x;
  const y = idle ? 0.35 + Math.cos(seconds * 0.37) * 0.3 : pointer.y;
  lamp.position.set((x * width) / 2, (y * height) / 2, 420);
  turn.set(0, x * 1.9, 0);
  scene.environmentRotation.copy(turn);

  volumes.forEach((volume, index) => {
    const yaw = heldYaw ?? (reduced.matches && frozen === undefined ? -0.5 : -0.3 + Math.sin(seconds * 0.45 + index * 0.55) * 0.72);
    volume.group.rotation.set(0.06, yaw, 0);
  });
  renderer.render(scene, camera);
  if (frozen === undefined || !settled) requestAnimationFrame(frame);
  settled = true;
}

let settled = false;

function restart(): void {
  settled = false;
  build();
  requestAnimationFrame(frame);
}

for (const picker of [stampPicker, onlyPicker]) picker.addEventListener('change', restart);
groundPicker.addEventListener('change', () => {
  stage.dataset.ground = groundPicker.value;
});
stage.dataset.ground = groundPicker.value;
new ResizeObserver(() => {
  layout();
  if (frozen !== undefined) requestAnimationFrame(frame);
}).observe(stage);

renderer.domElement.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  note.textContent = 'The graphics context was lost. Reload the page to see the materials again.';
});

// The title is set in the page's serif; wait for it so the stamps are cut from the right letters.
void document.fonts
  .load(`500 30px ${SERIF}`)
  .catch(() => undefined)
  .then(restart);

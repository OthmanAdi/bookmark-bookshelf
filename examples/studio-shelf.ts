/**
 * Partial composition: shelf + motion + Studio.
 * No store, no reader. The shelf draws the row and takes every press; Studio paints the same row in
 * WebGL behind it. Studio is imported only when it is switched on, so a page that never uses it never
 * downloads three.js.
 */
import '../src/styles/base.css';
import './example.css';
import { createShelfMotion, prefersReducedMotion } from '../src/motion';
import { listVariants, mountShelf, type ShelfItem } from '../src/shelf';
import { BINDING_LABELS, BINDINGS, STAMP_LABELS, STAMPS } from '../src/studio/types';
import type { StudioHandle } from '../src/studio';

const titles = [
  'A Field Guide to Margins',
  'Notes on Slow Reading',
  'The Shape of a Link',
  'Twelve Small Tools',
  'On Keeping a Commonplace',
  'Paper, Cloth and Thread',
  'What the Index Knows',
  'An Honest Reader',
  'Shelves and Their Order',
  'The Unfinished Pile',
  'Letters to a Librarian',
  'How Springs Settle',
];
const cloths = ['ink', 'bone', 'rust', 'moss', 'plum', 'ochre', 'slate', 'teal'];
const patterns = ['arcs', 'bars', 'dots', 'rays', 'tiles', 'waves'];

/** The row, dressed as the two pickers say. An empty choice leaves the binding or stamp to each volume. */
function makeItems(binding: string, stamp: string): ShelfItem[] {
  return titles.map((title, index) => ({
    id: `demo-${index}`,
    title,
    source: 'example.org',
    cloth: cloths[index % cloths.length],
    pattern: patterns[index % patterns.length],
    seed: 101 + index * 37,
    progress: index === 3 ? 0.4 : index === 8 ? 0.85 : 0,
    ...(binding ? { binding } : {}),
    ...(stamp ? { stamp } : {}),
  }));
}

const host = document.querySelector<HTMLElement>('#shelf')!;
const log = document.querySelector<HTMLElement>('#log')!;
const lookPicker = document.querySelector<HTMLSelectElement>('#variant')!;
const bindingPicker = document.querySelector<HTMLSelectElement>('#binding')!;
const stampPicker = document.querySelector<HTMLSelectElement>('#stamp')!;
const studioSwitch = document.querySelector<HTMLInputElement>('#studio')!;

let items = makeItems('', '');
const shelf = mountShelf(host, {
  items,
  label: 'Demo shelf',
  onLoopChange: (loop) => motion.setLoop(loop),
});
const motion = createShelfMotion({
  count: items.length,
  loop: shelf.loop,
  reducedMotion: prefersReducedMotion,
  timing: shelf.variant.motion,
});

motion.subscribe((state) => {
  shelf.setPose({ position: state.position, open: 0, velocity: state.velocity * 1000 });
  shelf.element.dataset.settled = state.settled ? '1' : '0';
});
motion.attach(shelf.surface, {
  pxPerItem: () => shelf.pitch(),
  track: (start) => shelf.trackFrom(start),
});
shelf.on((intent) => {
  if (intent.type === 'focus') motion.goTo(intent.slot);
  else if (intent.type === 'step') motion.step(intent.direction);
  else if (intent.type === 'jump') motion.goTo(intent.to === 'first' ? 0 : items.length - 1);
  else log.textContent = `Picked: ${items[intent.index]?.title ?? ''}`;
});

/* ---------- Studio: mounted over the shelf that already exists ---------- */

let studio: StudioHandle | null = null;
let asked = 0;

async function setStudio(on: boolean): Promise<void> {
  const ticket = ++asked;
  if (!on) {
    studio?.destroy();
    studio = null;
    return;
  }
  if (studio) return;
  try {
    const [{ mountStudio }, { createKit }] = await Promise.all([import('../src/studio'), import('../src/studio/kit')]);
    if (ticket !== asked) return;
    studio = mountStudio(shelf, {
      kit: (renderer) => createKit(renderer),
      onFailure: () => {
        studioSwitch.checked = false;
        void setStudio(false);
        log.textContent = 'Studio stopped because the browser took WebGL away. The shelf carries on as it was.';
      },
    });
  } catch {
    studioSwitch.checked = false;
    log.textContent = 'Studio needs WebGL 2, which this browser does not offer. The shelf works without it.';
  }
}

/* ---------- pickers ---------- */

function fill(picker: HTMLSelectElement, options: Array<[value: string, label: string]>): void {
  for (const [value, label] of options) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    picker.appendChild(option);
  }
}

fill(
  lookPicker,
  listVariants().map((variant) => [variant.name, variant.label]),
);
fill(bindingPicker, [['', 'Mixed, by volume'], ...BINDINGS.map((name): [string, string] => [name, BINDING_LABELS[name]])]);
fill(stampPicker, [['', 'By binding'], ...STAMPS.map((name): [string, string] => [name, STAMP_LABELS[name]])]);

lookPicker.addEventListener('change', () => {
  shelf.setVariant(lookPicker.value);
  motion.setLoop(shelf.loop);
  motion.setTiming(shelf.variant.motion);
  document.documentElement.dataset.variant = lookPicker.value;
});
const redress = (): void => {
  items = makeItems(bindingPicker.value, stampPicker.value);
  shelf.setItems(items);
};
bindingPicker.addEventListener('change', redress);
stampPicker.addEventListener('change', redress);
studioSwitch.addEventListener('change', () => void setStudio(studioSwitch.checked));

void setStudio(true);

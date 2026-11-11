/**
 * Partial composition: shelf + motion only.
 * No store, no reader. Items are a plain array and "open" just reports the pick.
 */
import '../src/styles/base.css';
import './example.css';
import { createShelfMotion, prefersReducedMotion } from '../src/motion';
import { listVariants, mountShelf, type ShelfItem } from '../src/shelf';

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

const items: ShelfItem[] = titles.map((title, index) => ({
  id: `demo-${index}`,
  title,
  source: 'example.org',
  cloth: cloths[index % cloths.length],
  pattern: patterns[index % patterns.length],
  seed: 101 + index * 37,
  progress: index === 3 ? 0.4 : index === 8 ? 0.85 : 0,
}));

const host = document.querySelector<HTMLElement>('#shelf')!;
const log = document.querySelector<HTMLElement>('#log')!;
const picker = document.querySelector<HTMLSelectElement>('#variant')!;

const shelf = mountShelf(host, {
  items,
  label: 'Demo shelf',
  // The shelf decides whether the row goes round: it depends on how many volumes the scene can hold.
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
  // The volume that was grabbed stays under the hand, whatever the spacing.
  track: (start) => shelf.trackFrom(start),
});

shelf.on((intent) => {
  if (intent.type === 'focus') motion.goTo(intent.slot);
  else if (intent.type === 'step') motion.step(intent.direction);
  else if (intent.type === 'jump') motion.goTo(intent.to === 'first' ? 0 : items.length - 1);
  else log.textContent = `Picked: ${items[intent.index]?.title ?? ''}`;
});

for (const variant of listVariants()) {
  const option = document.createElement('option');
  option.value = variant.name;
  option.textContent = variant.label;
  picker.appendChild(option);
}
picker.addEventListener('change', () => {
  shelf.setVariant(picker.value);
  motion.setLoop(shelf.loop);
  motion.setTiming(shelf.variant.motion);
  document.documentElement.dataset.variant = picker.value;
});

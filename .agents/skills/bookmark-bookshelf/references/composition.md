# Wiring recipes

Each recipe is a complete composition. Paths assume the module folders sit next to the file you are writing. Runnable copies live in `examples/` and `src/app/bookshelf.ts`.

Contents: [shelf only](#shelf-only) · [shelf and motion](#shelf-and-motion) · [reader only](#reader-only) · [store only](#store-only) · [all four](#all-four) · [framework hosts](#framework-hosts)

## Shelf only

You own input. Useful for a static showcase or when another carousel library drives the position.

```ts
import './styles/tokens.css';
import { mountShelf } from './shelf';

const shelf = mountShelf(host, { items, loop: false });
let index = 0;
shelf.on((intent) => {
  if (intent.type === 'step') index = Math.min(items.length - 1, Math.max(0, index + intent.direction));
  else if (intent.type === 'focus') index = intent.index;
  else if (intent.type === 'jump') index = intent.to === 'first' ? 0 : items.length - 1;
  shelf.setPose({ position: index, open: 0 });
});
```

Moves are instant here. For animated moves add the motion module.

## Shelf and motion

See `examples/shelf-only.ts` (named for having no store and no reader). The wiring is the block in SKILL.md section 3. Two details:

- `pxPerItem: () => shelf.pitch()` must be a function. The pitch changes when the shelf resizes.
- After `shelf.setItems(next)`, call `motion.setCount(next.length, indexToKeep)`. After `shelf.setVariant(name)`, call `motion.setLoop(shelf.loop)`.

## Reader only

See `examples/reader-only.ts`.

```ts
import './styles/tokens.css';
import { mountReader } from './reader';

const reader = mountReader(host, {
  doc: { id: 'a1', title: 'On slow reading', url: 'https://example.org/slow', text: savedText },
  progress: loadPosition('a1'),
  onProgress: (position) => savePosition('a1', position),
  onSaveText: (text) => saveText('a1', text),
  onClose: () => {
    reader.destroy();
    openerButton.focus();
  },
});
reader.setReveal(1);
reader.focus();
```

`loadPosition` and `savePosition` are yours: any place that holds `{ block, ratio, percent }`. The reader styles `.bb-button` and `.bb-label` from `src/styles/base.css`; copy those rules or provide your own.

## Store only

See `examples/store-only.ts`.

```ts
import { createStore } from './store';

const store = createStore();                         // localStorage, or memory when blocked
const added = store.addBookmark({ url: 'example.org/essay', readingText: pasted });
if (!added.ok) showError(added.error.message, added.error.field);
store.subscribe(() => render(store.bookmarks()));
addEventListener('pagehide', () => store.flush());
```

For tests or a preview that must not touch real data: `createStore({ storage: createMemoryStorage(), syncTabs: false })`.

## All four

`src/app/bookshelf.ts` is the reference composition (about 250 lines). Copy it and adapt it. What it does, in order:

1. Maps store bookmarks to shelf items: `title`, `source` (hostname), `cloth`, `pattern`, `seed`, `progress` (the stored percent).
2. Mounts the shelf, creates motion with `count`, `loop: shelf.loop`, `initial` from `session.focusId`, `reducedMotion: prefersReducedMotion`.
3. On every motion frame: `shelf.setPose(...)` and, if a reader is mounted, `reader.setReveal(state.open, fromBox)`. When settled and the focus changed, it writes `session.focusId`.
4. Routes intents: `focus` to `motion.goTo(slot)`, `step`, `jump`, and `open` to its own `open(id)`.
5. `open(id)`:
   - mount the reader with `cover: createCover(item)` and `coverAspect: coverWidth / bookHeight`;
   - `flightFrom = shelf.coverBox()`, `shelf.setStage(reader.coverSlotRect())`, `reader.setCoverVisible(false)`;
   - make the page behind `inert`, write `session.openId`;
   - `await motion.setOpen(true)`, then `reader.setCoverVisible(true)` and `reader.focus()`.
   The flying book and the reader's own cover land on the same pixels, so the swap is invisible.
6. `close()`: `store.flush()`, point the stage at the cover slot if it is still on screen, `await motion.setOpen(false)`, destroy the reader, clear `session.openId`, refresh the row (progress ribbons), `shelf.focusCurrent()`.
7. On load: if `session.openId` exists, `open(id, { immediate: true })`. That is the whole resume feature.
8. On store changes other than `progress` and `session`: rebuild the row, keeping the centred volume by id.

With reduced motion there is no flight: pass `null` as the `from` box so the reader fades, and do not set a stage.

Page CSS the composition expects: the shelf root must be able to draw outside its box vertically (it uses `overflow-x: clip` only), and `html.bb-reading { overflow: hidden }` stops the page scrolling behind the reader.

## Framework hosts

Every module mounts into an element and returns a handle with `destroy()`.

React

```tsx
function Shelf({ items }: { items: ShelfItem[] }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const shelf = mountShelf(host.current!, { items });
    const motion = createShelfMotion({ count: items.length, loop: shelf.loop });
    const stop = motion.subscribe((s) => shelf.setPose({ position: s.position, open: 0 }));
    const detach = motion.attach(shelf.surface, { pxPerItem: () => shelf.pitch() });
    const off = shelf.on((i) => { if (i.type === 'focus') motion.goTo(i.slot); else if (i.type === 'step') motion.step(i.direction); });
    return () => { off(); detach(); stop(); motion.destroy(); shelf.destroy(); };
  }, [items]);
  return <div ref={host} />;
}
```

Vue: the same body inside `onMounted`, the cleanup inside `onBeforeUnmount`. Svelte: inside `onMount`, returning the cleanup. Do not render the books through the framework's templates: the shelf recycles its own nodes on every frame and a virtual DOM would fight it.

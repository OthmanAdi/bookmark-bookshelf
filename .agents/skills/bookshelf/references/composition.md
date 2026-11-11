# Wiring recipes

Each recipe is a complete composition for version 0.2.0. Paths assume the module folders sit next to the file you are writing. Runnable copies live in `examples/` and `src/app/bookshelf.ts`. Every block here was type-checked against the modules under `strict`. Names that are not imported (`host`, `items`, `savedText`, functions such as `showPicked`) are yours.

Contents: [shelf only](#shelf-only), [shelf and motion](#shelf-and-motion), [reader only](#reader-only), [store only](#store-only), [shelf, motion and reader](#shelf-motion-and-reader), [all four](#all-four), [framework hosts](#framework-hosts)

## Shelf only

You own input. Useful for a static display, or when something else drives the position.

```ts
import './styles/tokens.css';
import { mountShelf } from './shelf';

const shelf = mountShelf(host, { items, loop: false });
let index = 0;
shelf.on((intent) => {
  if (intent.type === 'open') return showPicked(intent.id);
  if (intent.type === 'step') index = Math.min(items.length - 1, Math.max(0, index + intent.direction));
  else if (intent.type === 'focus') index = intent.index;
  else index = intent.to === 'first' ? 0 : items.length - 1;
  shelf.setPose({ position: index, open: 0 });
});
```

Moves are instant here. For animated moves add the motion module.

## Shelf and motion

See `examples/shelf-only.ts` (named for having no store and no reader).

```ts
import { createShelfMotion, prefersReducedMotion } from './motion';
import { mountShelf } from './shelf';

const motion = createShelfMotion({ count: items.length, reducedMotion: prefersReducedMotion });
const shelf = mountShelf(host, {
  items,
  label: 'My shelf',
  onLoopChange: (loop) => motion.setLoop(loop), // the shelf decides whether the row loops
});
motion.setLoop(shelf.loop);
motion.setTiming(shelf.variant.motion);

motion.subscribe((state) => {
  shelf.setPose({ position: state.position, open: 0, reduced: state.reduced });
  shelf.element.dataset.settled = state.settled ? '1' : '0'; // lets tests wait for rest
});
motion.attach(shelf.surface, {
  pxPerItem: () => shelf.pitch(),
  extent: () => shelf.surface.clientWidth,
  enabled: () => !shelf.fixed, // a short row stands still, so a drag must not move it
});

shelf.on((intent) => {
  if (intent.type === 'focus') motion.goTo(intent.slot);
  else if (intent.type === 'step') motion.step(intent.direction);
  else if (intent.type === 'jump') motion.goTo(intent.to === 'first' ? 0 : items.length - 1);
  else openSomething(intent.id);
});
```

Four details:

- The motion engine is created first because the shelf may report a loop change as soon as it has measured itself.
- `pxPerItem` must be a function. The pitch changes when the shelf resizes.
- With few items the row stands still between two bookends (`shelf.fixed`). Arrow keys, the arrow buttons and a click on a spine still choose the presented volume, and a drag is ignored. With enough items to fill the scene the same code gives a looping row that can be dragged and flicked.
- After a change of items or look, tell the motion engine:

```ts
shelf.setItems(next);
motion.setCount(next.length, indexToKeep);

shelf.setVariant('night');
motion.setLoop(shelf.loop);
motion.setTiming(shelf.variant.motion);
document.documentElement.dataset.variant = shelf.variant.name;
```

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
```

`loadPosition` and `savePosition` are yours: any place that holds `{ block, ratio, percent }`. The reader takes focus when it mounts and gives none back, so return it to the opener in `onClose`. It styles `.bb-button` and `.bb-label` from `src/styles/base.css`: copy those rules or provide your own.

The rest of the reader is opt-in. Each part appears only when you pass its option:

```ts
const full = mountReader(host, {
  doc: { id: 'a1', title: 'On slow reading', url: 'https://example.org/slow', text: savedText, lang: 'en' },
  myNote: loadNote('a1'),
  onMyNote: (text) => saveNote('a1', text),
  done: isRead('a1'),
  onDone: (done) => setRead('a1', done),
  next: { title: 'The next link', minutes: '6 min' },
  onNext: openNext,
  textScale: loadScale(),
  onTextScale: saveScale,
  onClose: () => full.destroy(),
});
full.setReveal(1);
```

## Store only

See `examples/store-only.ts`.

```ts
import { createStore } from './store';

const store = createStore(); // localStorage, or memory when it is blocked
const added = store.addBookmark({ url: 'example.org/essay', readingText: pasted });
if (!added.ok) showError(added.error.message, added.error.field);
store.subscribe(() => render(store.bookmarks()));
addEventListener('pagehide', () => store.flush());
```

For tests, or a preview that must not touch real data: `createStore({ storage: createMemoryStorage(), syncTabs: false })`.

Bringing many links in. Parse first, show the person what was found, and import only after they agree. An import never changes a link that is already saved.

```ts
if (isNetscapeBookmarks(fileText)) {
  const parsed = parseNetscapeBookmarks(fileText); // { folders, skipped }
  preview(parsed);
  if (confirmed()) {
    const result = store.importFolders(parsed.folders);
    if (result.ok) preview(result.value); // { added, unchanged, shelvesAdded, skipped, updated }
  }
}

const list = parseLinkList(pastedList); // { entries, unreadable }
if (confirmed()) store.importLinks(list.entries, shelfId);
```

Finding and ordering are pure functions over what the store returns:

```ts
const hits = searchVolumes(store.bookmarks(), 'slow reading', { limit: 8 }); // [{ id, score, field }], best first
const context = {
  percentOf: (id: string) => store.progress(id)?.percent ?? 0,
  isDone: (id: string) => store.isDone(id),
};
const unreadFirst = sortVolumes(store.bookmarks(shelfId), 'unread-first', context);
const stats = shelfStats(
  store.bookmarks(shelfId).map((link) => ({ id: link.id, title: link.title, required: link.required, minutes: minutesOf(link) })),
  context,
);
const status = formatShelfStatus(stats); // "2 of 6 read. About 35 min left. Next: ..."
```

Handing one shelf to someone, as a file and as a link, and receiving one. The link carries the shelf in its fragment, so no server is involved. Receiving never applies anything by itself.

```ts
async function share(): Promise<void> {
  const file = store.exportShelf(shelfId, { includeTexts: false });
  if (!file.ok) return;
  download(shelfFileName(file.value.shelf.name), JSON.stringify(file.value, null, 2));

  const { fragment } = await encodeShelfLink(file.value); // "shelf=1.d.<data>"
  const link = `${location.origin}${location.pathname}#${fragment}`;
  if (linkFit(link.length) === 'file-only') return; // too long for a link: send the file
  showLink(link);
}

async function receive(): Promise<void> {
  const read = await decodeShelfLink(location.hash.slice(1));
  if (!read.ok) return;
  preview(summariseShelfFile(read.value.file)); // name, author, counts, first titles, hosts
  if (confirmed()) store.importShelf(read.value.file); // always a new shelf, and nothing personal comes with it
}
```

Taking links out:

```ts
const library = store.snapshot();
download('backup.json', store.exportLibrary());
download('bookmarks.html', toNetscapeBookmarks({ shelves: library.shelves, bookmarks: library.bookmarks }));
download('list.md', toMarkdownList({ shelfName: 'Reading list', volumes: store.bookmarks(shelfId) }));

const shelf = store.shelves().find((entry) => entry.id === shelfId);
const summary = handInSummary({
  shelfName: shelf?.name ?? '',
  volumes: store.bookmarks(shelfId),
  isDone: (id) => store.isDone(id),
  noteOf: (id) => store.note(id) || undefined,
  minutesOf,
  date: new Date(),
  lang: shelf?.lang,
});
```

All of these names are exported from `./store`. `preview`, `confirmed`, `download` and `showLink` are yours.

## Shelf, motion and reader

A shelf that opens a volume into a reader, with your own data in place of the store. This version has no flight: the shelf leaves the centred volume's place empty while the reader fades in with the cover beside the text. For the cover that travels between the two, copy `src/app/flight.ts` and follow "All four".

```ts
import { createShelfMotion, prefersReducedMotion } from './motion';
import { mountReader, type ReaderHandle } from './reader';
import { createCover, mountShelf, type ShelfItem } from './shelf';

const motion = createShelfMotion({ count: items.length, reducedMotion: prefersReducedMotion });
const shelf = mountShelf(shelfHost, { items, onLoopChange: (loop) => motion.setLoop(loop) });
motion.setLoop(shelf.loop);
motion.setTiming(shelf.variant.motion);
let reader: ReaderHandle | null = null;

motion.subscribe((state) => {
  // While `open` is above 0 the shelf hides the centred volume and parts its neighbours.
  shelf.setPose({ position: state.position, open: state.open, reduced: state.reduced });
  reader?.setReveal(state.openTime); // linear time: the reader eases its own fade
});
motion.attach(shelf.surface, { pxPerItem: () => shelf.pitch(), enabled: () => reader === null && !shelf.fixed });

async function open(item: ShelfItem): Promise<void> {
  if (reader) return;
  const geometry = shelf.variant.geometry;
  const aspect = geometry.coverWidth / geometry.bookHeight;
  reader = mountReader(readerHost, {
    doc: { id: item.id, title: item.title, url: urlOf(item.id), text: textOf(item.id) },
    cover: createCover(item, undefined, { aspect }),
    coverAspect: aspect,
    onClose: () => void close(),
  });
  page.inert = true;
  await motion.setOpen(true);
  reader?.focus();
}

async function close(): Promise<void> {
  const active = reader;
  if (!active) return;
  await motion.setOpen(false);
  active.destroy();
  reader = null;
  page.inert = false;
  shelf.focusCurrent();
}

shelf.on((intent) => {
  if (intent.type === 'focus') motion.goTo(intent.slot);
  else if (intent.type === 'step') motion.step(intent.direction);
  else if (intent.type === 'jump') motion.goTo(intent.to === 'first' ? 0 : items.length - 1);
  else void open(items[intent.index]!);
});
```

`page` is the element that holds everything behind the reader, and `readerHost` sits outside it.

## All four

`src/app/bookshelf.ts` is the reference composition (about 500 lines). Copy it and adapt it. It imports `./bookshelf.css` and `./flight`, and it reaches the modules as `../shelf`, `../motion`, `../store` and `../reader`, so keep it in a folder next to them. Record the commit of this repository you copied from, so a later update can be compared.

The host page needs three elements:

```html
<div id="page">          <!-- everything that should go inert while reading -->
  <div id="shelf"></div>
</div>
<div id="reader"></div>  <!-- outside #page -->
```

```ts
import { createBookshelf } from './app/bookshelf';
import { createStore, type Bookmark } from './store';

const store = createStore();
const bookshelf = createBookshelf({
  store,
  shelfHost: document.querySelector<HTMLElement>('#shelf')!,
  readerHost: document.querySelector<HTMLElement>('#reader')!,
  background: [document.querySelector<HTMLElement>('#page')!],
  onFocusChange: (bookmark) => renderActions(bookmark),
});
addEventListener('pagehide', () => store.flush());

function renderActions(bookmark: Bookmark | undefined): void {
  const actions = bookshelf.shelf.actions;
  actions.replaceChildren();
  if (!bookmark) return;

  const primary = document.createElement('button');
  primary.type = 'button';
  primary.className = 'bb-button bb-button--solid';
  primary.textContent = bookmark.reading ? 'Read' : 'Add text';
  primary.addEventListener('click', () => void bookshelf.open(bookmark.id, { editCopy: !bookmark.reading }));

  const original = document.createElement('a');
  original.className = 'bb-button';
  original.href = bookmark.url;
  original.target = '_blank';
  original.rel = 'noopener noreferrer';
  original.textContent = 'Open original';

  actions.append(primary, original);
}
```

The actions under the centred volume are yours to draw. The honest minimum is the one above: "Read" for a link with text, "Add text" for one without (`open(id, { editCopy: true })` opens the reader with its paste field focused), and always "Open original". The app's own version, with "Resume at 34%" and "Read again", is in `src/app/shell-stage.ts` and `src/app/flow-link-state.ts`.

Other options of `createBookshelf`: `caption: false` and `arrows: false` when the host draws its own, `themePage: false` to keep the look off `<html>`, `label`, `isExample(id)`, and `onOpenChange(bookmark | undefined)`. The result has `shelf`, `motion`, `current()`, `isOpen()`, `show(id)`, `open(id)`, `close()`, `setShelf(id | null)`, `setVariant(name)`, `refresh()` and `destroy()`.

Seeding with your own links: the store's `seed` option must be a function returning a complete library, and it is only written to storage on the first change. For a plain list it is simpler to add through the API, which validates each entry and keeps the text:

```ts
if (store.bookmarks().length === 0) {
  for (const link of links) store.addBookmark({ url: link.url, title: link.title, readingText: link.readingText });
}
```

Do not push such a list through `migrateLibrary` or `importLibrary`: the plain array shape they accept is `{ url, title?, note?, tags? }`, which has no `readingText`.

What `bookshelf.ts` does, in order:

1. Maps the store's links to shelf items (`toShelfItem`): title, hostname as `source`, cloth, pattern, seed, the stored percent as `progress`, `thickness` from the length of the saved text, `stature` from the site, the `outline` of the text, the note, a catalogue `mark` by date added, `done`, and the shelf's `lang`. It orders them by the sort stored in the session.
2. Mounts the shelf with `onLoopChange` forwarded to the motion engine, creates motion with `loop: shelf.loop`, `initial` from `session.focusId` and `timing: shelf.variant.motion`, and attaches gestures that are disabled while the reader is open.
3. On every motion frame: `shelf.setPose(...)`, `flight.set(state.openTime)` while a cover is in the air, and `reader.setReveal(state.openTime)`. It writes `data-settled`, reports the link that is visibly in the centre, and saves `session.focusId` once the row is at rest.
4. Routes intents: `focus` to `motion.goTo(slot)`, `step`, `jump`, and `open` to its own `open(id)`.
5. `open(id)`:
   - remembers what had focus, and switches shelf when the link lives on another one;
   - mounts the reader with `cover: createCover(item, mark, { aspect })`, the stored position, note, read mark, text size and, on a single shelf, the next unread link;
   - sets `--bb-cover-k` on that cover to its width in the reader divided by `shelf.coverSize().width`, so its shadow, corners and hairlines match a cover on the shelf;
   - unless the move is immediate or motion is reduced, puts one more copy of the cover in the air with `createFlight({ cover, start, end, ... })`, where `start` is `shelf.coverPlacement()` and `end` is `reader.flightTarget()`, and hides the reader's own cover meanwhile;
   - makes the page behind `inert`, writes `session.openId`, and awaits `motion.setOpen(true)`;
   - then shows the reader's cover, removes the flight and moves focus into the reader.
6. `close()`: flushes the store, starts a flight back from wherever the reader's cover is now, awaits `motion.setOpen(false)`, destroys the reader, refreshes the row and gives focus back to what opened the reader, or to the centred volume.
7. On load: if `session.openId` exists, `open(id, { immediate: true })`. That is the whole resume feature.
8. On store changes other than `progress` and `session`: with the reader open it calls `reader.update(doc)`, otherwise it rebuilds the row and keeps the centred volume by id.
9. While the reader is opening, a `keydown` listener on the document hands Escape and Tab to `reader.handleKey`, so Escape reverses an opening from its first frame.

The flight (`src/app/flight.ts`) is a fixed layer above everything that holds one cover. The cover is laid out once and only its `transform` changes: `flightPose(time, start, end)` gives the pose for linear time from 0 (standing on the shelf) to 1 (landed beside the page), and the same curve runs backwards on closing. The shelf hides its own volume and the reader hides its own cover while the copy is in the air, so the volume is in exactly one place on every frame. With reduced motion there is no flight and the reader fades in.

`src/app/bookshelf.css` holds the page rules the composition needs: no page scroll behind the open reader, no sideways page scroll from spines that run off the edges, no extra shadow around the cover beside the text, and the flight layer. The shelf root must be able to draw outside its box vertically (it sets `overflow-x: clip` only).

The reader's layout can be tuned with tokens such as `--bb-reader-measure` (the line length) and `--bb-reader-cover-w` (the cover on narrow screens). Read `src/reader/reader.css` before overriding one.

## Framework hosts

Every module mounts into an element and returns a handle with `destroy()`. Write the wiring once as a plain function that returns its own cleanup:

```ts
/** Mounts a draggable shelf and returns the function that takes it away again. */
export function mountDraggableShelf(host: HTMLElement, items: ShelfItem[]): () => void {
  const motion = createShelfMotion({ count: items.length, reducedMotion: prefersReducedMotion });
  const shelf = mountShelf(host, { items, onLoopChange: (loop) => motion.setLoop(loop) });
  motion.setLoop(shelf.loop);
  motion.setTiming(shelf.variant.motion);
  motion.subscribe((state) => shelf.setPose({ position: state.position, open: 0, reduced: state.reduced }));
  motion.attach(shelf.surface, { pxPerItem: () => shelf.pitch(), enabled: () => !shelf.fixed });
  shelf.on((intent) => {
    if (intent.type === 'focus') motion.goTo(intent.slot);
    else if (intent.type === 'step') motion.step(intent.direction);
    else if (intent.type === 'jump') motion.goTo(intent.to === 'first' ? 0 : items.length - 1);
  });
  return () => {
    motion.destroy();
    shelf.destroy();
  };
}
```

React: call it in an effect and return its result.

```ts
export function useShelf(items: ShelfItem[]): { current: HTMLDivElement | null } {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => mountDraggableShelf(host.current!, items), [items]);
  return host; // render <div ref={host} />
}
```

Vue: call it inside `onMounted` and run the returned function inside `onBeforeUnmount`. Svelte: call it inside `onMount` and return its result. Do not render the volumes through the framework's templates: the shelf recycles its own nodes on every frame, and a virtual DOM would fight it. The React lines were type-checked against stand-in declarations of `useRef` and `useEffect`, not against React itself, and none of the three adapters has been run in its framework.

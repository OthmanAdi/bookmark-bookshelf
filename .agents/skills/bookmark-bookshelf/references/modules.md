# Module contracts

Read the section for each module you take. The authoritative types are in the module's `types.ts` (or, for motion, `shelf-motion.ts`); this file explains how to use them.

Contents: [shelf](#shelf) · [motion](#motion) · [store](#store) · [reader](#reader)

## shelf

Entry: `src/shelf/index.ts`. Types: `src/shelf/types.ts`.

```ts
mountShelf(host: HTMLElement, options: ShelfOptions): ShelfHandle
```

Input

| Option | Type | Default | Meaning |
|---|---|---|---|
| `items` | `ShelfItem[]` | required | `{ id, title, source?, author?, mark?, cloth?, pattern?, seed?, progress? }` |
| `variant` | name or `Variant` | `'paper'` | `paper`, `oak`, `night`, `pocket`, or your own object |
| `loop` | boolean | from the variant | endless row or a row with two ends |
| `label` | string | `'Bookshelf'` | accessible name of the region |
| `caption`, `arrows` | boolean | true | built-in title line and previous/next buttons |
| `pose` | `Pose` | `{ position: 0, open: 0 }` | first frame |

`cloth` is one of `ink bone rust moss plum ochre slate teal`; `pattern` one of `arcs bars dots rays tiles waves`. Unknown names fall back to the first. `progress` above 0 adds a ribbon.

Handle

| Member | Use |
|---|---|
| `setPose({ position, open, reduced? })` | Draw one frame. `position` is a float index: 3.4 is 40 % of the way from volume 3 to 4. `open` 0 to 1 flies the centred volume to the stage. |
| `setItems(items)` | Replace the row. Follow with `motion.setCount(n, index)`. |
| `setStage(box \| null)` | Viewport box the cover flies to while opening (the reader's cover slot). |
| `setVariant(name)` | Switch look and geometry. Follow with `motion.setLoop(shelf.loop)` and `motion.setTiming(shelf.variant.motion)`. |
| `pitch()` | Px between two resting volumes at the current scale. Hand it to the motion module. |
| `coverBox()` | Viewport box of the centred cover, the origin of the reader sheet. |
| `focusCurrent()` | Put keyboard focus on the centred volume, for example after closing a reader. |
| `on(listener)` | Intents, see below. Returns an unsubscribe function. |
| `surface` | Element to attach gestures to. |
| `actions` | Empty container under the caption for your buttons. |
| `variant`, `loop`, `element`, `refresh()`, `destroy()` | As named. |

Output: intents

```ts
{ type: 'focus', id, index, slot }   // a volume that is not centred was picked; travel to `slot`
{ type: 'open', id, index }          // the centred volume was activated (click, tap, Enter, Space)
{ type: 'step', direction: -1 | 1 }  // arrow key or arrow button
{ type: 'jump', to: 'first' | 'last' } // Home or End
```

State you can read or assert on (attributes of `.bb-shelf`): `data-focus` (index), `data-focus-id`, `data-open` (`0`, `moving`, `1`), `data-variant`, `data-empty`. Books are `li.bb-book` with `data-id`, `data-index`, `data-slot`; the centred one has class `is-centre`.

Sizing: the scene height comes from the CSS variable `--bb-shelf-height` on `.bb-shelf`. The shelf scales its geometry to fit that height and the available width.

Also exported: `createCover(item)` (a standalone cover element that sizes its type from its own width), `createCoverArt(pattern, seed)`, the pure layout functions (`computeRow`, `visibleRange`, `restPitch`, `scaleGeometry`), `VARIANTS`, `listVariants()`.

## motion

Entry: `src/motion/index.ts`.

```ts
createShelfMotion(options: ShelfMotionOptions): ShelfMotion
```

| Option | Default | Meaning |
|---|---|---|
| `count` | required | number of items |
| `loop` | true | unbounded position that the renderer wraps |
| `initial` | 0 | starting index |
| `reducedMotion` | false | boolean, or a function read on every move |
| `clock` | browser | pass `createManualClock()` in tests |
| `timing` | spring travel, 900 ms open, 640 ms close, no hold | `{ travel, openDuration, closeDuration, openHold }` in ms. `travel` is `null` (spring) or `{ base, perItem, max }` for eased programmed moves lasting `min(max, base + perItem * (items - 1))`. Pass `shelf.variant.motion` |
| `spring`, `openDuration`, `closeDuration` | | finer tuning; the two durations are shorthand for the `timing` fields |

| Member | Use |
|---|---|
| `state` | `{ position, velocity, target, focus, open, openTarget, dragging, settled, reduced }`. Read-only; the same object is reused. |
| `subscribe(listener)` | Called once immediately and on every frame that changed something. Draw here. |
| `goTo(index, { immediate? })`, `step(±1)` | Travel. With `loop`, indices are unbounded: `goTo(state.target + 12)` goes once round a 12-item row. |
| `setOpen(boolean, { immediate? })` | Promise that resolves when the open or close finished or was reversed. |
| `attach(element, { pxPerItem, enabled? })` | Pointer drag, flick and horizontal wheel. Returns a detach function. |
| `setTiming(partial)` | Change travel or open timing at run time, for example after a look change. |
| `setCount(n, focus?)`, `setLoop(boolean)`, `destroy()` | As named. |

Behaviour: with `openHold` above 0, `state.open` reads a tiny positive value during the hold, so a renderer can show at once that the trigger landed. Drag follows the pointer 1:1; release snaps to the nearest whole index with a critically damped spring (no overshoot, about 0.6 s), whatever the travel timing; a flick (0.35 px/ms or faster after 24 px of travel) carries up to 6 volumes; a row with two ends resists past its ends; plain vertical wheel is left to the page.

Lower-level exports for other uses: `attachDrag(element, handlers, options)`, `stepSpring`, `createManualClock`, easing functions.

## store

Entry: `src/store/index.ts`. Types: `src/store/types.ts`.

```ts
createStore(options?: StoreOptions): Store
```

Options: `storage` (defaults to `localStorage`, or memory when it is blocked), `key`, `seed` (library used when nothing is stored), `now`, `idFactory`, `syncTabs`, `progressDelay`.

Data shape, version 1:

```ts
{
  format: 'bookmark-bookshelf', version: 1,
  shelves:   [{ id, name, order }],
  bookmarks: [{ id, url, title, author?, note?, tags, shelfId, order, addedAt, updatedAt,
                cover: { cloth, pattern, seed }, reading?: { format: 'markdown-lite', text, savedAt } }],
  progress:  { [bookmarkId]: { block, ratio, percent, updatedAt } },
  session:   { shelfId, focusId, openId, view: 'shelf' | 'list', variant }
}
```

Methods return copies. Mutations that can fail return `Result<T>`: `{ ok: true, value }` or `{ ok: false, error: { code, message, field? } }`. Codes include `invalid-url`, `not-found`, `duplicate-shelf`, `last-shelf`, `unsupported-version`, `invalid-format`, `quota`.

| Group | Methods |
|---|---|
| read | `snapshot()`, `shelves()`, `bookmarks(shelfId?)`, `get(id)`, `progress(id)`, `session()`, `persistence` |
| bookmarks | `addBookmark(input)`, `updateBookmark(id, patch)`, `removeBookmark(id)` (returns the entry for undo), `restoreBookmark(entry)`, `moveBookmark(id, { shelfId?, index? })` |
| shelves | `addShelf(name)`, `renameShelf(id, name)`, `removeShelf(id, moveTo?)` |
| reading | `setProgress(id, { block, ratio, percent })` (coalesced write), `clearProgress(id)`, `flush()` |
| session | `setSession(patch)` |
| portability | `exportLibrary()` (JSON text), `importLibrary(input, 'replace' \| 'merge')` |
| events | `subscribe(({ reason }) => …)` with reason `bookmarks`, `shelves`, `progress`, `session`, `replace`, `external` |

Rules worth knowing: URLs are normalised and must be `http:` or `https:`; a missing scheme becomes `https://`. Unreadable stored data is copied to `<key>:backup-<timestamp>` before the seed is used. `migrateLibrary(raw)` also accepts a plain array of `{ url, title? }` as a legacy shape. Call `store.flush()` on `pagehide`.

## reader

Entry: `src/reader/index.ts`. Types: `src/reader/types.ts`.

```ts
mountReader(host: HTMLElement, options: ReaderOptions): ReaderHandle
```

| Option | Meaning |
|---|---|
| `doc` | `{ id, title, url, author?, addedAt?, note?, tags?, text? }`. `text` is markdown-lite. Empty text shows the paste panel. |
| `progress` | `{ block, ratio, percent }` to restore |
| `cover` | any element to place in the cover slot (for example `createCover(item)` from the shelf) |
| `coverAspect` | width / height of that cover, default 0.62 |
| `onProgress(p)` | after the person scrolls |
| `onClose()` | Escape or the close button. The reader does not remove itself: call `destroy()` |
| `onSaveText(text)` | enables the paste panel and the edit button |
| `labels` | override any UI string |

The reader starts hidden. Call `setReveal(1)` to show it at once, or drive `setReveal(progress, fromBox)` from 0 to 1 for the grow-from-a-box transition (transforms only; pass eased values).

Other handle members: `element` (`role="dialog"`), `scroller`, `coverSlotRect()`, `setCoverVisible(boolean)`, `focus()`, `update(doc)`, `progress()`, `destroy()`.

Markdown-lite: `#` and `##` headings (rendered as h2), `###` (h3), paragraphs, `> ` quotes, `- ` and `1. ` lists, `---`, fenced code, `**strong**`, `*em*`, `` `code` ``, `[label](https://…)`. Anything else, including HTML, is plain text.

`percent` in progress is 0 to 1. `labels.progress` receives a whole number from 0 to 100.

# Module contracts

Read the section for each module you take. The authoritative types are in the module's `types.ts` (for motion, `shelf-motion.ts`). This file describes version 0.3.0 and explains how to use them. The blocks here are sketches of a signature or a shape, not code to paste. Code to paste is in composition.md.

Contents: [shelf](#shelf), [motion](#motion), [store](#store), [reader](#reader), [changed since 0.1.0](#changed-since-010)

## shelf

Entry: `src/shelf/index.ts`. Types: `src/shelf/types.ts`.

```text
mountShelf(host: HTMLElement, options: ShelfOptions): ShelfHandle
```

Options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `items` | `ShelfItem[]` | required | the volumes, in row order |
| `variant` | name or `Variant` | `'paper'` | `paper`, `oak`, `night`, `pocket`, or your own object |
| `loop` | boolean | from the variant | a wish. The shelf decides whether the row loops (see "Looping and standing") |
| `onLoopChange` | `(loop) => void` | none | called when the row starts or stops looping after mounting |
| `label` | string | `'Bookshelf'` | accessible name of the region |
| `caption`, `arrows` | boolean | true | the built-in title line and the previous and next buttons |
| `pose` | `Pose` | `{ position: 0, open: 0 }` | first frame |

A `ShelfItem`

| Field | Meaning |
|---|---|
| `id`, `title` | required |
| `source` | short origin, usually the hostname. It names the imprint at the foot of the cover and decides the cover layout, the spine treatment and the device on the spine, so links from one site look like one series |
| `author` | printed under the title on the cover |
| `mark` | catalogue mark, for example `"07"`. Defaults to the position in the row. Only the `pocket` look prints it on the spine |
| `cloth` | one of `ink bone rust moss plum ochre slate teal`. An unknown name falls back to the first |
| `pattern` | one of `arcs bars dots rays tiles waves`. An unknown name falls back to the first |
| `seed` | number that varies the drawing |
| `progress` | 0 to 1. Above 0 a slip of card stands in the pages |
| `thickness` | 0 to 1. Spine width is the look's width times `0.62 + 0.6 * thickness`, never under 30 px. Left out, every volume has the look's width |
| `stature` | 0 to 1. Height is the look's height times `0.90 + 0.10 * stature`. The cover keeps one proportion, so a shorter volume has a narrower cover |
| `outline` | the shape of a saved text: one value per paragraph, 0 to 1 by length, negative for a heading. When present the cover prints it as its plate in place of the pattern |
| `lang` | BCP 47 tag of the title, for hyphenation on the cover |
| `note` | one line shown in the built-in caption in place of the source |
| `done` | true shows a tick on the cover and the spine, and no slip |

Handle

| Member | Use |
|---|---|
| `setPose({ position, open, reduced? })` | Draws one frame. `position` is a float index: 3.4 is 40 % of the way from volume 3 to volume 4. While `open` is above 0 the shelf hides the centred volume and moves its neighbours apart a little. It does not fly the cover: the host does (see composition.md). With `reduced` the row stays as it is |
| `setItems(items, change?)` | Changes what stands in the row. A volume whose item stays (same `id`) keeps its element and travels to its new place, and under reduced motion it is there at once. `change.arrive` lists ids the person has just added, which the shelf brings in from above. Follow with `motion.setCount(n, index)` |
| `setVariant(name)` | Switches the look. Follow with `motion.setLoop(shelf.loop)` and `motion.setTiming(shelf.variant.motion)` |
| `loop` | whether the row repeats endlessly right now |
| `fixed` | true while the row is short enough to stand whole in the scene. Do not let the wheel move such a row. A drag either is disabled (`enabled: () => !shelf.fixed`) or goes through `trackFrom`, which lets the row follow the hand as far as its first and last volume |
| `trackFrom(start)` | for a drag that begins: a function from pointer x to row position that keeps the grabbed volume under the hand. It has the shape `motion.attach` asks of `track` |
| `onFrame(listener)` | calls the listener with a `ShelfFrame` for every frame the shelf draws, after the DOM is written, and once straight away. It is how a second renderer such as Studio paints the same row. Returns a function that stops it |
| `pitch()` | mean px between two resting volumes at the current scale. Hand it to the motion module |
| `pitchAt(position)` | px the row moves for one unit of position near `position`, for rows whose volumes differ in thickness |
| `coverSize()` | layout width and height of a cover at the current scale |
| `coverBox()` | viewport box of the centred cover as drawn, or null without items |
| `coverPlacement()` | where the centred cover stands: centre, size, lean, yaw, the scale perspective adds, and its highlight. It is the start of a flight |
| `focusCurrent()` | puts keyboard focus on the centred volume, for example after closing a reader |
| `on(listener)` | intents, see below. Returns an unsubscribe function |
| `surface` | the element to attach gestures to |
| `actions` | an empty container under the caption for your buttons |
| `variant`, `element`, `refresh()`, `destroy()` | as named |

Intents

```text
{ type: 'focus', id, index, slot }     // a volume that is not centred was picked: travel to `slot`
{ type: 'open', id, index }            // the centred volume was activated (click, tap, Enter, Space)
{ type: 'step', direction: -1 | 1 }    // arrow key or arrow button
{ type: 'jump', to: 'first' | 'last' } // Home or End
```

Looping and standing. A row loops only when its volumes at rest fill at least four fifths of the scene. A shorter row stands still in the middle of the scene with a bookend at each end: `fixed` is true, `loop` is false, and the position only says which volume is presented. Both values change with the items, the width of the scene and the look, so read them when you need them and forward `onLoopChange` to `motion.setLoop`.

State you can read or assert on, as attributes of `.bb-shelf`: `data-focus` (index), `data-focus-id`, `data-open` (`0`, `moving`, `1`), `data-variant`, `data-empty`, `data-loop` and `data-fixed` (`0` or `1`). A volume is `li.bb-book` with `data-id`, `data-index` and `data-slot`, and the centred one has the class `is-centre`. Each real volume holds one `button.bb-book__control` whose name reads "Title. Source. Volume 3 of 14". Copies in a looping row are `aria-hidden` and have no button.

Sizing. The scene's height is the CSS variable `--bb-shelf-height` on `.bb-shelf`. The shelf scales its geometry between 0.5 and 1.5 times to fit that height and the width it has.

Looks. A `Variant` is `{ name, label, summary, geometry, motion, light?, loop }`. The four built in carry the same `motion` (`travel: null`, 720 ms to open, 520 ms to close) and differ in geometry, light and CSS. The CSS for a look is scoped to `data-variant` on the shelf and on the page root, because a cover also appears outside the shelf. Set `data-variant` on `<html>` when you switch.

Also exported: `createCover(item, mark?, { aspect? })` (a standalone cover element that sizes its type from its own width), `createCoverArt(pattern, seed, aspect)`, `VARIANTS`, `listVariants()`, `resolveVariant()`, `CLOTHS`, `PATTERNS`, the pure layout functions (`computeRow`, `computeStandingRow`, `rowStands`, `restLength`, `visibleRange`, `pitchAt`, `restPitch`, `volumeSize`, `scaleGeometry` and others) and the light functions (`faceShades`, `sheenOf`, `sweepOf`, `lampReach`).

## motion

Entry: `src/motion/index.ts`. Types: `src/motion/shelf-motion.ts`.

```text
createShelfMotion(options: ShelfMotionOptions): ShelfMotion
```

| Option | Default | Meaning |
|---|---|---|
| `count` | required | number of items |
| `loop` | true | unbounded position that the renderer wraps |
| `initial` | 0 | starting index |
| `reducedMotion` | false | a boolean, or a function read on every move. Pass `prefersReducedMotion` |
| `clock` | browser | pass `createManualClock()` in tests |
| `timing` | `DEFAULT_TIMING` | `{ travel, openDuration, closeDuration, openHold }` in ms. The default is spring travel, 700 to open and 520 to close. `travel` is `null` (the spring) or `{ base, perItem, max }` for eased moves. `openHold` is accepted and ignored |
| `spring`, `openDuration`, `closeDuration` | | finer tuning. The two durations are shorthand for the `timing` fields |

| Member | Use |
|---|---|
| `state` | `{ position, velocity, target, focus, overscroll, open, openTime, openTarget, dragging, settled, reduced }`. Read-only, and the same object is reused |
| `subscribe(listener)` | called once at once and on every frame that changed something. Draw here |
| `goTo(index, { immediate? })`, `step(±1)` | travel. With `loop`, indices are unbounded: `goTo(state.target + 12)` goes once round a 12-item row |
| `setOpen(boolean, { immediate? })` | a promise that resolves when the open or close has finished or was reversed |
| `attach(element, options)` | pointer drag, flick and sideways wheel. Returns a detach function |
| `setTiming(partial)`, `setCount(n, focus?)`, `setLoop(boolean)`, `destroy()` | as named |

`attach` options: `pxPerItem` (required, a function), `extent` (width of the scene in px, which bounds how far a row with two ends can be pulled past its end), `enabled` (return false to ignore a press, for example while a reader is open or the row is `fixed`), and `track`. `track(start)` is called when a drag begins with `{ x, target, position }`. Return a function from pointer x to row position and the drag follows it, so what was grabbed stays under the pointer whatever the spacing. Return null to drag by `pxPerItem`.

Behaviour worth knowing:

- `open` is eased and `openTime` is the same move in linear time, 0 to 1. Use `openTime` when you ease each property yourself, as the reader and the flight do. Reversing keeps both continuous.
- Arrow steps, picked spines and released drags all settle on one critically damped spring (stiffness 200, about 340 ms to cover 95 % of one volume). A second step keeps the speed the row has, and repeated steps never aim more than two volumes past what is visible.
- A drag follows the pointer 1:1. Release speed is taken from the last 80 ms. Every release is projected forward before it snaps, so a gentle push does not slide back. A flick (0.35 px/ms or faster after 24 px of travel) carries at least one volume and at most six.
- A row with two ends gives progressively less when pulled past an end. `state.overscroll` says by how many items.
- A plain vertical wheel is left to the page. A sideways wheel, or Shift with the wheel, moves the row.
- With reduced motion, moves are instant and an open or close is a 150 ms linear fade.

Lower-level exports: `attachDrag(element, handlers, options)`, `stepSpring`, `SETTLE_SPRING`, `createManualClock`, `browserClock`, the easing functions, `clamp`, `lerp`, `smoothstep`, `wrapIndex`.

## store

Entry: `src/store/index.ts`. Types: `src/store/types.ts`.

```text
createStore(options?: StoreOptions): Store
```

Options: `storage` (defaults to `localStorage`, or memory when it is blocked), `key`, `seed` (a function returning the library used when nothing is stored, version 1 or 2), `now`, `idFactory`, `syncTabs`, `progressDelay`.

Data shape, version 2:

```text
{
  format: 'bookmark-bookshelf', version: 2,
  shelves:   [{ id, name, order, description?, lang?, author?, due? /* YYYY-MM-DD */, origin? }],
  bookmarks: [{ id, url, title, author?, note?, tags, shelfId, order, addedAt, updatedAt,
                cover: { cloth, pattern, seed }, reading?: { format: 'markdown-lite', text, savedAt },
                required? /* only false is stored */, minutes? /* 1 to 600 */, origin? }],
  progress:  { [bookmarkId]: { block, ratio, percent, updatedAt } },
  done:      { [bookmarkId]: isoTimeItWasMarkedRead },
  notes:     { [bookmarkId]: privateNote /* at most 2,000 characters */ },
  session:   { shelfId, focusId, openId, view: 'shelf' | 'list', variant, textScale?, sort? }
}
```

Everything personal (`progress`, `done`, `notes`) lives in maps next to the links, so a shelf can be handed to someone without taking any of it. A version 1 library is upgraded when it is read. A library written by a newer version opens read-only: `store.readOnly` is true and every change answers `read-only`. The library is stored under `key` and the session under `<key>:session`.

Methods return copies. Mutations that can fail return `Result<T>`: `{ ok: true, value }` or `{ ok: false, error: { code, message, field? } }`. Codes include `invalid-url`, `too-long`, `not-found`, `duplicate-shelf`, `last-shelf`, `unsupported-version`, `invalid-format`, `quota` and `read-only`. A write that storage refuses is undone, so what the store holds is what is saved.

| Group | Methods |
|---|---|
| read | `snapshot()`, `shelves()`, `bookmarks(shelfId?)`, `get(id)`, `findByUrl(url, exceptId?)`, `progress(id)`, `session()` |
| state of storage | `persistence` (`local` or `memory`), `readOnly`, `usage()`, `lastError()` |
| links | `addBookmark(input)`, `updateBookmark(id, patch)`, `moveBookmark(id, { shelfId?, index? })`, `removeBookmark(id)` and `restoreBookmark(entry)`, `removeBookmarks(ids)` and `restoreBookmarks(entries)` |
| shelves | `addShelf(name)`, `renameShelf(id, name)`, `updateShelf(id, patch)`, `removeShelf(id, moveTo?)` and `restoreShelf(entry)` |
| reading | `setProgress(id, { block, ratio, percent })` (a coalesced write), `clearProgress(id)`, `isDone(id)`, `setDone(id, done)`, `note(id)`, `setNote(id, text)`, `flush()` |
| session | `setSession(patch)` |
| in and out | `exportLibrary()` (JSON text), `importLibrary(input, 'replace' \| 'merge')`, `exportShelf(id, { includeTexts })`, `importShelf(file)`, `importFolders(folders, options?)`, `importLinks(entries, shelfId)` |
| events | `subscribe(({ reason }) => …)` with reason `bookmarks`, `shelves`, `progress`, `done`, `notes`, `session`, `replace` or `external` |

Rules worth knowing:

- An address must be `http:` or `https:`. A missing scheme becomes `https://` only when the input looks like a host. Credentials in an address are refused, and known tracking parameters (`utm_*`, `fbclid`, `gclid` and others) are removed on save.
- An import never changes a link that is already saved. `ImportSummary` is `{ added, unchanged, shelvesAdded, skipped, updated }`, where `skipped` lists `{ title, url, reason }` and `updated` is always 0. In `merge` mode the incoming reading positions, read marks, notes and session are ignored.
- `importShelf` always makes one new shelf with new ids, named "Name (2)" when the name is taken, and records where it came from in `origin`.
- Unreadable stored data is copied to a backup key before the seed is used.
- `migrateLibrary(raw)` also accepts a plain array of addresses or of `{ url, title?, note?, tags? }`. That shape has no `readingText`.
- Call `store.flush()` on `pagehide`.

Pure functions, all exported from the same entry and usable without a store:

| For | Functions |
|---|---|
| a browser's bookmarks file | `isNetscapeBookmarks(text)`, `parseNetscapeBookmarks(html)` giving `{ folders, skipped }`, `toNetscapeBookmarks({ shelves, bookmarks })` |
| a pasted list | `parseLinkList(text)` giving `{ entries, unreadable }` |
| one shelf as a file | `readShelfFile(input)`, `summariseShelfFile(file)`, `shelfFileName(name)`, `SHELF_FILE_LIMITS` |
| one shelf as a link | `encodeShelfLink(file)`, `decodeShelfLink(fragment)`, `linkFit(length)` giving `chat`, `browser` or `file-only` |
| a page sent in the address | `parseAddRequest({ hash, search })`, `bookmarkletSource(appUrl)` |
| finding and ordering | `searchVolumes(volumes, query, { includeText?, limit? })`, `sortVolumes(volumes, mode, context)`, `SORT_MODES` |
| reading status | `shelfStats(volumes, context)`, `formatShelfStatus(stats)`, `minutesOf(volume)`, `formatMinutes(total)`, `handInSummary(input)` |
| lists for other tools | `toMarkdownList({ shelfName, volumes })` |

A shelf link is `#shelf=1.<codec>.<data>`, where the codec is `d` (deflated with the platform's `CompressionStream`) or `r` (plain, where there is none). Decoding refuses a payload over 64,000 characters and stops once the decoded size passes 1.5 MB. A shelf file holds at most 500 links and 5 MB. Neither applies anything by itself: show `summariseShelfFile` and let the person decide.

## reader

Entry: `src/reader/index.ts`. Types: `src/reader/types.ts`.

```text
mountReader(host: HTMLElement, options: ReaderOptions): ReaderHandle
```

| Option | Meaning |
|---|---|
| `doc` | `{ id, title, url, author?, addedAt?, note?, tags?, text?, lang? }`. `text` is markdown-lite, and empty text shows the paste panel. `lang` sets hyphenation and the format of the saved date |
| `progress` | `{ block, ratio, percent }` to restore |
| `cover` | any element to place in the cover slot, for example `createCover(item)` from the shelf |
| `coverAspect` | width divided by height of that cover, default 0.62 |
| `onProgress(p)` | after the person scrolls |
| `onClose()` | Escape or the "Back to shelf" button. The reader does not remove itself: call `destroy()` |
| `onSaveText(text)` | enables the paste panel and the "Edit text" button |
| `myNote`, `onMyNote(text)` | the private notes area. `onMyNote` is called after a pause in typing and at once on close |
| `done`, `onDone(done)` | the "Mark as read" button after the last paragraph. Without `onDone` it is not shown. Reaching the end never marks anything |
| `next`, `onNext()` | `{ title, minutes? }` of the following link, shown beside "Mark as read" |
| `textScale`, `onTextScale(scale)` | body size as a step from 0 to 4 (17, 19, 21, 24 and 28 px). Without it the size follows the screen |
| `example` | adds a line under the title saying that the text was written for the app and is not the linked page |
| `labels` | overrides any UI string |

The reader starts hidden. Call `setReveal(1)` to show it at once, or drive `setReveal(time)` with linear time from 0 to 1, for example `motion.state.openTime`. The sheet covers the viewport and fades in between 0.17 and 0.60, and the text enters after 0.54. A second argument is accepted and ignored.

Other handle members: `element` (`role="dialog"`), `scroller`, `coverSlotRect()`, `flightTarget()` (where a carried cover should land, always on screen: the cover's own place, or a thumbnail in the bar when that has scrolled away), `setCoverVisible(boolean)`, `handleKey(event)` (Escape and Tab, for a host that routes keys while the reader is still opening), `setMyNote(text)`, `setDone(done)`, `setNext(next | null)`, `focus()`, `update(doc)`, `progress()`, `destroy()`. The reader puts focus on its close button when it mounts.

Markdown-lite: `#` and `##` headings (rendered as h2), `###` (h3), paragraphs, `> ` quotes, `- ` and `1. ` lists, `---`, fenced code, `**strong**`, `*em*`, `` `code` ``, `[label](https://…)`. A line break inside a paragraph is kept, and a line that starts with a typographic bullet becomes a list item. Anything else, including HTML, is plain text. After each link the reader prints the site it goes to.

`percent` in progress is 0 to 1. `labels.progress` receives a whole number from 0 to 100.

Also exported: `parseMarkdownLite`, `renderBlocks`, `positionFromMetrics`, `scrollTopFor`, `estimateMinutes`, `defaultReaderLabels`.

## Added in 0.3.0

Nothing in 0.3.0 breaks a host written against 0.2.0, with one exception: `Session.view` has a third value, `'showcase'`, so code that handles every view needs a branch for it.

- Shelf: `onFrame()` with the types `ShelfFrame`, `FrameVolume` and `FrameBookend`. `ShelfItem` has `binding`, `stamp`, `handled` (0 to 1) and `age` (days), which the CSS shelf ignores.
- Shelf: on a standing row the function from `trackFrom()` follows the hand. In 0.2.0 it returned the same position throughout.
- Store: `CoverSpec.binding` and `CoverSpec.stamp` are lower-case names of at most 16 letters, kept without a check against a list. An empty name in a patch removes the choice. Shelf files and shelf links carry both. `Session.paint` is `'classic'` or `'studio'`, and absent means classic.
- Studio (`src/studio`, needs `three`): `mountStudio(shelf, { kit, onFailure })` returns `{ canvas, setKit(), createFlight(), destroy() }` and throws without WebGL 2. `webglAvailable()` tells beforehand. `createKit(renderer)` is in `src/studio/kit.ts`.
- Showcase (`src/showcase`): `mountShowcase(host, options)` returns `{ element, index, paint, setItems(), show(), setLook(), setPaint(), refresh(), focus(), destroy() }`.

## Changed since 0.1.0

If the host was written against 0.1.0, these are the differences that break it.

- `ShelfHandle.setStage()` is gone, and the shelf no longer flies the cover. Carry a copy yourself or let the reader fade in.
- `ShelfOptions.loop` no longer forces a looping row. Forward `onLoopChange` and respect `fixed`.
- `VariantMotion.swap` is optional and ignored, and Paper Row no longer has eased travel or an opening hold.
- `DragHandlers` are `onStart(event, origin)`, `onMove(dx, event, x)` and `onEnd(velocityX, cancelled, time)`.
- The library is version 2. `snapshot()` and `seed` use the new shape, `ImportSummary` has `unchanged` and a list in `skipped`, and `removeShelf()` returns a value for `restoreShelf()`.
- `reader.setReveal(progress, from)` ignores `from` and expects linear time.
- `ReaderLabels` has new keys, and the defaults changed ("Back to shelf", "Edit text", "Save text").

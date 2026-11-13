# Changelog

## 0.3.0 (unreleased)

This release adds Studio, a second drawing of the shelf in WebGL with lit materials, and Showcase, a view of one large book at a time. The CSS shelf stays the default under the name Classic. A visit that never chooses Studio never downloads three.js.

Nothing was removed, and a library, a backup, a shelf file or a shelf link written by 0.2.0 opens unchanged. People who reuse a module should read the last part of "Added" and of "Changed".

### Added

In the app:

- A Drawing switch at the top of the View menu, Classic or Studio, with one line under it that sums up the choice or says why Studio is not available ("Needs WebGL2, which this browser does not offer.", "Not drawn in forced colours."). While Studio loads, that line reads "Preparing…". The choice is kept with the session. `app.html?paint=studio` opens the shelf in Studio and `app.html?paint=classic` in Classic, for that visit only.
- When the browser takes the WebGL context away, or Studio cannot start, the shelf goes back to Classic and a message says so, with a button to try Studio again.
- Under forced colours the shelf, Showcase and the homepage are drawn in Classic, and a shelf set to Studio returns to it when forced colours are turned off.
- Studio watches how far apart its frames come while the row moves. Where they run slow it draws fewer device pixels per px, smaller shadow maps and coarser faces, a step at a time, so the shelf's motion keeps its pace.
- The View menu stays open while a look or a drawing is chosen, so looks can be compared in one visit. A view, Escape or a click outside closes it.
- Studio paints the row in a canvas behind the DOM shelf, with a camera that repeats the CSS perspective. The DOM volumes stay where they are with transparent faces, so every control, focus ring, gesture and announcement is the one Classic has.
- Eight bindings (book cloth, linen, leather, paper over boards, gloss laminate, velvet, metal foil, holographic foil) and six title stamps (gold foil, silver foil, copper foil, holographic foil, blind deboss, printed ink). All surfaces are generated in code when the page runs. Each volume has a contact shadow and stands on a floor in the material of its look: paper-covered board, oiled oak, dark lacquered wood or painted pine. The light follows the pointer.
- A link without a choice of its own gets a binding and a stamp from its seed, so it looks the same on every visit. A foil that does not reach a contrast of 4.5 to 1 on its cloth gives way to one that does, or to printed ink. A spine title under 14 px is printed, and so is every title under `prefers-contrast: more`. In Pocket Paperbacks such a volume is bound in paper or gloss laminate.
- The editor has a group "How it looks" right under the shelf choice: a row of Binding swatches and a row of Title stamp swatches, each starting with Automatic, beside a small book that shows the link with that binding and stamp before anything is saved. In Studio the small book is lit and turns once after each change; in Classic it is the CSS cover with a note and a button to switch to Studio. A stamp that would be hard to read on the cover stays selectable and says so. A choice made there is kept as it is and travels in backups, shelf files and shelf links.
- A volume in Studio shows its use. The spine fades and yellows a little with the days since the link was saved. Edges and corners rub, and foil dulls at the head of the spine, as the link is read, marked as read or given a note.
- Page motion in Studio. Under the pointer the presented cover opens, a quarter of the way at the hinge and fully at the fore-edge, and its leaves fan behind it with a lag. A volume that arrives at the centre flutters its pages for a moment. Opening a link flies the lit volume to the page with its cover opening and its pages fanning, and it lands as the flat cover the reader shows. With reduced motion none of this moves.
- Showcase, a third view in the View menu. It shows one large book beside its title, byline, note, reading state, progress and tags, with the same actions as the caption under the row, and a rail of ticks for all books of the shelf. The wheel, the up and down arrow keys (or `j` and `k`), Page Up and Page Down, Home and End, a vertical swipe, the ticks and two buttons move between books. The book turns toward the pointer, can be spun by dragging, and opens a little under the pointer or keyboard focus. It is lit when the drawing is Studio. With reduced motion one book fades into the next in 150 ms.
- The homepage opens on one large book beside the title. It is painted with CSS at once. Where WebGL 2 is available and reduced motion, data saving and forced colours are all off, the lit drawing is fetched afterwards, the book turns into its pose over 1350 ms, and after that it tilts toward the pointer.
- Two examples. `examples/studio-shelf.html` is the shelf and the motion engine with Studio over them, a binding and a stamp for the whole row, and a switch that takes Studio away again. `examples/materials.html` is a material lab with one volume for each binding.

For people who reuse a module:

- Shelf: `ShelfHandle.onFrame(listener)` reports every frame the shelf draws, after the DOM is written, so that a second renderer can paint the same row. The listener gets a `ShelfFrame`: the scene element, its size and perspective, the light, `gap`, `rowGive`, the volumes as `FrameVolume` (item, element, sizes and each term of the transform) and the bookends as `FrameBookend`. It is called once straight away, and nothing is collected while no one listens. The three types are exported from `src/shelf/index.ts`.
- Shelf: `ShelfItem.binding`, `stamp`, `handled` (0 to 1) and `age` (days on the shelf), for a renderer that draws materials. The CSS shelf ignores all four.
- Store: `CoverSpec.binding` and `CoverSpec.stamp`, lower-case names of at most 16 letters. The store does not check them against a list, so a library from a newer version keeps names this one does not know. An empty name in a patch removes the choice. Shelf files and shelf links write both, and only for links that have them.
- Store: `Session.paint` (`'classic'` or `'studio'`, absent means Classic), with `PAINT_NAMES` and `PaintName`.
- Studio, a new folder `src/studio` that needs `three`: `mountStudio(shelf, { kit, onFailure })` returns a `StudioHandle` with `canvas`, `setKit()`, `createFlight()` and `destroy()`. It throws without WebGL 2, which `webglAvailable()` tells beforehand. `createKit(renderer)` in `src/studio/kit.ts` makes the materials. Without a kit, volumes are drawn in plain lit cloth. `BINDINGS`, `STAMPS` and their labels are in `src/studio/types.ts`, which imports nothing, so a page can list them without loading three.js. Studio imports from `src/shelf` and from `src/app/flight.ts`.
- Showcase, a new folder `src/showcase`: `mountShowcase(host, options)` returns a `ShowcaseHandle` with `setItems()`, `show()`, `setLook()`, `setPaint()`, `refresh()`, `focus()` and `destroy()`. It draws with CSS and imports its WebGL drawing, and with it Studio and three.js, only when the `studio` paint is asked for.
- Composition: the object `createBookshelf()` returns has `paint` and `setPaint()`, and the options take `onPaintFailure`. The bookshelf hands each shelf item its `binding`, `stamp`, `handled` and `age`.

### Changed

- A row that stands still between its bookends follows the hand: one volume for each pitch of travel, as far as its first and last volume, and a release carries on at the speed it had. In 0.2.0 such a row gave 28 px under a pull and counted any swipe as one step. With reduced motion it still does.
- A spine rises for a pointer that stays. The way up waits 70 ms and takes 200 ms, and a mouse moving faster than 0.4 px per millisecond raises nothing until it slows down. In 0.2.0 a sweep along the row raised every spine in turn.
- The package has its first runtime dependency, `three` 0.187.0 (MIT), with `@types/three` for development. The build puts three.js in a chunk of its own: 541 kB, or 132 kB gzipped. Choosing Studio also loads 81 kB of Studio code (32 kB gzipped). Without Studio the app page loads 268 kB of JavaScript before compression (98 kB gzipped). In 0.2.0 that was about 234 kB (85 kB gzipped).

For people who reuse a module:

- Shelf: on a row that stands still, the function `trackFrom()` returns now gives positions that go with the hand. It used to return the same position throughout. A host that passes it to `motion.attach` as `track` gets the new behaviour with no change, and a host that disables the drag with `enabled: () => !shelf.fixed` keeps a row that a drag does not move.
- Store: `Session.view` has a third value, `'showcase'`. Code that handles every view needs a branch for it.
- Composition: `src/app/bookshelf.ts` imports `src/studio` on demand, so a copy of it needs that folder and `three`, or the `setPaint` function taken out.

### Fixed

- A hard throw let go just after a slow frame was released with no speed at all. The speed is now measured against the move before it.
- A row that a hand had drawn more than six volumes along slid back to the sixth on release. It now settles where it was let go, and the limit of six only bounds what a throw adds.
- A raised spine dipped under the floor line on its way down. It now comes down in 150 ms without going past its rest.

### Known limits

- During travel along the row, Studio draws each frame one frame after the DOM volumes it covers. On a 60 Hz screen that is about 16 ms.
- On a device that cannot keep up, Studio lowers its detail as it goes, and a browser that draws WebGL in software starts with less. The browser tests run on such a renderer; one test of the flight (Escape while the volume is in the air, phone size) passes only some of the time there.
- Studio needs WebGL 2. Without it the Studio item in the View menu is marked unavailable ("Needs WebGL2, which this browser does not offer.") and the shelf stays in Classic.
- Studio and Showcase are covered by the browser tests in Chromium only. The WebKit smoke run does not reach them, and Firefox is not covered at all.
- The reader never fetches pages, and there is no sync between devices, as before.
- The skill trials were run against 0.1.0 and have not been repeated.

## 0.2.0 (2026-11-11)

The first public release. It makes the shelf useful for more than a handful of links: many links come in at once, one can be found again, and a shelf can be handed to someone else. The volumes, their covers, the lighting and the move between shelf and page were rebuilt.

People who reuse a module should read "Changed" and "Removed": several contracts differ from 0.1.0.

### Added

In the app:

- Bring links in from the bookmarks file a browser exports, from a pasted list, or from a library or shelf file. Folders become shelves, a nested folder is named "Parent / Child", and links outside any folder go to a shelf called "Imported". Every route shows a preview first, with what will be added, what is already saved and what will be skipped and why. A file dropped anywhere on the page goes the same way, and a dropped link opens the add dialog.
- A pasted list takes one link per line: a Markdown link, `Title | address | note`, `Title - address`, an address followed by a title, or a bare address. `(optional)` marks a link as optional and `~12 min` sets its reading time.
- Take links out as a backup of everything (JSON), as a bookmarks file a browser can import, or as a Markdown list.
- Search from a field in the bar, by title, site, author, note and tags, and by words in a saved text. `/` moves to the field.
- Sort a shelf from its menu: shelf order, newest first, oldest first, title, source, unread first, shortest first. Sorting never changes the stored order.
- Share one shelf as a file (`<name>.shelf.json`) or as a link that carries the whole shelf in the fragment of its address. The dialog shows the length of the link and whether it fits a chat message, and the texts can be left out. Whoever receives a shelf sees a preview (the sender as written and marked as not verified, the counts, the first titles, the sites the links go to) and decides whether to add it. It arrives as a new shelf, and reading positions, read marks and private notes never travel with it.
- A shelf can carry a description, the name of whoever put it together, a language and a due date.
- "Mark as read" on a link, and a status line on an open shelf: how many links are read, about how much reading is left, and which link is next.
- A hand-in summary of a shelf: plain text built from what was marked as read, to copy, save or print. A shelf can also be printed as a plain numbered list.
- "Send the current page here": a bookmarklet that opens the add dialog filled in with a page's address, title and selected text. The same works through `app.html#add=<address>&title=<title>&text=<text>`. Nothing is saved until the person presses Save.
- `app.html#link=<id>` opens one of your own links.
- In the reader: two buttons that step the text size through 17, 19, 21, 24 and 28 px, a closing block with "Mark as read" and the next unread link of the open shelf, private notes of up to 2,000 characters, and the real site printed after each link in the text, with a note when a link's label looks like an address that leads elsewhere. When a shelf has a language, its texts are hyphenated and dated in that language. The browser's Back closes the reader.
- A phone layout: search folds into an icon, View and "Add a link" move to a dock at the bottom, and the reader shows a small cover beside the title.
- A View menu (shelf or list, and the four looks, each with a one-line summary), a Library menu, and a Shelf menu on an open shelf.
- A new example library: a homework shelf, a reading list and a reference shelf, fifteen links, four of them with a text written for this app. Examples are named as such and can be removed in one step, with Undo.
- An address that is already saved is pointed out while you type it, with a button that shows the saved link.
- A web app manifest with icons, and a Content-Security-Policy on the app page.

On the shelf:

- Every volume has a front board, a back board and a contact shadow on the floor, and each look lights all faces from one direction. Night Study is lit by a lamp over the middle of the row.
- A volume is as thick as the text saved with it and stands at one of three heights, chosen by the site the link comes from.
- Spine titles are fitted to their spine, spines are dressed in one of three ways by site, and reading progress shows as a slip of card standing in the pages.
- Covers sit on a fixed grid in four layouts chosen by site, so links from one site read as a series. The site's name is printed at the foot as an imprint. Plates are printed in two inks, and a link with saved text gets the shape of that text as its plate. A link marked as read carries a tick.
- A row too short to fill the scene stands still in the middle between two bookends.
- When the order or the open shelf changes, the volumes that stay travel to their new places. With reduced motion they are there at once.

For people who reuse a module:

- Shelf: `ShelfItem.thickness`, `stature`, `outline`, `lang`, `note` and `done`; `ShelfOptions.onLoopChange`; `ShelfHandle.fixed`, `pitchAt()` and `coverPlacement()`; a second argument to `setItems()` that names the items just added; `Variant.light`; an `aspect` option on `createCover()`; the light and layout functions exported from `src/shelf/index.ts`.
- Motion: `state.openTime` (linear time of an open or close) and `state.overscroll`; `attach` options `extent` and `track`, which lets a host keep the grabbed volume under the pointer.
- Store: `readOnly`, `usage()`, `lastError()`, `findByUrl()`, `removeBookmarks()` and `restoreBookmarks()`, `updateShelf()` and `restoreShelf()`, `isDone()` and `setDone()`, `note()` and `setNote()`, `exportShelf()` and `importShelf()`, `importFolders()` and `importLinks()`. Pure functions for search, sorting, shelf statistics, reading time, the hand-in summary, the bookmarks format, pasted lists, shelf files, shelf links and add requests are exported from `src/store/index.ts`.
- Reader: options for the private note, the read mark, the next link, the text size and the example notice; `ReaderDoc.lang`; handle members `flightTarget()`, `handleKey()`, `setMyNote()`, `setDone()` and `setNext()`.
- The skill has a plugin manifest in `.claude-plugin/`, and it can find the modules next to itself, at a path the person gives, or in a shallow clone it makes after asking.

### Changed

- Opening and closing are one continuous move. A single copy of the cover travels between the shelf and the page (720 ms out, 520 ms back), the page fades in under it, and Escape reverses the move from its first frame.
- Arrow buttons, arrow keys and a picked spine now move the row on the same spring as a released drag, in every look. Paper Row no longer steps at its slower eased pace. A second press keeps the row's speed, and a held key stays within two volumes of what is visible.
- A released drag is carried forward before it snaps, so a gentle push no longer slides back. A flick moves at least one volume and at most six.
- A row loops only when its volumes fill at least four fifths of the scene, in every look. Oak Library no longer always has two ends.
- The presented volume stops a little short of square to the viewer, so its spine still shows, and a leaning volume pivots on the corner that stays on the floor.
- The library format is version 2. It adds read marks and private notes, kept apart from the links so that sharing a shelf cannot take them along. A version 1 library is upgraded when it is opened.
- An import never changes a link that is already saved. It is counted as unchanged and left exactly as it was.
- A change that the browser's storage refuses is undone and reported. In 0.1.0 it stayed in memory until the page was closed.
- Addresses are checked more strictly: a bare word is no longer turned into an address, addresses with credentials are refused, and known tracking parameters are removed on save. Titles, notes and texts lose invisible and direction-override characters.
- The app's words: a saved item is a link, the text saved with it is its text, and the bundled content is examples. Controls are set in the serif face, and the working view fits one screen.
- Export, import, sharing and the storage notice moved from the footer into the Library menu. The look select became the View menu.
- The skill is named `bookshelf` and lives in `.agents/skills/bookshelf/`.
- Only the homepage is offered to search engines. The app page and the examples are marked `noindex`.

Breaking changes for people who reuse a module:

- Shelf: while `pose.open` is above 0 the shelf no longer flies the centred volume. It hides that volume and parts its neighbours, and the host carries a copy of the cover (see `src/app/flight.ts`). `ShelfOptions.loop` is now a wish: the shelf decides whether the row loops and reports changes through `onLoopChange`.
- Looks: every look carries the same motion (`travel: null`, 720 ms open, 520 ms close, no hold). `VariantMotion.swap` is optional and ignored. `focusAngle` is 84 degrees (86 in Night Study), and every look has `loop: true`.
- Motion: `DEFAULT_TIMING` is 700 ms open and 520 ms close (it was 900 and 640), and `openHold` is accepted and ignored. The settle spring has stiffness 200 (it was 150). `DragHandlers` changed: `onStart(event, origin)`, `onMove(dx, event, x)` and `onEnd(velocityX, cancelled, time)`.
- Store: `snapshot()` returns a version 2 library, and a build of 0.1.0 answers `unsupported-version` to a version 2 file. `ImportSummary` is now `{ added, unchanged, shelvesAdded, skipped, updated }`, where `skipped` lists each entry with its reason and `updated` is always 0. `importLibrary(input, 'merge')` ignores the incoming reading positions, read marks, notes and session. `removeBookmark()` also returns the read mark and the note, and `removeShelf()` returns what `restoreShelf()` takes. A reading text over the limit is an error on the field `readingText`. A library written by a newer version opens read-only: every change answers `read-only`. The session is stored under its own key, `<key>:session`.
- Reader: `setReveal(progress)` takes linear time from 0 to 1. The sheet covers the viewport and fades in, and the `from` box is ignored. The reader focuses its close button when it mounts. Default labels changed ("Back to shelf", "Edit text", "Save text"), and `ReaderLabels` has new keys.
- Composition: `src/app/bookshelf.ts` now needs `src/app/flight.ts` beside it, as well as `bookshelf.css`.

### Fixed

- The centred volume stays in view while it opens, and a cover keeps its proportions when it lands beside the page.
- An opening or closing starts on its first frame instead of jumping ahead by the time since the click.
- Night Study has a dark reading page whose text can be read.
- A reading text that is too long is refused with a message instead of being dropped.
- A change made in a second tab no longer discards text being typed in the first.
- An import no longer throws on damaged input, and an id such as `constructor` in a file is no longer mistaken for a built-in property.
- The focus ring around the centred volume is drawn whole, and every look has a ring that cannot be mistaken for an error.

### Removed

- `ShelfHandle.setStage()` and the flying transform inside the shelf.
- The pause before an opening and the moment in which Paper Row's volume gave way to the page.
- The "Open" sticker on the centred cover. The volume lifts toward the pointer instead.
- The catalogue number at the head of the spine, except in Pocket Paperbacks.
- The footer of the app.
- The invented reading history of the examples. They start unread.

### Known limits

- The reader never fetches pages. It shows text the person saved.
- No sync between devices. A backup, a shelf file or a shelf link moves links between browsers.
- Firefox is not covered by the browser tests, and Safari only by a WebKit smoke run.
- The skill trials were run against 0.1.0 and have not been repeated.

## 0.1.0 (2026-11-11)

The first tagged version. It was not published: 0.2.0 is the first public release.

### Added

- The shelf is a row of book volumes in CSS 3D. The centred volume turns to show its cover, and opening it flies the cover aside while a page grows from its place. Rendering is windowed, and the row can be endless or have two ends.
- There are four looks. Paper Row is the default, and the others are Oak Library, Night Study and Pocket Paperbacks.
- The motion module has a spring engine, drag, flick and snap on Pointer Events, and horizontal wheel support. Timing is set per look, with eased travel and a staged open for Paper Row and a quick spring for the others. With reduced motion, moves are instant and opening is a 150 ms fade.
- The store keeps a versioned library in local storage, with URL validation, migration from a plain list, import, export, undo for removal, and sync between tabs.
- The reader renders a markdown subset as text nodes only. It saves the reading position by block and restores it after a reload, offers a paste panel for links saved without text, and keeps a plain link to the original.
- In the app you can add, edit and remove links, rename and remove shelves, reorder volumes, switch to a list view, and resume the open volume after a reload.
- The homepage has a live sample shelf on an in-memory store.
- Three examples run parts on their own. They cover the shelf with motion, the reader, and the store.
- A skill for coding agents is in `.agents/skills/bookmark-bookshelf/`, with contracts, wiring recipes and checks.
- The release has 420 unit tests and 81 browser tests. The browser tests run on desktop Chromium, phone-sized Chromium with real touch input, and a WebKit smoke run.

### Known limits

- The reader never fetches pages. It shows text the person saved.
- Firefox is untested.
- No sync between devices beyond export and import.

### Thanks

- The Fontsource project, The Newsreader Project Authors and IBM for typefaces under the SIL Open Font License.
- The authors of Reanimate and REA-Video, whose open tools were used to measure motion during the design study.
- The Hallmark and taste-skill repositories, whose READMEs informed how this one presents proof and installation.

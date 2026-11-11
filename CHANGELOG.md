# Changelog

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

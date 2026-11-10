# Changelog

## 0.1.0-rc.1 (release candidate, not published)

First candidate. Everything is new.

### Added

- Shelf: a row of book volumes in CSS 3D. The centred volume turns to show its cover; opening it flies the cover aside while a page grows from its place. Windowed rendering, an endless row or a row with two ends.
- Four looks: Paper Row (default), Oak Library, Night Study, Pocket Paperbacks.
- Motion: spring engine, drag, flick and snap on Pointer Events, horizontal wheel, per-look timing (eased travel and a staged open for Paper Row, a quick spring for the others), a reduced-motion path with instant moves and a 150 ms fade.
- Store: versioned library in local storage with URL validation, migration from a plain list, import, export, undo for removal, and sync between tabs.
- Reader: a markdown subset rendered as text nodes only, reading position saved by block and restored after a reload, a paste panel for links saved without text, and a plain link to the original.
- App: add, edit and remove links, shelves with rename and removal, reordering, a list view, and resume of the open volume after a reload.
- Homepage with a live sample shelf on an in-memory store.
- Examples that run parts on their own: shelf with motion, reader, store.
- A skill for coding agents in `.agents/skills/bookmark-bookshelf/`, with contracts, wiring recipes and checks.
- 420 unit tests and 81 browser tests (desktop Chromium, phone-sized Chromium with real touch input, WebKit smoke).

### Known limits

- The reader never fetches pages. It shows text the person saved.
- Firefox is untested.
- No sync between devices beyond export and import.

### Thanks

- The Fontsource project, The Newsreader Project Authors and IBM for typefaces under the SIL Open Font License.
- The authors of Reanimate and REA-Video, whose open tools were used to measure motion during the design study.
- The Hallmark and taste-skill repositories, whose READMEs informed how this one presents proof and installation.

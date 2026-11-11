# Changelog

## 0.1.0 (2026-11-11)

This is the first public release, so everything is new.

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

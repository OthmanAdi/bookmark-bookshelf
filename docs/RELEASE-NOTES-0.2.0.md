# Bookmark Bookshelf 0.2.0

This is the first public release.

Bookmark Bookshelf is an open-source 3D bookmark manager. Saved links stand as volumes on a shelf in your browser. You open one, read the text you saved with it, and come back later to the same paragraph. Your library is kept in that browser and nowhere else.

The demo is at https://othmanadi.github.io/bookmark-bookshelf/ and the source at https://github.com/OthmanAdi/bookmark-bookshelf.

## What you get

You can bring many links in at once. Export your bookmarks from a browser as an HTML file and choose that file: each folder becomes a shelf. Or paste a list with one link on each line. Both show what will be added and what will be skipped before anything is saved, and a link you already have is left as it was.

A search field in the bar finds a link by its title, site, author, note or tags. A shelf can be sorted in seven ways.

A volume opens into a page of the text you pasted for that link. The reader remembers where you stopped, steps the text size, keeps private notes beside the text, and ends with "Mark as read" and the next unread link. An open shelf says how many of its links are read and about how much reading is left.

One shelf can be handed to someone as a file, or as a link that carries the whole shelf in its address, so no server is involved. The receiver sees a preview and decides whether to add it. It arrives as a new shelf and changes nothing they already have, and your reading positions, read marks and notes are never included. A shelf can have a description, an author, a language and a due date. Its menu writes a plain-text hand-in summary of what you marked as read, which is self-reported and never sent anywhere.

The volumes were rebuilt. Each has boards, cloth and a shadow under one light per look, and is as thick as the text saved with it. Links from one site stand at one height and share a cover layout. Opening a volume carries one copy of its cover from the shelf to the page and back. The four looks are Paper Row, Oak Library, Night Study and Pocket Paperbacks.

On a phone the main controls sit in a dock at the bottom. Links leave the app as a backup of everything, as a bookmarks file a browser can import, or as a Markdown list.

## If you reuse a module

Several contracts changed. The full list is in [CHANGELOG.md](../CHANGELOG.md) under 0.2.0.

- Shelf: `ShelfHandle.setStage()` is gone. While `pose.open` is above 0 the shelf hides the centred volume and parts its neighbours, and the host carries a copy of the cover between the shelf and the page. `src/app/flight.ts` does this in the reference composition, with `shelf.coverPlacement()` as the start and `reader.flightTarget()` as the end.
- Shelf: the row decides for itself whether it loops. Pass `onLoopChange` and forward the value to `motion.setLoop()`. A short row stands still (`shelf.fixed`), and a host should not let a drag move it.
- Looks: every look carries the same motion, with `travel: null`, 720 ms to open and 520 ms to close. `VariantMotion.swap` is optional and ignored, and Paper Row's slow eased steps are gone.
- Motion: `DEFAULT_TIMING` is 700 ms and 520 ms, `openHold` is ignored, and the settle spring is stiffer. `state.openTime` gives linear time for hosts that ease each property themselves. `DragHandlers` take more arguments.
- Store: the library is version 2, with `done` and `notes` maps next to `progress`. A version 1 library is upgraded when it is opened, and a 0.1.0 build refuses a version 2 file with `unsupported-version`. `ImportSummary` is `{ added, unchanged, shelvesAdded, skipped, updated }`: `skipped` is a list with reasons and `updated` is always 0, because an import never changes a saved link. A write that storage refuses is undone and returned as an error.
- Reader: `setReveal(progress)` takes linear time and fades the sheet. The `from` box is ignored. Default labels changed and `ReaderLabels` has new keys.
- Composition: `src/app/bookshelf.ts` needs `src/app/flight.ts` and `src/app/bookshelf.css` beside it.
- Skill: it is named `bookshelf` and lives in `.agents/skills/bookshelf/`.

## Known limits

- The reader never fetches a page. It shows the text you pasted, and a link saved without text offers a field for it and a link to the original.
- There is no sync between devices. A backup, a shelf file or a shelf link moves links from one browser to another.
- The browser tests run in Chromium, on a desktop and on a phone-sized screen with touch, and as a smoke run in WebKit. Firefox is not covered by them.
- Search does not look inside saved texts.
- A shelf link longer than 8,000 characters is not offered. The app asks you to send the file instead, or to leave out the texts.
- Clearing site data in the browser removes the library. Save a backup first.
- The install commands for the skill follow each tool's documentation and could not be run against this repository before it was public. The skill trials in [SKILL-TRIALS.md](SKILL-TRIALS.md) were run against 0.1.0 and have not been repeated.

## How it was checked

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 1989 unit tests pass in 89 files |
| `npx vite build` | static build. The app page loads about 220 kB of JavaScript before compression (about 80 kB gzipped), with the example library and its texts included |

## Licence

The project is licensed under Apache-2.0. The bundled typefaces are under the SIL Open Font License 1.1, and the built JavaScript includes a small module-preload helper from Vite under the MIT License. The licence texts are in `public/licenses/`. See `NOTICE`, `THIRD_PARTY_NOTICES.md` and `PROVENANCE.md`.

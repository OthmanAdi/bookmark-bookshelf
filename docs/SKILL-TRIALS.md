# Skill trials

Two trials of `.agents/skills/bookmark-bookshelf/` were run on 2026-11-10 for release candidate 0.1.0-rc.1. In each, a separate coding agent (Claude Sonnet) received only a user-style request, the path of the skill and read access to this repository. It worked in an empty folder, could not edit this repository, and kept notes on every place the skill was unclear.

## Trial 1: part of the product (shelf and motion)

Request: set up a small Vite and TypeScript project and add a draggable 3D shelf for eight essay titles, with no storage and no reader.

| Check | Result |
|---|---|
| Folders taken | `src/shelf`, `src/motion`, `src/styles/tokens.css`. No store, reader or app code |
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 9 files, 184 tests pass (the copied module tests) |
| `npx vite build` | succeeds |
| Browser checks (Playwright, Chromium) | 5 of 5 pass: eight controls, one per essay; arrow and Home keys move the focus; clicking the centred cover writes its title to the status line; a real mouse drag changes the focused volume and fires no click; a horizontal touch drag moves the row and a vertical one scrolls the page |
| Not run by the agent | reduced motion, the narrow-width overflow check |

## Trial 2: the whole product

Request: build shelf, drag, local storage and the reader with resume into an empty project, seeded with three links supplied by the requester, one of them without reading text.

| Check | Result |
|---|---|
| Folders and files taken | the four module folders, `src/app/bookshelf.ts`, `src/styles/*`, `public/licenses/*`. No copied file was edited |
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 22 files, 396 tests pass (the copied module tests) |
| `npx vite build` | succeeds |
| Browser checks (Playwright, Chromium desktop and Pixel 7 emulation) | 7 of 7 pass: three volumes render with keyboard movement; a mouse drag changes the focus and opens nothing; open, scroll to 700 px, reload: same volume open at 700 px, and Escape returns focus to it; the link without text shows "Open original" and a paste field, and saved text survives a reload; pasted `<img onerror>` and `<script>` show as text; reduced motion settles a step within 100 ms and opens in about 270 ms; touch drag and touch scroll behave; no page errors and no horizontal overflow at 320, 375 and 414 px |
| Covered only by copied unit tests | rejecting a `javascript:` link, export and import round trip, a second store on the same storage |

## What the trials changed

Both agents reported gaps in the skill text, and each list was fixed before this candidate was cut.

From trial 1: the keyboard control is invisible and must not be clicked in tests; the short wiring example did not set the `data-settled` hook; the vertical touch check needs a page taller than the screen; a list of development dependencies and minimal test configuration was missing; `tokens.css` alone leaves a page unstyled; a short list on a looping row shows every title more than once.

From trial 2: seeding a store from a plain list of links was not explained, and the legacy import shape drops reading text; the drag snippets misbehave on a three-item looping row; the page CSS and host elements the full composition needs were not listed; the "Add reading text" action and `open(id, { editCopy: true })` were not described; bundled fonts need two packages; the touch snippet did not type-check under `strict`; there was no advice to record the commit copied from.

## Limits of this evidence

- One run per scenario, one model, no baseline run without the skill. The trials show that the skill is sufficient for these two requests, not how much it helps.
- The fixes made after the trials were not re-trialled.
- A third scenario in `evals/evals.json` (the reader alone on a page without a bundler) has not been run.

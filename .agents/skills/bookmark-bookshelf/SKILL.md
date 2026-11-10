---
name: bookmark-bookshelf
description: Build or integrate the Bookmark Bookshelf modules, an interactive 3D shelf of book spines (CSS 3D and DOM, no WebGL), a spring and drag motion engine, a versioned local bookmark store, and a safe text reader that remembers the reading position. Use whenever someone asks for a bookshelf or book-spine interface, a draggable 3D row or carousel of volumes, saved links or a read-later list shown as books, a cover that flies open into a reading page, or a reading view with resume, and also when they want only one of the four parts (shelf, motion, store, reader) added to an existing web project, even if they never name this repository.
---

# Bookmark Bookshelf

Four small TypeScript modules with no runtime dependencies. Each one works alone. Together they make a shelf of saved links that you drag, open and read.

| Module | Folder | Does | Knows nothing about |
|---|---|---|---|
| shelf | `src/shelf` | Draws volumes for a pose, reports intents (focus, open, step, jump) | time, gestures, storage |
| motion | `src/motion` | Springs, drag, flick, snap, open and close progress | books, DOM structure |
| store | `src/store` | Versioned library in local storage: validation, migration, import, export | DOM, rendering |
| reader | `src/reader` | Shows a saved reading copy as text nodes, tracks and restores position | shelves, storage |

The source of truth is this repository. Copy module folders out of it; do not retype them.

## 1. Decide the scope first

Ask what the person needs, then take only that.

| They want | Take | Also take |
|---|---|---|
| A 3D row of spines they can drag | `shelf`, `motion` | `src/styles/tokens.css` |
| A shelf with their own click handling, no drag | `shelf` | `tokens.css` |
| A reading view with resume | `reader` | `tokens.css`, the `.bb-button`, `.bb-label` and `.bb-visually-hidden` rules from `src/styles/base.css` |
| A bookmark library without UI | `store` | nothing |
| Drag, flick and snap for some other row | `motion` | nothing |
| The whole product | all four, `src/app/bookshelf.ts` | `src/styles/*`, `src/data/sample-library.ts` if samples are wanted |

Modules never import each other. If an import between two module folders appears, the integration is wrong: the meeting point belongs in the host's own composition file (see `src/app/bookshelf.ts`).

## 2. Bring the files in

1. Copy each chosen folder from `src/` unchanged, tests included (`*.test.ts`), into the host's source tree.
2. Copy `src/styles/tokens.css` and load it once. The modules read `--bb-*` custom properties and hard-code no colour, font or spacing. To restyle, override tokens; do not edit module CSS.
3. Fonts are optional. `src/styles/fonts.css` bundles Newsreader and IBM Plex Mono (SIL OFL 1.1). If you ship them, ship the licence texts in `public/licenses/` too. Without them the token stacks fall back to system fonts.
4. `shelf.ts` and `reader.ts` import their CSS (`import './shelf.css'`). That needs a bundler that handles CSS imports (Vite, webpack, Parcel, esbuild with a CSS loader). Without one, delete those import lines and link the CSS files from the page.
5. TypeScript: the code is written for `strict`, `noUncheckedIndexedAccess` and `verbatimModuleSyntax`, with `moduleResolution: "bundler"`. It compiles under looser settings as well.

Framework hosts (React, Vue, Svelte): every module is `mount(element, options)` returning a handle with `destroy()`. Mount in the framework's "after first render" hook and destroy in its cleanup. Adapters are in `references/composition.md`.

## 3. Wire it

Read `references/modules.md` for the contracts (inputs, outputs, events) and `references/composition.md` for copy-ready wiring of each combination. The shortest useful one, shelf plus motion:

```ts
import { createShelfMotion, prefersReducedMotion } from './motion';
import { mountShelf } from './shelf';

const shelf = mountShelf(host, { items, label: 'My shelf' });
const motion = createShelfMotion({ count: items.length, loop: shelf.loop, reducedMotion: prefersReducedMotion });

motion.subscribe((state) => shelf.setPose({ position: state.position, open: 0 }));
motion.attach(shelf.surface, { pxPerItem: () => shelf.pitch() });

shelf.on((intent) => {
  if (intent.type === 'focus') motion.goTo(intent.slot);
  else if (intent.type === 'step') motion.step(intent.direction);
  else if (intent.type === 'jump') motion.goTo(intent.to === 'first' ? 0 : items.length - 1);
  else openSomething(intent.id);
});
```

`items` is an array of `{ id, title, source?, cloth?, pattern?, seed?, progress? }`. Runnable versions of every combination are in `examples/`.

## 4. Rules that keep it working

These are the things that break when changed. Each has a reason.

- **Nothing between `.bb-shelf__row` and a book face may set `overflow`, `filter` or `opacity` below 1.** Any of them flattens the 3D context and the books collapse into a plane. Fade the scene (the perspective element) instead, which is what reduced motion does.
- **The shelf draws poses; it never animates itself.** All movement comes from `setPose` on a frame loop owned by the motion module. Adding CSS transitions to `.bb-book` fights that loop. Hover effects go on `.bb-book__body`.
- **One native button per item, not per rendered book.** A looping row renders copies. Only the real copy carries `button.bb-book__control`; copies are `aria-hidden`. Do not make faces focusable and do not put the 3D faces inside a `<button>`: Firefox flattens `preserve-3d` through a button's inner box.
- **Keep `touch-action: pan-y` on the drag surface.** With `none`, a finger that lands on the shelf can no longer scroll the page.
- **During a touch drag, ignore `lostpointercapture` from descendants.** The element under the finger captures the pointer implicitly; when the surface takes capture, that descendant's loss event bubbles up. `gesture.ts` checks `event.target === element`. Keep the check.
- **The reader builds DOM with `createElement` and `textContent` only.** No `innerHTML` anywhere in `src/reader`; a source-level test enforces it. Links are kept only for `http:` and `https:`.
- **The store accepts only `http:` and `https:` URLs and never fetches one.** The app shows a link and whatever text the person pasted. Do not add remote fetching to make the reader "smarter": browsers block it for most sites and a proxy changes the security model.
- **Reduced motion is a real path, not a slower one.** `reducedMotion` on the motion module makes moves instant and turns open and close into a 150 ms fade. Pass the live preference (`prefersReducedMotion`), not a value read once.
- **Always state the reader boundary where people can see it.** A link without a reading copy must show "Open original" and a one-step way to add text.

## 5. Check the result

Run what applies; `references/checks.md` has the commands, the DOM hooks to assert on and Playwright snippets for real mouse and touch drags.

| Took | Minimum proof |
|---|---|
| any module | `npx tsc --noEmit` clean, the module's own `*.test.ts` pass under Vitest with `happy-dom` |
| shelf | books render; `data-focus` changes on `setPose`; exactly one `.bb-book__control` per item; arrow keys emit `step` |
| shelf + motion | a real mouse drag changes `data-focus-id` and ends with `data-settled="1"`; a vertical touch drag scrolls the page |
| reader | Escape calls `onClose`; reload restores `scrollTop`; a `<script>` in the text shows as text |
| store | `javascript:` URL is rejected; export then import round-trips; a second `createStore` on the same storage sees the data |
| all four | open a volume, scroll, reload: the same volume is open at the same place; close: focus is back on that volume |

Report what you ran and what you did not. A build that passes type checking has not been shown to drag.

## Variants

`paper` (default), `oak`, `night`, `pocket`. A variant is geometry in `src/shelf/variants.ts` plus a CSS block scoped by `data-variant` in `src/shelf/variants.css`. To add one: one entry, one CSS block. Set `data-variant` on `<html>` as well when the page colours should follow.

## What this skill does not cover

Server-side article extraction, accounts or sync, browser-extension capture, WebGL rendering. If one of those is asked for, say it is outside these modules before building anything.

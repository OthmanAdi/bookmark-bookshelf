---
name: bookshelf
description: Add a 3D bookshelf to a web project, a draggable row of book spines for a bookmark manager, a read-later list or a reading list, where saved links are books that open into a reading page. Provides four TypeScript modules with no runtime dependencies, namely a CSS 3D shelf (DOM, no WebGL), a spring and drag motion engine, a versioned local bookmark store with import and export, and a safe text reader that remembers the reading position. Use when someone asks for a 3D bookshelf, a draggable row or carousel of book spines, a bookmark manager or read-later list shown as books, a cover that flies open into a reading view with resume, or only one of the four parts (shelf, motion, store, reader) added to an existing project, even if they never name this repository.
---

# Bookmark Bookshelf

Four small TypeScript modules with no runtime dependencies. Each one works alone. Together they make a shelf of saved links that you drag, open and read. This skill describes version 0.2.0.

| Module | Folder | Does | Knows nothing about |
|---|---|---|---|
| shelf | `src/shelf` | Draws volumes for a pose, reports intents (focus, open, step, jump) | time, gestures, storage |
| motion | `src/motion` | Springs, drag, flick, snap, open and close progress | books, DOM structure |
| store | `src/store` | Versioned library in local storage: validation, migration, import and export, search, sorting, one shelf as a file or a link | DOM, rendering |
| reader | `src/reader` | Shows saved text as text nodes, tracks and restores the position, text size, private notes, "Mark as read" | shelves, storage |

The modules are not inside this skill folder. They live in a checkout of the Bookmark Bookshelf repository, and the first job is to find it. Copy module folders out of it and do not retype them.

## 0. Find the source root

Try the routes in this order and stop at the first that works.

1. Next to the skill. If this file is at `<root>/.agents/skills/bookshelf/SKILL.md` and `<root>/src/shelf/index.ts` exists, `<root>` is the source root. This is the case when the skill is used in place, and when it was installed as a plugin that keeps the whole repository.
2. A path the person gives. If the skill was copied somewhere else (the skills folder of an agent), the person may already have a checkout. If the request contains a path, use it as the source root. If it does not, ask for one, and offer route 3 in the same question.
3. A shallow clone, only after the person agrees. Ask first, and say plainly what will happen: the public repository `https://github.com/OthmanAdi/bookmark-bookshelf` is cloned at release tag `v0.2.0` into a new temporary folder, and nothing else is downloaded. Do not fetch anything before the person says yes. After a yes, run:

   ```bash
   git clone --depth 1 --branch v0.2.0 https://github.com/OthmanAdi/bookmark-bookshelf <temporary folder>
   ```

   The temporary folder is a new, empty directory outside the project (the system temporary directory is fine). Tell the person where it is. It is the source root. Copy from it, never edit inside it, and say at the end that it can be deleted. If the clone fails (no network, no git, tag missing), say so and go back to route 2.
4. Verify before copying. In the source root:
   - `package.json` has `"name": "bookmark-bookshelf"`. Note its `version`.
   - These markers exist: `src/shelf/index.ts`, `src/motion/index.ts`, `src/store/index.ts`, `src/reader/index.ts`, `src/app/bookshelf.ts`, `src/app/bookshelf.css`, `src/app/flight.ts`, `src/styles/tokens.css`.
   - If it is a git checkout, note `git -C <root> rev-parse --short HEAD`.

   If a marker is missing, stop and say which one. This skill describes version `0.2.x`. For another version, read the `types.ts` of each module before trusting the reference files here: 0.1.0 has no `flight.ts`, and its shelf, store and reader contracts differ (see the end of `references/modules.md`).
5. Report the source path, version and commit you copied from, and whether it was a clone you made, so a later update can be compared.

Every path below that starts with `src/`, `examples/` or `public/` is relative to that source root.

## 1. Decide the scope first

Ask what the person needs, then take only that.

| They want | Take | Also take |
|---|---|---|
| A 3D row of spines they can drag | `shelf`, `motion` | `src/styles/tokens.css` |
| A shelf with their own click handling, no drag | `shelf` | `tokens.css` |
| A reading view with resume | `reader` | `tokens.css`, the `.bb-button`, `.bb-label` and `.bb-visually-hidden` rules from `src/styles/base.css` |
| A bookmark library without UI: import, export, search, sharing a shelf | `store` | nothing |
| Drag, flick and snap for some other row | `motion` | nothing |
| A shelf that opens into a reader, with their own data | `shelf`, `motion`, `reader` | `tokens.css`, the same three rules from `base.css` |
| The whole composition | all four, `src/app/bookshelf.ts`, `src/app/bookshelf.css`, `src/app/flight.ts` | `src/styles/*`, `src/data/*` if the example links are wanted |

Modules never import each other. If an import between two module folders appears, the integration is wrong: the meeting point belongs in the host's own composition file (see `src/app/bookshelf.ts`).

The whole composition is seven things, and the list is easy to get one short: the four module folders, `src/app/bookshelf.ts`, its stylesheet `src/app/bookshelf.css`, and `src/app/flight.ts`, which carries the cover between the shelf and the page. The script imports the other two, so a build without them fails with a missing-file error. Copy the three files together, into a folder that sits next to the module folders.

The app around the composition (the bar and its menus, the dialogs for adding links, bringing many in and sharing a shelf, the list view) is the rest of `src/app/` together with `app.html`. Those files depend on each other and on element ids in `app.html`. Take them as a whole and adapt, or build your own interface on the store's functions, which `references/composition.md` shows.

## 2. Bring the files in

1. Copy each chosen folder from `src/` unchanged, tests included (`*.test.ts`), into the host's source tree.
2. Copy `src/styles/tokens.css` and load it once. The modules read `--bb-*` custom properties for colour, type, spacing and timing. To restyle, override tokens and do not edit module CSS. Tokens only define values: the page ground, body font and resets live in `src/styles/base.css`. In an empty project copy that file too (it imports `tokens.css` and `fonts.css`, so drop the fonts import if you skip step 3), or set `background: var(--bb-paper); color: var(--bb-ink); font-family: var(--bb-font-serif)` on `body` yourself.
3. Fonts are optional. `src/styles/fonts.css` bundles Newsreader and IBM Plex Mono (SIL OFL 1.1) and needs two dev dependencies: `@fontsource-variable/newsreader` and `@fontsource/ibm-plex-mono`. If you ship them, ship the licence texts in `public/licenses/` too. Without them, remove the `@import './fonts.css'` line from `base.css` and the token stacks fall back to system fonts.
4. `shelf.ts` and `reader.ts` import their CSS (`import './shelf.css'`). That needs a bundler that handles CSS imports (Vite, webpack, Parcel, esbuild with a CSS loader). Without one, delete those import lines and link the CSS files from the page: `shelf.css`, `cover.css` and `variants.css` for the shelf, `reader.css` and `reader-text.css` for the reader.
5. TypeScript: the code is written for `strict`, `noUncheckedIndexedAccess` and `verbatimModuleSyntax`, with `moduleResolution: "bundler"`. It compiles under looser settings as well.
6. Tooling for an empty project: `npm i -D vite typescript vitest happy-dom @playwright/test`, Node `^22.12.0 || ^24.0.0 || >=26.0.0`. `references/checks.md` has the minimal Vitest and Playwright configuration.

Framework hosts (React, Vue, Svelte): every module is `mount(element, options)` returning a handle with `destroy()`. Mount in the framework's "after first render" hook and destroy in its cleanup. `references/composition.md` has a plain function to wrap.

## 3. Wire it

Read `references/modules.md` for the contracts (inputs, outputs, events) and `references/composition.md` for copy-ready wiring of each combination. The shortest useful one, shelf plus motion:

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

`items` is an array of `{ id, title, source?, author?, cloth?, pattern?, seed?, progress?, thickness?, stature?, outline?, note?, done? }`. Runnable versions of the combinations are in `examples/`.

Looping: the shelf decides, not the host. A row loops only when its volumes fill at least four fifths of the scene. A shorter row stands still in the middle between two bookends (`shelf.fixed`): the arrows, the arrow keys and a click on a spine choose the presented volume, and a drag does nothing. Tell the person which of the two they will see with their number of items, because eight titles on a desktop screen stand still.

## 4. Rules that keep it working

These are the things that break when changed. Each has a reason.

- Nothing between `.bb-shelf__row` and a book face may set `overflow`, `filter`, `clip-path`, `mask`, `contain: paint` or `opacity` below 1. Any of them flattens the 3D context and the books collapse into a plane. Fade the scene (the perspective element) instead.
- The shelf draws poses and never animates the row itself. All movement comes from `setPose` on a frame loop owned by the motion module. Adding CSS transitions to `.bb-book` fights that loop. Hover effects go on `.bb-book__body`.
- The shelf does not fly the cover. While `pose.open` is above 0 it hides the centred volume and parts its neighbours. A travelling cover is the host's job (`src/app/flight.ts`): one copy on a fixed layer, moved by `transform` only, from `shelf.coverPlacement()` to `reader.flightTarget()`. The shelf's volume, the copy and the reader's own cover are never visible together.
- One native button per item, not per rendered book. A looping row renders copies. Only the real copy carries `button.bb-book__control`, and copies are `aria-hidden`. The faces are plain spans and the button is a separate, invisible element in front of them. Do not make faces focusable and do not wrap the faces in a `<button>`.
- Keep `touch-action: pan-y` on the drag surface. With `none`, a finger that lands on the shelf can no longer scroll the page.
- During a touch drag, ignore `lostpointercapture` from descendants. The element under the finger captures the pointer implicitly, and when the surface takes capture that descendant's loss event bubbles up. `gesture.ts` checks `event.target === element`. Keep the check.
- Touch taps on volumes are recognised from pointer events, not from `click`. After a swipe released at speed, browsers can swallow the click of the next tap. `shelf.ts` therefore activates a volume on `pointerup` when the touch never left a 10 px radius and lasted under 700 ms, and skips the click the browser sends for that same tap (keyboard clicks, which have `detail` 0, always count). `gesture.ts` also consumes `touchmove` once a drag is locked so that no browser fling starts.
- The reader builds DOM with `createElement` and `textContent` only. There is no `innerHTML` anywhere in `src/reader`, and a source-level test enforces it. Links are kept only for `http:` and `https:`.
- The store accepts only `http:` and `https:` addresses and never fetches one. The app shows a link and whatever text the person pasted. Do not add remote fetching to make the reader "smarter": browsers block it for most sites and a proxy changes the security model.
- An import never overwrites, and nothing that arrives from outside is applied without a preview. A shelf file or shelf link comes from a stranger: read it with `readShelfFile` or `decodeShelfLink`, show `summariseShelfFile`, and call `importShelf` only after the person agrees. Reading positions, read marks and private notes never go into a shelf file.
- Reduced motion is its own path, with nothing travelling. `reducedMotion` on the motion module makes moves instant and turns open and close into a 150 ms fade. Pass the live preference (`prefersReducedMotion`), not a value read once.
- Always state the reader boundary where people can see it. A link without text must show "Open original" and a one-step way to add text.

## 5. Check the result

Run what applies. `references/checks.md` has the commands, the DOM hooks to assert on and Playwright snippets for real mouse and touch drags.

| Took | Minimum proof |
|---|---|
| any module | `npx tsc --noEmit` clean, the module's own `*.test.ts` pass under Vitest with `happy-dom` |
| shelf | books render, `data-focus` changes on `setPose`, exactly one `.bb-book__control` per item, arrow keys emit `step` |
| shelf + motion | on a row long enough to loop, a real mouse drag changes `data-focus-id` and ends with `data-settled="1"`. On a standing row the arrow keys change it and a drag does not. A vertical touch drag scrolls the page |
| reader | Escape calls `onClose`, a reload restores `scrollTop`, a `<script>` in the text shows as text |
| store | a `javascript:` address is rejected, export then import round-trips, a second `createStore` on the same storage sees the data, a shelf survives `encodeShelfLink` then `decodeShelfLink` |
| all four | the setup smoke check in `references/checks.md` passes. Open a volume, scroll, reload: the same volume is open at the same place. Close: focus is back on that volume |

Report what you ran and what you did not. A build that passes type checking has not been shown to drag.

## Looks

`paper` (default), `oak`, `night`, `pocket`. A look is geometry, light and motion timing in `src/shelf/variants.ts` plus a CSS block scoped by `data-variant` in `src/shelf/variants.css`. To add one: one entry, one CSS block. Set `data-variant` on `<html>` as well, so the page colours and a cover outside the shelf follow.

The four looks move the same way: steps and released drags settle on one spring, and a volume takes 720 ms to open and 520 ms to close. They differ in proportions, materials and light, and `night` is lit by a lamp over the middle of the row. After `shelf.setVariant(name)` call `motion.setLoop(shelf.loop)` and `motion.setTiming(shelf.variant.motion)`.

## What this skill does not cover

Server-side article extraction, accounts or sync, browser-extension capture, WebGL rendering. If one of those is asked for, say it is outside these modules before building anything.

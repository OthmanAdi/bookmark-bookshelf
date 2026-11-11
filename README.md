# Bookmark Bookshelf

A 3D bookmark manager: your saved links stand as books on a shelf you can drag, open and read.

![A 3D bookshelf in a browser: a row of book spines is swiped, a volume is picked by its spine and opens into a reader](docs/media/shelf-demo.gif)

*Recorded from the app: swipe the row, pick a volume by its spine, open it, read, close.*

[Live demo](https://othmanadi.github.io/bookmark-bookshelf/) | [For coding agents](#for-coding-agents) | [Source layout](#the-four-parts)

## What it is

Bookmark Bookshelf is an open-source 3D bookmark manager and read-later list that runs in a browser. Each saved link is a volume on a shelf: you open one, read the text you saved with it, and find your place again next time. It is local-first, with no account and no tracking. The library lives in your browser's local storage, and apart from loading its own files the app makes no network requests.

## Try it

Open the [live demo](https://othmanadi.github.io/bookmark-bookshelf/). It starts with example links that one button removes.

To run it yourself:

```bash
git clone https://github.com/OthmanAdi/bookmark-bookshelf.git
cd bookmark-bookshelf
npm install
npm run dev
```

Then open the address Vite prints, normally `http://127.0.0.1:5173/`. It needs Node `^22.12.0`, `^24.0.0` or `>=26.0.0`.

## Features

- The shelf is a 3D bookshelf drawn with CSS transforms, without WebGL. A row long enough to fill the window loops, and you drag or flick it with a mouse, a finger or a trackpad. A shorter row stands still between two bookends. The volume you pick turns to show its cover.
- A volume opens into a reader for the text you pasted when you saved the link. It keeps your place across reloads, steps the text size, holds private notes and ends with "Mark as read".
- Import browser bookmarks from the HTML file a browser exports (folders become shelves), or paste a list of many links. A preview shows what will be added and what will be skipped.
- Search finds a link by title, site, author, note or tag, or by a word in its saved text.
- Share a shelf as a reading list, as a file or as a link that carries the whole shelf in its address, so no server holds it. Whoever opens it sees a preview before anything is added ([recording](docs/media/share-demo.gif)).

A shelf shows how many of its links are read and about how long the rest will take, and its menu writes a plain-text hand-in summary. On a phone, View and "Add a link" sit in a dock at the bottom ([recording](docs/media/phone-demo.gif)). The View menu offers a plain list and four looks for the shelf: Paper Row, Oak Library, Night Study and Pocket Paperbacks. The row works from the keyboard (arrow keys, Home, End, Enter, Escape), and with reduced motion nothing travels.

## Use it in your project

The shelf, the motion engine, the store and the reader are four folders of vanilla TypeScript with zero runtime dependencies. They never import each other, so you can take one or all four.

### For coding agents

The repository carries an agent skill named `bookshelf`, invoked as `/bookshelf`. It tells a coding agent which folders to copy, how to wire them and which checks to run.

| Agent | Install | Invoke |
|---|---|---|
| Claude Code, as a plugin | `/plugin marketplace add OthmanAdi/bookmark-bookshelf`, then `/plugin install bookshelf@bookmark-bookshelf` | `/bookshelf` or `/bookshelf:bookshelf` |
| Any agent, through the `skills` CLI | `npx skills add OthmanAdi/bookmark-bookshelf --skill bookshelf` | `/bookshelf` in Claude Code, `$bookshelf` in Codex |
| Any agent, by copying | Copy [`.agents/skills/bookshelf`](.agents/skills/bookshelf) into the agent's skills folder (Claude Code: `~/.claude/skills/bookshelf`) | `/bookshelf` |

The commands follow each tool's documentation. None could be run against this repository before it was public, so treat every row as untested.

The skill holds instructions only. It takes the modules from a checkout next to itself or from a path you give it, or asks before it clones the release tag.

```text
/bookshelf Build the whole shelf into this project: drag, local storage and the reader that resumes, seeded from links.json.
/bookshelf I only want the draggable 3D shelf for the eight titles in essays.json. No storage and no reader.
```

### By hand

Copy the folders you need from `src/`, with `src/styles/tokens.css`. The shelf with motion:

```ts
import { createShelfMotion, prefersReducedMotion } from './motion';
import { mountShelf } from './shelf';

const motion = createShelfMotion({ count: items.length, reducedMotion: prefersReducedMotion });
const shelf = mountShelf(host, { items, onLoopChange: (loop) => motion.setLoop(loop) });
motion.setLoop(shelf.loop);
motion.subscribe((state) => shelf.setPose({ position: state.position, open: 0 }));
motion.attach(shelf.surface, { pxPerItem: () => shelf.pitch(), enabled: () => !shelf.fixed });
shelf.on((intent) => {
  if (intent.type === 'focus') motion.goTo(intent.slot);
  else if (intent.type === 'step') motion.step(intent.direction);
});
```

## The four parts

| Module | Folder | What it does | Runs alone in |
|---|---|---|---|
| Shelf | [`src/shelf`](src/shelf) | Draws volumes in CSS 3D for a given position and reports what was picked. | [`examples/shelf-only.html`](examples/shelf-only.html), with motion |
| Motion | [`src/motion`](src/motion) | Springs, drag, flick and snap on Pointer Events. It knows nothing about books. | the same example |
| Store | [`src/store`](src/store) | A versioned library in local storage, with import, export, search and sharing. | [`examples/store-only.html`](examples/store-only.html) |
| Reader | [`src/reader`](src/reader) | Shows saved text as a page built from text nodes only, and reports the reading position. | [`examples/reader-only.html`](examples/reader-only.html) |

They meet in [`src/app/bookshelf.ts`](src/app/bookshelf.ts). Contracts and wiring recipes are in the skill's [`references/`](.agents/skills/bookshelf/references).

## What it does not do

- It never fetches a page. The reader shows text you pasted, and a link saved without text offers a field for it and "Open original".
- It does not sync between devices. A backup file, a shelf file or a shelf link carries links from one browser to another.
- The browser tests run in Chromium, on a desktop and on a phone-sized screen with touch, with a smoke run in WebKit. Firefox is not covered.
- Clearing site data in the browser removes the library, so save a backup first.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server on `127.0.0.1:5173` |
| `npm run build` | Type check, then a static build in `dist/` |
| `npm test` | Unit tests (Vitest with happy-dom) |
| `npm run test:e2e` | Browser tests (Playwright). Run `npx playwright install chromium webkit` once first |
| `npm run check` | Type check, unit tests and build |

## How it came about and licence

The idea of a row of spines with one volume turned to its cover came from studying a screen recording of a third-party shelf interface. No code, artwork, text or brand element of it, or of any other interface, is used here. [PROVENANCE.md](PROVENANCE.md) has the details.

The licence is Apache-2.0 ([LICENSE](LICENSE), [NOTICE](NOTICE)). The bundled typefaces are under the SIL Open Font License 1.1, and the built JavaScript includes a helper from Vite under the MIT License: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Changes are in [CHANGELOG.md](CHANGELOG.md).

# Bookmark Bookshelf 0.3.0

This release adds a second way to draw the shelf and a third view.

Bookmark Bookshelf is an open-source 3D bookmark manager. Saved links stand as volumes on a shelf in your browser. You open one, read the text you saved with it, and come back later to the same paragraph. Your library is kept in that browser and nowhere else.

The demo is at https://othmanadi.github.io/bookmark-bookshelf/ and the source at https://github.com/OthmanAdi/bookmark-bookshelf.

## What you get

Studio is a second drawing of the shelf, in WebGL. Choose it in the View menu under Drawing, or open `app.html?paint=studio`. It paints the same row behind the shelf you already use, so the buttons, the keyboard, the focus rings, the gestures and what a screen reader hears stay exactly as they were. The CSS drawing is now called Classic. It is still the default, and a visit that stays in Classic never downloads three.js.

In Studio a volume is bound in one of eight materials: book cloth, linen, leather, paper over boards, gloss laminate, velvet, metal foil or holographic foil. Its title is stamped in gold, silver, copper or holographic foil, debossed blind, or printed in ink. Every surface is generated in code. The light follows the pointer, each volume has a shadow where it meets the floor, and the floor is made of the material of the look. A link gets its binding and stamp from its own seed, so it looks the same every time, and a foil that would be hard to read on its cloth gives way to one that reads or to printed ink. You can also choose both yourself in the editor, and the choice travels in backups, shelf files and shelf links.

Volumes in Studio show how they were used. A spine fades a little as the link gets older. Edges rub and foil dulls once you have read the link, marked it as read or written a note on it. A link you have just saved stays crisp.

The pages move. When the pointer rests on the cover in front, the cover opens, further the nearer the pointer is to the fore-edge, and the leaves fan behind it. A volume that arrives at the centre flutters its pages for a moment. Opening a link carries the lit volume to the page with its cover opening on the way. With reduced motion none of this moves.

Showcase is a third view, next to the shelf and the list. It shows one large book at a time beside its title, note, reading state and actions, with a rail of ticks for the whole shelf. You move between books with the wheel, the up and down arrow keys, Page Up and Page Down, Home and End, a swipe, the ticks or two buttons. The book turns toward the pointer and can be spun by dragging. When the drawing is Studio the book is lit.

A short row that stands between its bookends can now be dragged, and a throw carries it on. A spine rises only when the pointer slows down on it, so a sweep along the row no longer raises every spine in turn.

The homepage opens on one large book beside the title. Where the browser can draw Studio and motion is not reduced, the book turns into place.

Two new examples run parts on their own: `examples/studio-shelf.html` is the shelf with motion and Studio, and `examples/materials.html` shows each binding.

## Size

Studio uses three.js, the project's first runtime dependency. It sits in a chunk of its own that the page requests only when someone chooses Studio.

| Loaded | Size | Gzipped |
|---|---|---|
| The app page without Studio, all of its JavaScript | 268 kB | 98 kB |
| Of that, the main app chunk | 103 kB | 35 kB |
| three.js, when Studio is chosen | 541 kB | 132 kB |
| Studio's own code, when Studio is chosen | 81 kB | 32 kB |

The CSS shelf, the motion engine, the store and the reader still depend on nothing.

## If you reuse a module

Nothing was removed and data written by 0.2.0 opens unchanged. The full list is in [CHANGELOG.md](../CHANGELOG.md) under 0.3.0.

- Shelf: `ShelfHandle.onFrame(listener)` reports each drawn frame as a `ShelfFrame`, with every volume as a `FrameVolume`, so a second renderer can paint the same row. `ShelfItem` has four optional fields for such a renderer: `binding`, `stamp`, `handled` and `age`. The CSS shelf ignores them.
- Shelf: on a row that stands still, the function from `trackFrom()` now follows the hand. A host that disables the drag with `enabled: () => !shelf.fixed` keeps a row that a drag does not move.
- Store: `CoverSpec.binding` and `CoverSpec.stamp` are short names the store keeps without checking them against a list. `Session.paint` is `'classic'` or `'studio'`, and `Session.view` has a third value, `'showcase'`.
- Studio: a new folder, `src/studio`, which needs `three`. `mountStudio(shelf, { kit, onFailure })` mounts it over a shelf that exists and throws without WebGL 2. `createKit(renderer)` from `src/studio/kit.ts` makes the materials. It imports from `src/shelf` and `src/app/flight.ts`. The smallest page that uses it is `examples/studio-shelf.ts`.
- Showcase: a new folder, `src/showcase`, with `mountShowcase(host, options)`. It imports from `src/shelf`, and from `src/studio` only when the lit drawing is asked for.
- Composition: `createBookshelf()` returns `paint` and `setPaint()` and takes `onPaintFailure`. `src/app/bookshelf.ts` imports `src/studio` on demand.
- Skill: it describes 0.3.0 and has a section on adding Studio.

## Known limits

- Studio needs WebGL 2. Without it the Studio item in the View menu says so and the shelf stays in Classic.
- The reader never fetches a page, and there is no sync between devices. A backup, a shelf file or a shelf link moves links from one browser to another.
- The browser tests run in Chromium, on a desktop and on a phone-sized screen with touch, and as a smoke run in WebKit that does not reach Studio or Showcase. Firefox is not covered by them.
- The skill trials in [SKILL-TRIALS.md](SKILL-TRIALS.md) were run against 0.1.0 and have not been repeated.

## How it was checked

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 2364 unit tests pass in 115 files |
| `npx playwright test --list` | 303 browser tests in 27 files: desktop Chromium, phone-sized Chromium with touch, and a WebKit smoke run |
| `npm run build` | static build with the sizes in the table above, measured before compression and with `gzip` |

## How it was studied

For the page motion and the lighting, the book pages of press.stripe.com and trevornoah.com/books were measured for how they move and how they are lit. No code, model, shader, texture or image of either is used.

## Licence

The project is licensed under Apache-2.0. The bundled typefaces are under the SIL Open Font License 1.1. The build also contains three.js, which Studio uses, and helper code from Vite, both under the MIT License. The licence texts are in `public/licenses/`. See `NOTICE`, `THIRD_PARTY_NOTICES.md` and `PROVENANCE.md`.

# Provenance

What is in this repository, where it came from, and what it is licensed under. Written for release 0.3.0.

## Original work

Everything under `src/`, `examples/`, `tests/`, `.agents/` and `.claude-plugin/`, the HTML entry pages, the documentation and the GIFs in `docs/media/` was made for this project and is offered under Apache-2.0.

| Kind | Where | Note |
|---|---|---|
| Source code | `src/**`, `examples/**`, `tests/**` | Written for this project. No code was copied from another project. |
| Cover art | `src/shelf/cover-art.ts` | Drawn by code: six patterns from a seed (arcs, bars, dots, rays, tiles, waves), or the outline of a link's saved text. No image files. |
| Example texts | `src/data/sample-texts.ts` | Four texts written for this project. They are not excerpts of the pages the example links point to. One of them quotes a single sentence by Arnold Bennett, from a book that is in the public domain. |
| Example links | `src/data/sample-library.ts` | Fifteen public pages, linked by address under each page's own title. Nothing of those pages' content is reproduced. |
| Icons and marks | `public/favicon.svg`, `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`, the wordmark in CSS | Drawn for this project. |
| Social preview | `public/social-preview.png` | A screenshot of this app. |
| GIFs | `docs/media/*.gif` | Recorded from this app running in a browser, driven by scripted mouse and touch input. A round pointer marker was added for the recording; nothing else on the page was changed. |

## The visual reference

The shelf's interaction model was first studied from a publicly viewable screen recording of a third-party shelf interface. The study measured frames: spine and cover proportions, the turn of the centred volume, and the timing and structure of opening and closing.

- No source code of that interface was available or used.
- None of its artwork, text, names, colours as a set, typefaces or brand elements appear here.
- The recording itself, frames from it and the measurements are kept outside this repository and are not distributed.

What remains of that study in this release is the idea of the interaction and the proportions of a volume: a row of spines with the centred volume turned to its cover. The timing measured from the recording, and the way a page grew out of the opening volume, were replaced in 0.2.0.

What the recording did not show, and is therefore this project's own design: dragging, flicking and snapping, touch behaviour, the keyboard model, focus handling, reduced motion, small-screen layout, the reader and its resume, the store and its data format, the list view, the three additional looks, and everything added in 0.2.0 for bringing links in, finding them and sharing a shelf.

## What was redesigned in 0.2.0

The construction of the volumes (boards, thickness and height, cloth, spine lettering, the reading slip, the covers), their lighting, and the motion between the shelf and the page were redesigned and rewritten in this version.

During that work, other bookshelf and reading interfaces on the public web were looked at for how they achieve depth and continuity. No code, artwork, text or brand element of any of them is used here.

## Bundled third-party material

Four things in a production build come from other parties: two typefaces, the three.js library for the optional Studio drawing, and helper code from the build tool, in two small scripts.

| Material | Source package | Version | Licence | Shipped as |
|---|---|---|---|---|
| Newsreader (variable, roman and italic, Latin and Latin Extended) | `@fontsource-variable/newsreader` | 5.3.0 | SIL OFL 1.1 | four files, `assets/newsreader-*.woff2` |
| IBM Plex Mono (400 and 500, Latin and Latin Extended) | `@fontsource/ibm-plex-mono` | 5.3.0 | SIL OFL 1.1 | four files, `assets/ibm-plex-mono-*.woff2` |
| three.js, loaded only when Studio is chosen | `three` | 0.187.0 | MIT | one lazily loaded chunk in `assets/` |
| Module preload helpers added to the generated JavaScript | `vite` | 8.3.7 | MIT | `assets/base-*.js`, about 0.7 kB, and `assets/preload-helper-*.js`, about 1.6 kB, which loads the chunks imported on demand |

The font licence texts and the three.js licence are copied byte for byte from the packages into `public/licenses/`. The MIT notice for the helpers is the "Vite core license" section of that package's `LICENSE.md`, copied exactly into `public/licenses/Vite-MIT.txt`. All three are served with every build in `licenses/`, and the build also copies `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md` and this file into its root. See `THIRD_PARTY_NOTICES.md`.

## Development tools

Used to build and test, not shipped: Vite 8.3.7 (MIT), TypeScript 7.0.2 (Apache-2.0), Vitest 5.1.0 (MIT), happy-dom 21.0.4 (MIT), Playwright Test 1.65.0 (Apache-2.0). `@types/three` 0.187.0 (MIT) is used for type checking only. `package-lock.json` lists 103 packages for all platforms together: 59 MIT, 27 Apache-2.0, 12 MPL-2.0, 2 OFL-1.1, 1 BSD-2-Clause, 1 BSD-3-Clause, 1 ISC. Apart from the two font packages, `three` and the Vite helpers listed above, nothing from them is in the build output.

## Runtime dependencies

One, and only for Studio: `three` 0.187.0 (MIT). The CSS shelf, the motion engine, the store and the reader still depend on nothing, and a page that never turns Studio on never downloads three.js.

Studio's materials and textures (cloth weave, leather grain, paper fibre, foil, holographic film, the studio light) are generated in code at run time. No image, model or shader from any other site is used. The two sites studied for 0.3 (Stripe Press book pages and trevornoah.com/books) were measured for motion and lighting behaviour only.

# Provenance

What is in this repository, where it came from, and what it is licensed under. Written for release 0.1.0.

## Original work

Everything under `src/`, `examples/`, `tests/`, `.agents/`, the HTML entry pages, the documentation and the three GIFs in `docs/media/` was written or generated for this project and is offered under Apache-2.0.

| Kind | Where | Note |
|---|---|---|
| Source code | `src/**`, `examples/**`, `tests/**` | Written for this project. No code was copied from another project. |
| Cover art | `src/shelf/cover-art.ts` | Drawn by code from a seed (arcs, bars, dots, rays, tiles, waves). No image files. |
| Sample reading texts | `src/data/sample-texts.ts` | Original notes written for this project. They are not excerpts of the pages the sample links point to. |
| Sample links | `src/data/sample-library.ts` | Fourteen public pages, linked by URL only. Titles on the spines are this project's own. |
| Icons and marks | `public/favicon.svg`, the wordmark sigil in CSS | Drawn for this project. |
| Social preview | `public/social-preview.png` | A screenshot of this app. |
| GIFs | `docs/media/*.gif` | Recorded from this app running in a browser and encoded with Gifski. A pointer marker was added to the page for the recording so that drags and taps are visible. |

## The visual reference

The shelf's interaction model was studied from a publicly viewable screen recording of a third-party shelf interface. The study measured frames: spine and cover proportions, the turn of the centred volume, and the timing and structure of opening and closing.

- No source code of that interface was available or used.
- None of its artwork, text, names, colours as a set, typefaces or brand elements appear here.
- The recording itself, frames from it and the measurements are kept outside this repository and are not distributed.

What was taken from the study is the idea of the interaction and its proportions: a row of spines, a centred volume turned to its cover, and a volume that grows open into a page while its cover travels aside.

What the recording did not show, and is therefore this project's own design: dragging, flicking and snapping, touch behaviour, the keyboard model, focus handling, reduced motion, small-screen layout, the reader and its resume, the store and its data format, the list view, and the three additional looks.

## Bundled third-party material

Three things in a production build come from other parties: two typefaces and one small helper script from the build tool.

| Material | Source package | Version | Licence | Shipped as |
|---|---|---|---|---|
| Newsreader (variable, roman and italic, Latin and Latin Extended) | `@fontsource-variable/newsreader` | 5.3.0 | SIL OFL 1.1 | `dist/assets/newsreader-*.woff2` |
| IBM Plex Mono (400 and 500, Latin and Latin Extended) | `@fontsource/ibm-plex-mono` | 5.3.0 | SIL OFL 1.1 | `dist/assets/ibm-plex-mono-*.woff2` |
| Module preload helper added to the generated JavaScript | `vite` | 8.3.7 | MIT | part of `dist/assets/base-*.js`, about 0.7 kB |

The font licence texts are copied byte for byte from the packages into `public/licenses/`. The MIT notice for the helper is the "Vite core license" section of that package's `LICENSE.md`, copied exactly into `public/licenses/Vite-MIT.txt`. All three are served with every build. See `THIRD_PARTY_NOTICES.md`.

## Development tools

Used to build and test, not shipped: Vite 8.3.7 (MIT), TypeScript 7.0.2 (Apache-2.0), Vitest 5.1.0 (MIT), happy-dom 21.0.4 (MIT), Playwright Test 1.65.0 (Apache-2.0). An install resolves 95 packages in total on Windows x64: 52 MIT, 26 Apache-2.0, 12 MPL-2.0, 2 OFL-1.1, 1 BSD-2-Clause, 1 BSD-3-Clause, 1 ISC, counted from `package-lock.json`. None of their code is in the build output apart from the module-preload helper from Vite listed above.

## Runtime dependencies

None.

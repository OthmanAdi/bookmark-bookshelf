# Bookmark Bookshelf 0.1.0

This is the first release.

Bookmark Bookshelf is an open-source 3D bookmark manager. Saved links stand as volumes on an interactive bookshelf. You drag the row, open a volume, read the copy you saved with it, and come back later to the same paragraph.

The source is at https://github.com/OthmanAdi/bookmark-bookshelf. A hosted demo is not published yet, so the way to see it is to run it locally.

## What is in this release

- A working app (`app.html`) for adding, editing, organising and reading saved links. Data stays in the browser's local storage, with export and import.
- A homepage (`index.html`) with a live sample shelf.
- Four reusable modules with no runtime dependencies, which are the shelf, motion, store and reader.
- Three small example pages that each run part of it alone.
- A skill that lets a coding agent build all or part of it into another project.
- Four looks, named Paper Row, Oak Library, Night Study and Pocket Paperbacks.

## Try it

Run it locally.

```bash
git clone https://github.com/OthmanAdi/bookmark-bookshelf.git
cd bookmark-bookshelf
npm install
npm run dev
```

It needs Node `^22.12.0`, `^24.0.0` or `>=26.0.0`. Then open `http://127.0.0.1:5173/`.

## How it was checked

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm test` | 420 unit tests pass |
| `npm run test:e2e` | 81 browser tests pass on desktop Chromium, phone-sized Chromium with touch, and a WebKit smoke run |
| `npm run build` | static build, about 62 kB of app JavaScript before compression (24 kB gzipped), sample texts not counted |
| Skill trial, part of the product | A separate agent built the shelf with motion into an empty project from the skill alone. Type check, 184 copied unit tests, build and 5 browser checks passed |
| Skill trial, whole product | A separate agent built all four modules into an empty project from the skill alone. Type check, 396 copied unit tests, build and 7 browser checks passed |

Details of the two skill trials are in [SKILL-TRIALS.md](SKILL-TRIALS.md).

## What to know before using it

- The reader shows text you saved. It does not fetch articles. A link saved without text offers a paste field and a link to the original.
- Clearing site data in the browser removes the library. Export it first if it matters.
- Firefox has not been tested. Safari is covered only by a WebKit smoke test.

## Licence

The project is licensed under Apache-2.0. Bundled typefaces are under the SIL Open Font License 1.1, and the built JavaScript includes a small module-preload helper from Vite under the MIT License. The licence texts are in `public/licenses/`. See `NOTICE`, `THIRD_PARTY_NOTICES.md` and `PROVENANCE.md`.

The full list of changes is in [CHANGELOG.md](../CHANGELOG.md).

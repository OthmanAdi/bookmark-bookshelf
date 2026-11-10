# Bookmark Bookshelf 0.1.0-rc.1

Release candidate. Not published.

Bookmark Bookshelf is an open-source 3D bookmark manager. Saved links stand as volumes on an interactive bookshelf. You drag the row, open a volume, read the copy you saved with it, and come back later to the same paragraph.

## What is in this candidate

- A working app (`app.html`): add, edit, organise and read saved links. Data stays in the browser's local storage, with export and import.
- A homepage (`index.html`) with a live sample shelf.
- Four reusable modules with no runtime dependencies: shelf, motion, store, reader.
- Three small example pages that each run part of it alone.
- A skill that lets a coding agent build all or part of it into another project.
- Four looks: Paper Row, Oak Library, Night Study, Pocket Paperbacks.

## Try it

```bash
npm install
npm run dev
```

Node `^22.12.0`, `^24.0.0` or `>=26.0.0`. Open `http://127.0.0.1:5173/`.

## How it was checked

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm test` | 411 unit tests pass |
| `npm run test:e2e` | 79 browser tests pass: desktop Chromium, phone-sized Chromium with touch, WebKit smoke |
| `npm run build` | static build, about 59 kB of app JavaScript before compression (23 kB gzipped), sample texts not counted |
| Skill trial, part of the product | a separate agent built the shelf with motion into an empty project from the skill alone; type check, 184 copied unit tests, build and 5 browser checks passed |
| Skill trial, whole product | a separate agent built all four modules into an empty project from the skill alone; type check, 396 copied unit tests, build and 7 browser checks passed |

Details of the two skill trials are in [SKILL-TRIALS.md](SKILL-TRIALS.md).

## What to know before using it

- The reader shows text you saved. It does not fetch articles. A link saved without text offers a paste field and a link to the original.
- Clearing site data in the browser removes the library. Export it first if it matters.
- Firefox has not been tested. Safari is covered only by a WebKit smoke test.

## Licence

Apache-2.0. Bundled typefaces are under the SIL Open Font License 1.1, with licence texts in `public/licenses/`. See `NOTICE`, `THIRD_PARTY_NOTICES.md` and `PROVENANCE.md`.

Full list of changes: [CHANGELOG.md](../CHANGELOG.md).

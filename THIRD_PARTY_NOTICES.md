# Third-party notices

A production build of Bookmark Bookshelf contains four third-party works: two typefaces under the SIL Open Font License, Version 1.1, the three.js library under the MIT License, and one small helper script that the build tool adds to the JavaScript, also under the MIT License. The font files are unmodified subsets as published by the Fontsource project.

## Newsreader

- Copyright 2020 The Newsreader Project Authors (http://github.com/productiontype/Newsreader)
- Licence: SIL Open Font License 1.1
- Obtained from the npm package `@fontsource-variable/newsreader` 5.3.0
- Files used: `newsreader-latin-opsz-normal.woff2`, `newsreader-latin-opsz-italic.woff2`, `newsreader-latin-ext-opsz-normal.woff2`, `newsreader-latin-ext-opsz-italic.woff2`
- Full licence text: [`public/licenses/Newsreader-OFL-1.1.txt`](public/licenses/Newsreader-OFL-1.1.txt), served with every build at `licenses/Newsreader-OFL-1.1.txt`

## IBM Plex Mono

- Copyright 2017 IBM Corp. All rights reserved.
- Licence: SIL Open Font License 1.1
- Obtained from the npm package `@fontsource/ibm-plex-mono` 5.3.0
- Files used: `ibm-plex-mono-latin-400-normal.woff2`, `ibm-plex-mono-latin-500-normal.woff2`, `ibm-plex-mono-latin-ext-400-normal.woff2`, `ibm-plex-mono-latin-ext-500-normal.woff2`
- Full licence text: [`public/licenses/IBM-Plex-Mono-OFL-1.1.txt`](public/licenses/IBM-Plex-Mono-OFL-1.1.txt), served with every build at `licenses/IBM-Plex-Mono-OFL-1.1.txt`

The two font licence files are byte-for-byte copies of the `LICENSE` files in those packages. Under the OFL the fonts may be bundled and redistributed with software, provided the copyright notice and licence travel with them, which this build does. The font names are not used to promote this product.

## three.js

- Copyright © 2010-2026 three.js authors
- Licence: MIT
- Obtained from the npm package `three` 0.187.0
- Used by Studio, the optional WebGL drawing of the shelf. It is bundled into its own chunk in `assets/`, which the page loads only when someone chooses Studio; the CSS shelf never loads it.
- Full licence text: [`public/licenses/three.js-MIT.txt`](public/licenses/three.js-MIT.txt), served with every build at `licenses/three.js-MIT.txt`. It is a byte-for-byte copy of `LICENSE` in that package.

## Vite module preload helper

- Copyright (c) 2019-present, VoidZero Inc. and Vite contributors
- Licence: MIT
- Origin: the npm package `vite` 8.3.7, the build tool. When it bundles the site it adds a short module-preload helper to the generated JavaScript (the `base-*.js` chunk in `assets/`, about 0.7 kB). That helper is the only code from Vite in the build. Vite itself is not shipped.
- Full licence text: [`public/licenses/Vite-MIT.txt`](public/licenses/Vite-MIT.txt), served with every build at `licenses/Vite-MIT.txt`. It is the "Vite core license" section of `LICENSE.md` in that package, copied exactly.

No other third-party code, fonts, images or text are distributed with the build. Development tools are listed in [PROVENANCE.md](PROVENANCE.md).

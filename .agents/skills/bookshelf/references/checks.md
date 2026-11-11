# Targeted checks

Run the checks for what you took. Say which you ran. This file describes version 0.2.0.

## Commands

```bash
npx tsc --noEmit                 # types
npx vitest run src/<module>      # the module's own unit tests (needs vitest and happy-dom)
npx playwright test              # browser journeys (needs @playwright/test and installed browsers)
npx vite build                   # production build
```

Vitest needs `environment: 'happy-dom'` for the shelf, motion gesture and reader tests. Store tests run in any environment.

Minimal configuration for a project that has none:

```ts
// vite.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'happy-dom', include: ['src/**/*.test.ts'] } });
```

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests',
  use: { baseURL: 'http://127.0.0.1:5173' },
  webServer: { command: 'npx vite --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 720 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
```

Keep unit tests (`src/**/*.test.ts`) and browser tests (`tests/`) in separate folders so neither runner picks up the other's files. Browsers: `npx playwright install chromium`.

One file in the app folder, `src/app/flow-test-helpers.ts`, reads the file system and needs Node's types. It belongs to the app's own tests. Leave it behind when you copy single files from `src/app`.

## Full composition: setup smoke check

Run this right after copying, before writing any host code. It catches a missed file while the cause is still obvious.

```bash
for f in src/shelf/index.ts src/motion/index.ts src/store/index.ts src/reader/index.ts \
         src/app/bookshelf.ts src/app/bookshelf.css src/app/flight.ts src/styles/tokens.css; do
  test -f "$f" || echo "MISSING $f"
done
grep -c "import './bookshelf.css'" src/app/bookshelf.ts   # expect 1
grep -c "from './flight'" src/app/bookshelf.ts            # expect 1
npx tsc --noEmit && npx vite build
grep -l "bb-flight__book" dist/assets/*.css               # expect one file: the composition stylesheet was bundled
```

Adjust the paths if the host keeps sources somewhere other than `src/`, but keep `bookshelf.ts`, `bookshelf.css` and `flight.ts` in one folder, next to the four module folders. Then, in the browser with a volume open and at rest:

```ts
const state = await page.evaluate(() => ({
  reading: document.documentElement.classList.contains('bb-reading'), // true
  overflowY: getComputedStyle(document.documentElement).overflowY, // 'hidden'
  slotShadow: getComputedStyle(document.querySelector('.bb-reader__cover-slot')!).boxShadow, // 'none'
  flights: document.querySelectorAll('.bb-flight').length, // 0 once the cover has landed
}));
```

## Finding the source from an installed copy

An installed copy of the skill (`~/.claude/skills/bookshelf/`, `.claude/skills/bookshelf/` or the folder an installer made) may sit far from the repository. Check each of the three routes in step 0 of `SKILL.md` from a scratch folder, and say which you ran.

1. Next to the skill. Run the skill from `<root>/.agents/skills/bookshelf/` in a checkout. It must name `<root>` as the source root without asking anything, and must not run `git clone`.
2. A path the person gives. Install the skill alone, with no repository near it, and ask for a shelf while giving the path of a checkout in the request. It must use that path, run the verification, and not run `git clone`. Ask again without a path: it must ask for one and offer the clone, and must not fetch anything before the answer.
3. A shallow clone after a yes. Same installation, no path in the request. Answer yes when asked. The agent must have said beforehand that it would clone `https://github.com/OthmanAdi/bookmark-bookshelf` at tag `v0.2.0` into a temporary folder, and the clone must be shallow:

   ```bash
   git -C <temporary folder> rev-parse --is-shallow-repository   # true
   git -C <temporary folder> describe --tags --exact-match        # v0.2.0
   ```

   Answer no instead: nothing is cloned, and the skill asks for a path.

In every route the report names the source path, the version from `package.json` and the commit, and the eight markers listed in the setup smoke check are all present before any file is copied. With a marker deleted from the source, the skill stops and names it.

## Hooks to assert on

Prefer state attributes to timeouts.

| Element | Attribute or class | Values |
|---|---|---|
| `.bb-shelf` | `data-focus`, `data-focus-id` | index and id of the centred volume |
| `.bb-shelf` | `data-open` | `0`, `moving`, `1` |
| `.bb-shelf` | `data-loop`, `data-fixed` | `1` when the row loops, `1` when it stands still. A row with two ends that still travels has `0` in both |
| `.bb-shelf` | `data-variant`, `data-empty` | variant name, `0` or `1` |
| `.bb-shelf` | `data-settled` | set by your composition from `motion.state.settled`. The reference composition writes `1` at rest |
| `li.bb-book` | `data-id`, `data-index`, `data-slot`, `.is-centre`, `aria-hidden` on copies | |
| `button.bb-book__control` | one per item, and the centred one has `tabindex="0"`. It is invisible and has `pointer-events: none`: focus it or press keys on it, never click it | |
| `.bb-book.is-centre .bb-book__cover` | the face to click or tap to open the centred volume | |
| `.bb-book[data-index="3"]:not([aria-hidden]) .bb-book__spine` | the face to click to bring another volume to the centre | |
| `.bb-flight` | present only while a cover travels between the shelf and the page | |
| `.bb-reader` | `data-open` | `0`, `1` |
| `.bb-reader__sheet` | `scrollTop` | reading position |
| `.bb-reader__body [data-block]` | block index | |
| `.bb-reader__close`, `.bb-reader__open`, `.bb-reader__edit` | "Back to shelf", the "Open original" link, "Edit text" | |
| `.bb-reader__paste-field`, `.bb-reader__save` | textarea and save button of the paste panel (present when the document has no text, or after "Edit text") | |
| `.bb-reader__done`, `.bb-reader__next` | "Mark as read" (`aria-pressed`) and the next link, after the last paragraph | |
| `.bb-reader__size--down`, `.bb-reader__size--up`, `.bb-reader__readout` | the two text size buttons and the "34% read" readout | |
| `.bb-reader__notes-field` | textarea of the private notes | |

## Real mouse drag (Playwright)

```ts
const shelf = page.locator('.bb-shelf');
await expect(shelf).toHaveAttribute('data-fixed', '0'); // a standing row does not travel: see below
const scene = page.locator('.bb-shelf__scene');
const box = (await scene.boundingBox())!;
const y = box.y + box.height / 2;
const before = await shelf.getAttribute('data-focus-id');
await page.mouse.move(box.x + box.width * 0.7, y);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.4, y, { steps: 12 });
await page.mouse.up();
await expect(shelf).toHaveAttribute('data-settled', '1');
expect(await shelf.getAttribute('data-focus-id')).not.toBe(before);
await expect(page.locator('.bb-reader')).toHaveCount(0);
```

The last line matters: a drag must not count as a click.

A row that fits the scene stands still (`data-fixed="1"`) and a drag is ignored on purpose. To test dragging, give the shelf enough items to fill the scene (forty volumes of the default look loop at 1280 px) or use a narrow viewport. On a standing row, test the arrow keys and a click on a spine instead, and assert that a drag leaves `data-focus-id` unchanged.

On a looping row with few items, a long drag can travel a whole number of laps and land on the volume it started from. Drag by one or two pitches (`box.width * 0.1` is plenty) and keep it slow (12 or more steps) so it is not read as a flick.

## Real touch drag (Chromium, mobile context with `hasTouch`)

`page.touchscreen` only taps. Use the DevTools protocol so the browser runs its real touch pipeline, including `touch-action` and implicit pointer capture:

```ts
type TouchType = 'touchStart' | 'touchMove' | 'touchEnd';
const cdp = await page.context().newCDPSession(page);
const touch = (type: TouchType, x?: number, y?: number) =>
  cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: x === undefined || y === undefined ? [] : [{ x, y, id: 1 }],
  });

await touch('touchStart', startX, startY);
for (let step = 1; step <= 16; step++) {
  await touch('touchMove', startX - step * 12, startY + 1);
  await page.waitForTimeout(16);
}
await touch('touchEnd');
```

Two cases matter and both must pass: a horizontal drag that starts on the row moves it, and a vertical drag that starts on the row leaves `data-focus-id` unchanged and scrolls the page when the page is taller than the screen. If yours is short, add content below the shelf or use a smaller viewport height for that test, then assert that `window.scrollY` grew.

## Keyboard

Tab to the row (one stop), ArrowRight and ArrowLeft, Home, End, Enter to open, Tab stays inside the reader, Escape closes, and `document.activeElement` is again the same volume's `.bb-book__control`.

## Reduced motion

Run with `reducedMotion: 'reduce'`. After ArrowRight the row is at rest at once. Opening reaches `data-open="1"` on `.bb-reader` within about 150 ms, and no `.bb-flight` element appears.

## Resume

Open a long document, scroll `.bb-reader__sheet` with the wheel, wait for the store's coalesced write (250 ms) or call `flush`, and reload. The reader is open on the same id and `scrollTop` is within a line or two. Repeat on a link created in the test with pasted text, not only on seeded data. Scroll the way a person does: a script that brings a control at the top into view before the reload moves the position there.

## Safety

Add a link whose title and text contain `<img src=x onerror="window.__xss=1">`. `window.__xss` stays undefined and the markup is visible as text. Add `javascript:alert(1)` as an address: the store returns `invalid-url`.

## Page hygiene

`document.documentElement.scrollWidth <= window.innerWidth` at 320, 375 and 414 px. No `pageerror` and no `console.error` during any journey.

# Targeted checks

Run the checks for what you took. Say which you ran.

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

## Hooks to assert on

Prefer state attributes to timeouts.

| Element | Attribute or class | Values |
|---|---|---|
| `.bb-shelf` | `data-focus`, `data-focus-id` | index and id of the centred volume |
| `.bb-shelf` | `data-open` | `0`, `moving`, `1` |
| `.bb-shelf` | `data-variant`, `data-empty` | variant name, `0` or `1` |
| `.bb-shelf` | `data-settled` | set by your composition from `motion.state.settled`; the reference composition writes `1` at rest |
| `li.bb-book` | `data-id`, `data-index`, `data-slot`, `.is-centre`, `aria-hidden` on copies | |
| `button.bb-book__control` | one per item; the centred one has `tabindex="0"`. It is invisible and has `pointer-events: none`: focus it or press keys on it, never click it | |
| `.bb-book.is-centre .bb-book__cover` | the face to click or tap to open the centred volume | |
| `.bb-book[data-index="3"] .bb-book__spine` | the face to click to bring another volume to the centre | |
| `.bb-reader` | `data-open` | `0`, `1` |
| `.bb-reader__sheet` | `scrollTop` | reading position |
| `.bb-reader__body [data-block]` | block index | |
| `.bb-reader__close`, `.bb-reader__open`, `.bb-reader__edit` | close button, "Open original" link, "Edit reading copy" button | |
| `.bb-reader__paste-field`, `.bb-reader__save` | textarea and save button of the paste panel (present when the document has no text, or after Edit) | |

## Real mouse drag (Playwright)

```ts
const scene = page.locator('.bb-shelf__scene');
const box = (await scene.boundingBox())!;
const y = box.y + box.height / 2;
await page.mouse.move(box.x + box.width * 0.7, y);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.4, y, { steps: 12 });
await page.mouse.up();
await expect(page.locator('.bb-shelf')).toHaveAttribute('data-settled', '1');
```

Then assert `data-focus-id` changed and no reader appeared (a drag must not count as a click).

With very few items on a looping row, a drag can travel a whole number of laps and land on the volume it started from. Drag by one or two pitches (`box.width * 0.1` is plenty), keep it slow (12 or more steps) so it is not read as a flick, or test with `loop: false`.

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

Two cases matter and both must pass: a horizontal drag that starts on the centred cover moves the row; a vertical drag that starts on the row scrolls the page and leaves `data-focus-id` unchanged. The second case needs a page taller than the viewport: if yours is short, add content below the shelf or use a smaller viewport height for that test, then assert that `window.scrollY` grew.

## Keyboard

Tab to the row (one stop), ArrowRight and ArrowLeft, Home, End, Enter to open, Tab stays inside the reader, Escape closes, and `document.activeElement` is again the same volume's `.bb-book__control`.

## Reduced motion

Run with `reducedMotion: 'reduce'`. After ArrowRight the row is at rest immediately. Opening reaches `data-open="1"` within about 150 ms.

## Resume

Open a long document, set `.bb-reader__sheet` `scrollTop` to a large value, wait for the store's coalesced write (250 ms) or call `flush`, reload. The reader is open on the same id and `scrollTop` is within a line or two. Repeat on a bookmark created in the test with pasted text, not only on seeded data.

## Safety

Add a bookmark whose title and reading copy contain `<img src=x onerror="window.__xss=1">`. `window.__xss` stays undefined and the markup is visible as text. Add `javascript:alert(1)` as a URL: the store returns `invalid-url`.

## Page hygiene

`document.documentElement.scrollWidth <= window.innerWidth` at 320, 375 and 414 px. No `pageerror` and no `console.error` during any journey.

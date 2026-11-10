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

## Hooks to assert on

Prefer state attributes to timeouts.

| Element | Attribute or class | Values |
|---|---|---|
| `.bb-shelf` | `data-focus`, `data-focus-id` | index and id of the centred volume |
| `.bb-shelf` | `data-open` | `0`, `moving`, `1` |
| `.bb-shelf` | `data-variant`, `data-empty` | variant name, `0` or `1` |
| `.bb-shelf` | `data-settled` | set by your composition from `motion.state.settled`; the reference composition writes `1` at rest |
| `li.bb-book` | `data-id`, `data-index`, `data-slot`, `.is-centre`, `aria-hidden` on copies | |
| `button.bb-book__control` | one per item; the centred one has `tabindex="0"` | |
| `.bb-reader` | `data-open` | `0`, `1` |
| `.bb-reader__sheet` | `scrollTop` | reading position |
| `.bb-reader__body [data-block]` | block index | |

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

## Real touch drag (Chromium, mobile context with `hasTouch`)

`page.touchscreen` only taps. Use the DevTools protocol so the browser runs its real touch pipeline, including `touch-action` and implicit pointer capture:

```ts
const cdp = await page.context().newCDPSession(page);
const touch = (type: string, x?: number, y?: number) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x === undefined ? [] : [{ x, y: y!, id: 1 }] });

await touch('touchStart', startX, startY);
for (let step = 1; step <= 16; step++) {
  await touch('touchMove', startX - step * 12, startY + 1);
  await page.waitForTimeout(16);
}
await touch('touchEnd');
```

Two cases matter and both must pass: a horizontal drag that starts on the centred cover moves the row; a vertical drag that starts on the row scrolls the page and leaves `data-focus-id` unchanged.

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

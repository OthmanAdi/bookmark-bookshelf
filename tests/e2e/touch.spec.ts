import {
  afterTwoFrames,
  centreOf,
  expect,
  expectSettled,
  focusId,
  noHorizontalOverflow,
  openApp,
  readerOf,
  shelfOf,
  test,
  touchDrag,
} from './fixtures';

test.describe('touch', () => {
  test('a horizontal touch drag on the shelf moves the row to another volume', async ({ page }) => {
    await openApp(page);
    const before = await focusId(page);
    const scene = await centreOf(page.locator('.bb-shelf__scene'));

    await touchDrag(page, { x: scene.x + 120, y: scene.y }, { x: scene.x - 120, y: scene.y });

    await expect(shelfOf(page)).not.toHaveAttribute('data-focus-id', before);
    await expectSettled(page);
    await expect(readerOf(page)).toHaveCount(0);
  });

  test('a vertical touch drag that starts on the shelf scrolls the page and leaves the volume alone', async ({ page }) => {
    // A short window guarantees the page is taller than the screen.
    await page.setViewportSize({ width: 412, height: 420 });
    await openApp(page);
    const before = await focusId(page);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const scene = await centreOf(page.locator('.bb-shelf__scene'));
    const startY = Math.min(scene.y, 360);

    await touchDrag(page, { x: scene.x, y: startY }, { x: scene.x, y: Math.max(20, startY - 260) }, 14);

    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(20);
    await afterTwoFrames(page);
    expect(await focusId(page)).toBe(before);
    await expectSettled(page);
  });

  test('a tap on the centred cover opens the reader', async ({ page }) => {
    await openApp(page);
    const cover = await centreOf(page.locator('.bb-book.is-centre .bb-book__cover'));
    await page.touchscreen.tap(cover.x, cover.y);
    await expect(readerOf(page)).toHaveAttribute('data-open', '1');
    await expect(page.locator('.bb-reader__title')).toHaveText('On Piles of Unread Books');
  });

  test('a tap opens the centred volume every time, also straight after a fast swipe', async ({ page }) => {
    // After a swipe released at speed some browsers swallow the click of the next tap.
    // The shelf recognises taps from pointer events, so the volume must open on the first tap, repeatedly.
    await openApp(page);
    for (let round = 0; round < 5; round++) {
      const scene = await centreOf(page.locator('.bb-shelf__scene'));
      await touchDrag(page, { x: scene.x + 110, y: scene.y }, { x: scene.x + 10, y: scene.y + 1 });
      await expectSettled(page);
      const centredId = await focusId(page);
      const cover = await centreOf(page.locator('.bb-book.is-centre .bb-book__cover'));
      await page.touchscreen.tap(cover.x, cover.y);
      await expect(readerOf(page)).toHaveAttribute('data-open', '1');
      await expect(shelfOf(page)).toHaveAttribute('data-focus-id', centredId);
      await page.keyboard.press('Escape');
      await expect(readerOf(page)).toHaveCount(0);
      await expectSettled(page);
    }
  });

  test('a touch that travels out and back to its start is a drag, not a tap, and opens nothing', async ({ page }) => {
    await openApp(page);
    const cover = await centreOf(page.locator('.bb-book.is-centre .bb-book__cover'));
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: x === undefined || y === undefined ? [] : [{ x, y, id: 1 }],
      });

    // Out 60px and back onto the starting point, quickly enough to stay under the tap time limit.
    await touch('touchStart', cover.x, cover.y);
    for (let step = 1; step <= 6; step++) await touch('touchMove', cover.x - step * 10, cover.y);
    for (let step = 5; step >= 0; step--) await touch('touchMove', cover.x - step * 10, cover.y);
    await touch('touchEnd');

    await expectSettled(page);
    await afterTwoFrames(page);
    await expect(readerOf(page)).toHaveCount(0);
    await expect(shelfOf(page)).toHaveAttribute('data-open', '0');
  });

  test('a tap on a spine beside the centre brings it to the centre without opening', async ({ page }) => {
    await openApp(page);
    const slot = Number(await page.locator('.bb-book.is-centre').getAttribute('data-slot'));
    const neighbour = page.locator(`.bb-book[data-slot="${slot + 1}"]`);
    const neighbourId = (await neighbour.getAttribute('data-id')) as string;
    const spine = await centreOf(neighbour.locator('.bb-book__spine'));

    await page.touchscreen.tap(spine.x, spine.y);

    await expect(shelfOf(page)).toHaveAttribute('data-focus-id', neighbourId);
    await expectSettled(page);
    await expect(readerOf(page)).toHaveCount(0);
  });

  test('the page has no horizontal overflow, with the shelf, the list and the reader', async ({ page }) => {
    await openApp(page);
    expect(await noHorizontalOverflow(page)).toBe(true);

    await page.locator('#view').click();
    await expect(page.locator('#list')).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
    await page.locator('#view').click();
    await expect(shelfOf(page)).toBeVisible();

    await page.locator('#add').click();
    await expect(page.locator('#editor')).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
  });
});

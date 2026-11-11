import {
  FIRST_EXAMPLE,
  SECOND_EXAMPLE,
  addButton,
  afterTwoFrames,
  centreOf,
  editorOf,
  expect,
  expectCentred,
  expectReaderOpen,
  expectSettled,
  focusId,
  libraryButton,
  listOf,
  noHorizontalOverflow,
  openApp,
  readerOf,
  readerTitle,
  shelfOf,
  showList,
  showShelf,
  test,
  touchDrag,
  viewButton,
} from './fixtures';

test.describe('touch', () => {
  test('a horizontal touch drag on the shelf moves the row to another link', async ({ page }) => {
    await openApp(page);
    const before = await focusId(page);
    const scene = await centreOf(page.locator('.bb-shelf__scene'));

    await touchDrag(page, { x: scene.x + 120, y: scene.y }, { x: scene.x - 120, y: scene.y });

    await expect(shelfOf(page)).not.toHaveAttribute('data-focus-id', before);
    await expectSettled(page);
    await expect(page.locator('.bb-book.is-centre')).toHaveAttribute('data-id', await focusId(page));
    await expect(readerOf(page)).toHaveCount(0);
  });

  test('a vertical touch drag that starts on the shelf scrolls the page and leaves the row alone', async ({ page }) => {
    // A window shorter than the least height the working view keeps, so the page is taller than the screen.
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
    await expectReaderOpen(page);
    await expect(readerTitle(page)).toHaveText(FIRST_EXAMPLE.title);
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
    await expect(neighbour).toHaveAttribute('data-id', SECOND_EXAMPLE.id);
    const spine = await centreOf(neighbour.locator('.bb-book__spine'));

    await page.touchscreen.tap(spine.x, spine.y);

    await expectCentred(page, SECOND_EXAMPLE.id);
    await expect(readerOf(page)).toHaveCount(0);
  });

  test('View and Add a link sit in a dock at the bottom, and the bar keeps search and the library menu', async ({ page }) => {
    await openApp(page);
    const height = page.viewportSize()?.height ?? 0;
    const width = page.viewportSize()?.width ?? 0;
    const add = await addButton(page).boundingBox();
    const view = await viewButton(page).boundingBox();
    const library = await libraryButton(page).boundingBox();
    const search = await page.getByRole('button', { name: 'Search your links' }).boundingBox();

    // In reach of a thumb: the lowest 90 px of the screen, with Add a link taking most of the width.
    expect((add?.y ?? 0) + (add?.height ?? 0)).toBeLessThanOrEqual(height);
    expect(add?.y ?? 0).toBeGreaterThan(height - 90);
    expect(view?.y ?? 0).toBeGreaterThan(height - 90);
    expect(add?.width ?? 0).toBeGreaterThan(width / 2);
    expect(library?.y ?? height).toBeLessThan(60);
    expect(search?.y ?? height).toBeLessThan(60);
    for (const box of [add, view, library, search]) expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    // The View menu opens upward from the dock and stays on screen.
    await viewButton(page).click();
    const menu = page.getByRole('menu', { name: 'View' });
    await expect(menu).toBeInViewport({ ratio: 1 });
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('the page has no horizontal overflow, with the shelf, the list, the dialog and the reader', async ({ page }) => {
    await openApp(page);
    expect(await noHorizontalOverflow(page)).toBe(true);

    await showList(page);
    await expect(listOf(page)).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
    await showShelf(page);

    await addButton(page).click();
    await expect(editorOf(page)).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
    // Save stays on screen however long the form is.
    await expect(editorOf(page).getByRole('button', { name: 'Save', exact: true })).toBeInViewport({ ratio: 1 });
    await editorOf(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(editorOf(page)).toBeHidden();

    const cover = await centreOf(page.locator('.bb-book.is-centre .bb-book__cover'));
    await page.touchscreen.tap(cover.x, cover.y);
    await expectReaderOpen(page);
    expect(await noHorizontalOverflow(page)).toBe(true);
  });
});

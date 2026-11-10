import {
  afterTwoFrames,
  centreOf,
  centreOffset,
  centredControl,
  expect,
  expectSettled,
  focusId,
  mouseDrag,
  openApp,
  readerOf,
  shelfOf,
  test,
} from './fixtures';

test.describe('mouse', () => {
  test('a real drag across the row changes the volume and settles on a whole index', async ({ page }) => {
    await openApp(page);
    const before = await focusId(page);
    const restOffset = await centreOffset(page);

    const scene = await centreOf(page.locator('.bb-shelf__scene'));
    await mouseDrag(page, { x: scene.x + 220, y: scene.y }, -440);

    await expect(shelfOf(page)).not.toHaveAttribute('data-focus-id', before);
    await expectSettled(page);
    // At rest on a whole index the centred volume sits exactly where the first one did.
    expect(await centreOffset(page)).toBeCloseTo(restOffset, 1);
    await expect(shelfOf(page)).toHaveAttribute('data-open', '0');
    await expect(readerOf(page)).toHaveCount(0);
  });

  test('dragging the other way moves back', async ({ page }) => {
    await openApp(page);
    const restOffset = await centreOffset(page);
    const scene = await centreOf(page.locator('.bb-shelf__scene'));
    await mouseDrag(page, { x: scene.x - 220, y: scene.y }, 440);
    await expect(shelfOf(page)).not.toHaveAttribute('data-focus-id', 'bm-tsundoku');
    await expectSettled(page);
    expect(await centreOffset(page)).toBeCloseTo(restOffset, 1);
  });

  test('a short click on a spine beside the centre brings it to the centre without opening', async ({ page }) => {
    await openApp(page);
    const slot = Number(await page.locator('.bb-book.is-centre').getAttribute('data-slot'));
    const neighbour = page.locator(`.bb-book[data-slot="${slot + 1}"]`);
    const neighbourId = await neighbour.getAttribute('data-id');
    expect(neighbourId).not.toBeNull();

    await neighbour.locator('.bb-book__spine').click();

    await expect(shelfOf(page)).toHaveAttribute('data-focus-id', neighbourId as string);
    await expectSettled(page);
    await expect(shelfOf(page)).toHaveAttribute('data-open', '0');
    await expect(readerOf(page)).toHaveCount(0);
    await expect(page.locator('.bb-book.is-centre')).toHaveAttribute('data-id', neighbourId as string);
  });

  test('a click on the centred cover opens the reader', async ({ page }) => {
    await openApp(page);
    await page.locator('.bb-book.is-centre .bb-book__cover').click();
    await expect(readerOf(page)).toHaveAttribute('data-open', '1');
    await expect(page.locator('.bb-reader__title')).toHaveText('On Piles of Unread Books');
  });

  test('a drag that starts on the centred cover moves the row and does not open the reader', async ({ page }) => {
    await openApp(page);
    const before = await focusId(page);
    const cover = await centreOf(page.locator('.bb-book.is-centre .bb-book__cover'));

    await mouseDrag(page, cover, -260);
    await expect(shelfOf(page)).not.toHaveAttribute('data-focus-id', before);
    await expectSettled(page);
    await afterTwoFrames(page);

    await expect(readerOf(page)).toHaveCount(0);
    await expect(shelfOf(page)).toHaveAttribute('data-open', '0');
  });

  test('the arrow buttons step one volume at a time', async ({ page }) => {
    await openApp(page);
    const first = await focusId(page);

    await page.locator('.bb-shelf__arrow--next').click();
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '1');
    await expectSettled(page);

    await page.locator('.bb-shelf__arrow--next').click();
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '2');
    await expectSettled(page);

    await page.locator('.bb-shelf__arrow--prev').click();
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '1');
    await expectSettled(page);

    await page.locator('.bb-shelf__arrow--prev').click();
    await expect(shelfOf(page)).toHaveAttribute('data-focus-id', first);
    await expectSettled(page);
    await expect(centredControl(page)).toHaveCount(1);
  });
});

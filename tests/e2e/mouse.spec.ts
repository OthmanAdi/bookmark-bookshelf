import {
  EXAMPLE_COUNT,
  FIRST_EXAMPLE,
  LOOKUPS,
  NARROW_WINDOW,
  SECOND_EXAMPLE,
  afterTwoFrames,
  captionTitle,
  centreOf,
  centreTurn,
  centredControl,
  expect,
  expectCentred,
  expectReaderOpen,
  expectSettled,
  focusId,
  mouseDrag,
  openApp,
  openShelf,
  readerOf,
  readerTitle,
  shelfOf,
  stageOf,
  test,
} from './fixtures';

test.describe('mouse', () => {
  test('a real drag across the row changes the link and comes to rest on a whole place', async ({ page }) => {
    await page.setViewportSize(NARROW_WINDOW);
    await openApp(page);
    await expect(shelfOf(page)).toHaveAttribute('data-loop', '1');
    const before = await focusId(page);
    const restTurn = await centreTurn(page);
    expect(restTurn).toBeGreaterThan(0.9);

    const scene = await centreOf(page.locator('.bb-shelf__scene'));
    await mouseDrag(page, { x: scene.x + 220, y: scene.y }, -440);

    await expect(shelfOf(page)).not.toHaveAttribute('data-focus-id', before);
    await expectSettled(page);
    // At rest on a whole place the centred volume shows as much of its cover as the first one did.
    expect(await centreTurn(page)).toBeCloseTo(restTurn, 3);
    await expect(page.locator('.bb-book.is-centre')).toHaveAttribute('data-id', await focusId(page));
    await expect(shelfOf(page)).toHaveAttribute('data-open', '0');
    await expect(readerOf(page)).toHaveCount(0);
  });

  test('dragging the other way moves back', async ({ page }) => {
    await page.setViewportSize(NARROW_WINDOW);
    await openApp(page);
    const restTurn = await centreTurn(page);
    await centredControl(page).focus();
    await page.keyboard.press('End');
    await expect(shelfOf(page)).toHaveAttribute('data-focus', String(EXAMPLE_COUNT - 1));
    await expectSettled(page);

    const scene = await centreOf(page.locator('.bb-shelf__scene'));
    await mouseDrag(page, { x: scene.x - 220, y: scene.y }, 440);
    await expect(shelfOf(page)).not.toHaveAttribute('data-focus', String(EXAMPLE_COUNT - 1));
    await expectSettled(page);
    expect(await centreTurn(page)).toBeCloseTo(restTurn, 3);
    const landed = Number(await shelfOf(page).getAttribute('data-focus'));
    expect(landed).toBeLessThan(EXAMPLE_COUNT - 1);
    expect(landed).toBeGreaterThan(EXAMPLE_COUNT - 9);
  });

  test('a short click on a spine beside the centre brings it to the centre without opening', async ({ page }) => {
    await openApp(page);
    const slot = Number(await page.locator('.bb-book.is-centre').getAttribute('data-slot'));
    const neighbour = page.locator(`.bb-book[data-slot="${slot + 1}"]`);
    await expect(neighbour).toHaveAttribute('data-id', SECOND_EXAMPLE.id);

    await neighbour.locator('.bb-book__spine').click();

    await expectCentred(page, SECOND_EXAMPLE.id);
    await expect(captionTitle(page)).toHaveText(SECOND_EXAMPLE.title);
    await expect(shelfOf(page)).toHaveAttribute('data-open', '0');
    await expect(readerOf(page)).toHaveCount(0);
  });

  test('a click on the centred cover opens the reader', async ({ page }) => {
    await openApp(page);
    await page.locator('.bb-book.is-centre .bb-book__cover').click();
    await expectReaderOpen(page);
    await expect(readerTitle(page)).toHaveText(FIRST_EXAMPLE.title);
  });

  test('a drag that starts on the centred cover moves the row and does not open the reader', async ({ page }) => {
    await page.setViewportSize(NARROW_WINDOW);
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

  test('the arrows beside the title step one link at a time and say where the row came to rest', async ({ page }) => {
    await openApp(page);
    const next = stageOf(page).getByRole('button', { name: 'Next link' });
    const previous = stageOf(page).getByRole('button', { name: 'Previous link' });
    const announcer = page.locator('#announcer');

    await next.click();
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '1');
    await expectSettled(page);
    await expect(captionTitle(page)).toHaveText(SECOND_EXAMPLE.title);
    await expect(announcer).toHaveText(`${SECOND_EXAMPLE.title}, 2 of ${EXAMPLE_COUNT}`);
    await expect(next).toBeFocused();

    await next.click();
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '2');
    await expectSettled(page);

    await previous.click();
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '1');
    await expectSettled(page);

    await previous.click();
    await expectCentred(page, FIRST_EXAMPLE.id);
    await expect(announcer).toHaveText(`${FIRST_EXAMPLE.title}, 1 of ${EXAMPLE_COUNT}`);
    await expect(centredControl(page)).toHaveCount(1);
  });

  test('a short shelf does not scroll: a drag leaves the row between its bookends, and a click on a spine presents that volume', async ({
    page,
  }) => {
    await openApp(page);
    await openShelf(page, LOOKUPS.id);
    await expect(page.locator('.bb-book')).toHaveCount(LOOKUPS.count);
    await expect(shelfOf(page)).toHaveAttribute('data-loop', '0');
    const ends = page.locator('.bb-shelf__bookend');
    await expect(ends).toHaveCount(2);

    /** Where the row stands: the outer edges of its two bookends. */
    const span = async (): Promise<{ left: number; right: number }> => {
      const [start, end] = await Promise.all([ends.first().boundingBox(), ends.last().boundingBox()]);
      return { left: start?.x ?? 0, right: (end?.x ?? 0) + (end?.width ?? 0) };
    };
    /** Waits until the row has stopped where it is. */
    const atRest = async (): Promise<{ left: number; right: number }> => {
      await expectSettled(page);
      await expect
        .poll(async () => {
          const one = await span();
          await afterTwoFrames(page);
          const other = await span();
          return Math.abs(one.left - other.left) + Math.abs(one.right - other.right);
        })
        .toBeLessThan(0.5);
      return span();
    };

    const before = await atRest();
    const window = page.viewportSize()?.width ?? 0;
    // The row stands in the middle of the stage with room on both sides.
    expect(before.left).toBeGreaterThan(100);
    expect(before.right).toBeLessThan(window - 100);
    expect(Math.abs((before.left + before.right) / 2 - window / 2)).toBeLessThan(60);

    // A drag as long as the row itself: a row that scrolled would be carried off by it.
    const scene = await centreOf(page.locator('.bb-shelf__scene'));
    await mouseDrag(page, { x: scene.x + 200, y: scene.y }, -400);
    const after = await atRest();
    expect(Math.abs(after.left - before.left)).toBeLessThan(40);
    expect(Math.abs(after.right - before.right)).toBeLessThan(40);
    await expect(page.locator('.bb-book')).toHaveCount(LOOKUPS.count);
    await expect(readerOf(page)).toHaveCount(0);

    // A click on a spine presents that volume where it stands.
    const other = page.locator('.bb-book:not(.is-centre)').first();
    const otherId = (await other.getAttribute('data-id')) as string;
    expect(otherId).not.toBe(await focusId(page));
    await other.locator('.bb-book__spine').click();
    await expectCentred(page, otherId);
    const chosen = await atRest();
    expect(Math.abs(chosen.left - before.left)).toBeLessThan(40);
    expect(Math.abs(chosen.right - before.right)).toBeLessThan(40);
    await expect(readerOf(page)).toHaveCount(0);
    await expect(shelfOf(page)).toHaveAttribute('data-open', '0');
  });
});

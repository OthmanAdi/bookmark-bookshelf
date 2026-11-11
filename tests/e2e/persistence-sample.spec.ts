import {
  FIRST_EXAMPLE,
  LONG_EXAMPLE,
  READING,
  closeReader,
  expect,
  expectCentred,
  expectProgressStored,
  expectReaderOpen,
  expectSettled,
  focusId,
  openApp,
  openCentredWithKeyboard,
  openShelf,
  primaryAction,
  readLibrary,
  readSession,
  readerTitle,
  reloadApp,
  scrollSheet,
  scrollSheetToEnd,
  sheetOf,
  shelfOf,
  shelfTab,
  storedPercent,
  test,
} from './fixtures';

test.describe('an example keeps its place', () => {
  test('a long example reopens on the same link at the same scroll position after a reload', async ({ page }) => {
    await openApp(page);
    await openShelf(page, READING.id);
    await expectCentred(page, LONG_EXAMPLE.id);
    await openCentredWithKeyboard(page);
    await expect(readerTitle(page)).toHaveText(LONG_EXAMPLE.title);

    const reached = await scrollSheet(page, 1800);
    expect(reached, 'the example is long enough to scroll well down').toBeGreaterThan(600);
    await expectProgressStored(page, LONG_EXAMPLE.id);

    await reloadApp(page);
    await expectReaderOpen(page);
    await expect(readerTitle(page)).toHaveText(LONG_EXAMPLE.title);
    await expect(shelfOf(page)).toHaveAttribute('data-focus-id', LONG_EXAMPLE.id);
    await expect(shelfTab(page, READING.id)).toHaveAttribute('aria-pressed', 'true');

    await expect
      .poll(async () => Math.abs((await sheetOf(page).evaluate((sheet) => sheet.scrollTop)) - reached), {
        message: 'scroll position is restored within 80 px',
      })
      .toBeLessThanOrEqual(80);
    expect((await readSession(page)).openId).toBe(LONG_EXAMPLE.id);
  });

  test('after closing, a reload keeps the centred link and opens no reader', async ({ page }) => {
    await openApp(page);
    await openCentredWithKeyboard(page);
    await closeReader(page);
    expect((await readSession(page)).openId).toBeNull();

    await page.keyboard.press('ArrowRight');
    await expect(shelfOf(page)).not.toHaveAttribute('data-focus-id', FIRST_EXAMPLE.id);
    await expectSettled(page);
    const centred = await focusId(page);
    await expect.poll(async () => (await readSession(page)).focusId).toBe(centred);

    await reloadApp(page);
    await expect(page.locator('.bb-reader')).toHaveCount(0);
    await expectCentred(page, centred);
  });

  test('the action under the row follows the reading place: Read, Resume at a percent, Read again', async ({ page }) => {
    await openApp(page);
    // The examples come with no reading history.
    await expect(primaryAction(page)).toHaveText('Read');

    await openCentredWithKeyboard(page);
    await scrollSheet(page, 500);
    await expectProgressStored(page, FIRST_EXAMPLE.id);
    await closeReader(page);
    const partly = Math.round((await storedPercent(page, FIRST_EXAMPLE.id)) * 100);
    expect(partly).toBeGreaterThan(0);
    expect(partly).toBeLessThan(100);
    await expect(primaryAction(page)).toHaveText(`Resume at ${partly}%`);

    await primaryAction(page).click();
    await expectReaderOpen(page);
    await scrollSheetToEnd(page);
    await expect.poll(() => storedPercent(page, FIRST_EXAMPLE.id)).toBe(1);
    await closeReader(page);
    await expect(primaryAction(page)).toHaveText('Read again');
    // Arriving at the end marks nothing as read; only the person does.
    expect((await readLibrary(page)).done).toEqual({});

    // Reading again starts at the top.
    await primaryAction(page).click();
    await expectReaderOpen(page);
    expect(await sheetOf(page).evaluate((sheet) => sheet.scrollTop)).toBe(0);
  });
});

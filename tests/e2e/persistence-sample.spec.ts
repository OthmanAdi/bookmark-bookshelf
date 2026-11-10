import {
  LONG_SAMPLE,
  closeReader,
  expect,
  expectProgressStored,
  expectReaderOpen,
  expectSettled,
  focusId,
  openApp,
  openCentredWithKeyboard,
  readLibrary,
  reloadApp,
  scrollSheet,
  sheetOf,
  shelfOf,
  test,
} from './fixtures';

test.describe('persistence and resume on a sample', () => {
  test('a long sample reopens on the same volume at the same scroll position after a reload', async ({ page }) => {
    await openApp(page);
    expect(await focusId(page)).toBe(LONG_SAMPLE.id);
    await openCentredWithKeyboard(page);
    await expect(page.locator('.bb-reader__title')).toHaveText(LONG_SAMPLE.title);

    const reached = await scrollSheet(page, 1800);
    expect(reached, 'the sample is long enough to scroll well down').toBeGreaterThan(600);
    await expectProgressStored(page, LONG_SAMPLE.id);

    await reloadApp(page);
    await expectReaderOpen(page);
    await expect(page.locator('.bb-reader__title')).toHaveText(LONG_SAMPLE.title);
    await expect(shelfOf(page)).toHaveAttribute('data-focus-id', LONG_SAMPLE.id);

    await expect
      .poll(async () => Math.abs((await sheetOf(page).evaluate((sheet) => sheet.scrollTop)) - reached), {
        message: 'scroll position is restored within 80 px',
      })
      .toBeLessThanOrEqual(80);
    expect((await readLibrary(page)).session.openId).toBe(LONG_SAMPLE.id);
  });

  test('after closing, a reload keeps the centred volume', async ({ page }) => {
    await openApp(page);
    await openCentredWithKeyboard(page);
    await closeReader(page);
    expect((await readLibrary(page)).session.openId).toBeNull();

    await page.keyboard.press('ArrowRight');
    await expect(shelfOf(page)).not.toHaveAttribute('data-focus-id', LONG_SAMPLE.id);
    await expectSettled(page);
    const centred = await focusId(page);
    await expect.poll(async () => (await readLibrary(page)).session.focusId).toBe(centred);

    await reloadApp(page);
    await expect(page.locator('.bb-reader')).toHaveCount(0);
    await expect(shelfOf(page)).toHaveAttribute('data-focus-id', centred);
    await expect(page.locator('.bb-book.is-centre')).toHaveAttribute('data-id', centred);
  });

  test('the caption action follows the stored progress of a sample', async ({ page }) => {
    await openApp(page);
    const actions = page.locator('.bb-shelf__actions');
    // The sample library ships with a part-read first volume.
    await expect(actions.getByRole('button', { name: 'Continue reading, 34%' })).toBeVisible();

    await openCentredWithKeyboard(page);
    await sheetOf(page).evaluate((sheet) => {
      sheet.scrollTop = sheet.scrollHeight;
    });
    await expect.poll(async () => (await readLibrary(page)).progress[LONG_SAMPLE.id]?.percent ?? 0).toBeGreaterThan(0.9);
    const stored = (await readLibrary(page)).progress[LONG_SAMPLE.id]?.percent ?? 0;

    await closeReader(page);
    const expected = Math.round(stored * 100);
    // A finished text offers "Read" again, a part-read one offers "Continue reading".
    const label = expected >= 100 ? 'Read' : `Continue reading, ${expected}%`;
    await expect(actions.getByRole('button', { name: label, exact: true })).toBeVisible();
  });
});

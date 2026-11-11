import {
  FIRST_EXAMPLE,
  centredControl,
  closeReaderButton,
  expect,
  expectReaderOpen,
  openApp,
  readerBody,
  readerOf,
  readerTitle,
  readout,
  readoutPercent,
  sheetOf,
  test,
} from './fixtures';

test.describe('reading on a phone', () => {
  test('the text column fits the screen, text is large enough, "Back to shelf" is a real target and scrolling updates the readout', async ({
    page,
  }) => {
    await openApp(page);
    await centredControl(page).focus();
    await page.keyboard.press('Enter');
    await expectReaderOpen(page);

    const sheet = sheetOf(page);
    const widths = await sheet.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    expect(widths.scroll, 'no horizontal scroll inside the sheet').toBeLessThanOrEqual(widths.client);

    const bodyFontSize = await readerBody(page).evaluate((body) => Number.parseFloat(getComputedStyle(body).fontSize));
    expect(bodyFontSize).toBeGreaterThanOrEqual(17);

    const close = await closeReaderButton(page).boundingBox();
    expect(close?.height ?? 0).toBeGreaterThanOrEqual(44);

    // Every block of text stays inside the sheet's width.
    const overflowing = await readerBody(page)
      .locator('[data-block]')
      .evaluateAll((blocks, limit) => blocks.filter((block) => block.getBoundingClientRect().right > limit + 1).length, widths.client);
    expect(overflowing).toBe(0);

    const before = await readoutPercent(page);
    await sheet.evaluate((element) => {
      element.scrollTop = element.scrollHeight / 2;
    });
    await expect.poll(() => readoutPercent(page)).toBeGreaterThan(before);
    await expect(readout(page)).toContainText('% read');
  });

  test('on a small phone the cover is a thumbnail beside the title and the text starts on the first screen', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await openApp(page);
    await centredControl(page).focus();
    await page.keyboard.press('Enter');
    await expectReaderOpen(page);
    await expect(readerTitle(page)).toHaveText(FIRST_EXAMPLE.title);

    const cover = await readerOf(page).locator('.bb-reader__cover-slot').boundingBox();
    const title = await readerTitle(page).boundingBox();
    expect(cover?.width ?? 0).toBeGreaterThanOrEqual(72);
    expect(cover?.width ?? 0).toBeLessThanOrEqual(96);
    // Beside the title block, not above it.
    expect(cover?.y ?? 0).toBeLessThan((title?.y ?? 0) + (title?.height ?? 0));
    expect((cover?.x ?? 0) + (cover?.width ?? 0)).toBeLessThanOrEqual(title?.x ?? 0);

    const firstParagraph = await readerBody(page).getByRole('paragraph').first().boundingBox();
    expect(firstParagraph?.y ?? 640, 'the first paragraph starts on the first screen').toBeLessThan(640);
  });

  test('on a small phone the reader keeps its two actions in one row', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await openApp(page);
    await centredControl(page).focus();
    await page.keyboard.press('Enter');
    await expectReaderOpen(page);

    const original = await readerOf(page).getByRole('link', { name: /^Open original/ }).boundingBox();
    const edit = await readerOf(page).getByRole('button', { name: 'Edit text' }).boundingBox();
    expect(Math.abs((original?.y ?? 0) - (edit?.y ?? 100))).toBeLessThan(8);
  });
});

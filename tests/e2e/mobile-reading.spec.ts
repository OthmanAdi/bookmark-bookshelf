import { centredControl, expect, expectReaderOpen, openApp, readoutPercent, sheetOf, test } from './fixtures';

test.describe('reading on a phone', () => {
  test('the text column fits the screen, text is large enough, Close is a real target and scrolling updates the readout', async ({
    page,
  }) => {
    await openApp(page);
    await centredControl(page).focus();
    await page.keyboard.press('Enter');
    await expectReaderOpen(page);

    const sheet = sheetOf(page);
    const widths = await sheet.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    expect(widths.scroll, 'no horizontal scroll inside the sheet').toBeLessThanOrEqual(widths.client);

    const bodyFontSize = await page.locator('.bb-reader__body').evaluate((body) => Number.parseFloat(getComputedStyle(body).fontSize));
    expect(bodyFontSize).toBeGreaterThanOrEqual(17);

    const close = await page.locator('.bb-reader__close').boundingBox();
    expect(close?.height ?? 0).toBeGreaterThanOrEqual(40);

    // Every block of text stays inside the sheet's width.
    const overflowing = await page.locator('.bb-reader__body [data-block]').evaluateAll((blocks, limit) => {
      return blocks.filter((block) => block.getBoundingClientRect().right > limit + 1).length;
    }, widths.client);
    expect(overflowing).toBe(0);

    const before = await readoutPercent(page);
    await sheet.evaluate((element) => {
      element.scrollTop = element.scrollHeight / 2;
    });
    await expect.poll(() => readoutPercent(page)).toBeGreaterThan(before);
    await expect(page.locator('.bb-reader__readout')).toContainText('% read');
  });
});

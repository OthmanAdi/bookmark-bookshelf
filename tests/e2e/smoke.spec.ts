import { centredControl, expect, expectReaderGone, expectReaderOpen, expectSettled, focusId, openApp, shelfOf, test } from './fixtures';

test.describe('smoke', () => {
  test('the app loads without errors and a volume is centred', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('.bb-book.is-centre')).toHaveCount(1);
    expect(await focusId(page)).not.toBe('');
  });

  test('ArrowRight steps, Enter opens the reader, Escape closes it', async ({ page }) => {
    await openApp(page);
    const first = await focusId(page);
    await centredControl(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(shelfOf(page)).not.toHaveAttribute('data-focus-id', first);
    await expectSettled(page);

    await page.keyboard.press('Enter');
    await expectReaderOpen(page);
    await expect(page.locator('.bb-reader__close')).toBeFocused();

    await page.keyboard.press('Escape');
    await expectReaderGone(page);
  });
});

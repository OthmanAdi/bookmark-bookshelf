import {
  FIRST_EXAMPLE,
  SECOND_EXAMPLE,
  captionTitle,
  centredControl,
  closeReaderButton,
  expect,
  expectReaderGone,
  expectReaderOpen,
  expectSettled,
  focusId,
  openApp,
  primaryAction,
  readerTitle,
  shelfOf,
  test,
} from './fixtures';

test.describe('smoke', () => {
  test('the app loads without errors and a volume is centred', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('.bb-book.is-centre')).toHaveCount(1);
    expect(await focusId(page)).toBe(FIRST_EXAMPLE.id);
    await expect(captionTitle(page)).toHaveText(FIRST_EXAMPLE.title);
    await expect(primaryAction(page)).toHaveText('Read');
  });

  test('ArrowRight steps, Enter opens the reader, Escape closes it', async ({ page }) => {
    await openApp(page);
    await centredControl(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(shelfOf(page)).toHaveAttribute('data-focus-id', SECOND_EXAMPLE.id);
    await expectSettled(page);
    await expect(captionTitle(page)).toHaveText(SECOND_EXAMPLE.title);

    await page.keyboard.press('Enter');
    await expectReaderOpen(page);
    await expect(closeReaderButton(page)).toBeFocused();
    await expect(readerTitle(page)).toHaveText(SECOND_EXAMPLE.title);

    await page.keyboard.press('Escape');
    await expectReaderGone(page);
  });
});

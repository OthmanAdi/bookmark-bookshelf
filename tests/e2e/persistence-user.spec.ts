import {
  actionsOf,
  addLink,
  closeReader,
  expect,
  expectProgressStored,
  expectReaderOpen,
  makeParagraphs,
  openApp,
  openCentredWithKeyboard,
  reloadApp,
  scrollSheet,
  sheetOf,
  shelfOf,
  test,
} from './fixtures';

test.describe('persistence and resume on a user-created bookmark', () => {
  test('a pasted reading copy is centred, resumes after a reload and shows "Continue reading" with a percent', async ({ page }) => {
    await openApp(page);
    const title = 'My long saved article';
    const bookmark = await addLink(page, {
      url: 'https://example.org/my-long-article',
      title,
      readingText: makeParagraphs(60),
    });

    // It appears on the shelf, centred, with the reading action on offer.
    await expect(page.locator('.bb-book.is-centre')).toHaveAttribute('data-id', bookmark.id);
    await expect(page.locator('.bb-shelf__title')).toHaveText(title);
    await expect(actionsOf(page).getByRole('button', { name: 'Read', exact: true })).toBeVisible();

    await openCentredWithKeyboard(page);
    await expect(page.locator('.bb-reader__title')).toHaveText(title);
    await expect(page.locator('.bb-reader__body [data-block]')).toHaveCount(60);

    const reached = await scrollSheet(page, 1500);
    expect(reached).toBeGreaterThan(500);
    await expectProgressStored(page, bookmark.id);

    await reloadApp(page);
    await expectReaderOpen(page);
    await expect(page.locator('.bb-reader__title')).toHaveText(title);
    await expect(shelfOf(page)).toHaveAttribute('data-focus-id', bookmark.id);
    await expect
      .poll(async () => Math.abs((await sheetOf(page).evaluate((sheet) => sheet.scrollTop)) - reached))
      .toBeLessThanOrEqual(80);

    await closeReader(page);
    await expect(actionsOf(page).getByRole('button', { name: /^Continue reading, \d+%$/ })).toBeVisible();
  });
});

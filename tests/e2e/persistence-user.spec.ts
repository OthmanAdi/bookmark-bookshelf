import {
  addLink,
  captionLine,
  captionTitle,
  closeReader,
  expect,
  expectProgressStored,
  expectReaderOpen,
  makeParagraphs,
  openApp,
  openCentredWithKeyboard,
  primaryAction,
  readerBody,
  readerTitle,
  reloadApp,
  scrollSheet,
  sheetOf,
  shelfOf,
  test,
} from './fixtures';

test.describe('a link the person added keeps its place', () => {
  test('a pasted text is centred, resumes after a reload and offers "Resume" with a percent', async ({ page }) => {
    await openApp(page);
    const title = 'My long saved article';
    const bookmark = await addLink(page, {
      url: 'https://example.org/my-long-article',
      title,
      note: 'For the train on Friday.',
      readingText: makeParagraphs(60),
    });

    // It stands on the shelf, centred, with its note under the title and the reading action on offer.
    await expect(page.locator('.bb-book.is-centre')).toHaveAttribute('data-id', bookmark.id);
    await expect(captionTitle(page)).toHaveText(title);
    await expect(captionLine(page)).toHaveText('For the train on Friday.');
    await expect(primaryAction(page)).toHaveText('Read');

    await openCentredWithKeyboard(page);
    await expect(readerTitle(page)).toHaveText(title);
    await expect(readerBody(page).getByRole('paragraph')).toHaveCount(60);

    const reached = await scrollSheet(page, 1500);
    expect(reached).toBeGreaterThan(500);
    await expectProgressStored(page, bookmark.id);

    await reloadApp(page);
    await expectReaderOpen(page);
    await expect(readerTitle(page)).toHaveText(title);
    await expect(shelfOf(page)).toHaveAttribute('data-focus-id', bookmark.id);
    await expect
      .poll(async () => Math.abs((await sheetOf(page).evaluate((sheet) => sheet.scrollTop)) - reached))
      .toBeLessThanOrEqual(80);

    await closeReader(page);
    await expect(primaryAction(page)).toHaveText(/^Resume at \d+%$/);
  });

  test('a link with no note says when it was saved and how long its text takes', async ({ page }) => {
    await openApp(page);
    await addLink(page, { url: 'https://example.org/short-read', title: 'A short read', readingText: makeParagraphs(30) });
    // Thirty paragraphs of sixteen words are 480 words: three minutes at 220 words a minute.
    await expect(captionLine(page)).toHaveText(/^Saved \d{1,2} [A-Z][a-z]{2}, 3 min$/);
  });
});

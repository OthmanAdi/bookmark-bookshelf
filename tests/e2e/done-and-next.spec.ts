import {
  FIRST_EXAMPLE,
  HOMEWORK,
  SECOND_EXAMPLE,
  centredControl,
  chooseInShelfMenu,
  closeReader,
  expect,
  expectCentred,
  expectReaderOpen,
  listRowFor,
  openApp,
  openCentredWithKeyboard,
  openShelf,
  primaryAction,
  readLibrary,
  readerOf,
  readerTitle,
  rowTitle,
  scrollSheetToEnd,
  sheetOf,
  showList,
  stageOf,
  storedLibrary,
  test,
} from './fixtures';

test.describe('done and next', () => {
  test('marking a link read at the end of its text changes the shelf line, and the action becomes "Read again"', async ({ page }) => {
    await openApp(page);
    await openShelf(page, HOMEWORK.id);
    await expectCentred(page, FIRST_EXAMPLE.id);
    // Six links, two of them optional: the line counts what is asked for and names where to start.
    await expect(page.getByText('Nothing read yet. About 1 h 17 min in all.')).toBeVisible();
    await expect(page.getByRole('button', { name: FIRST_EXAMPLE.title, exact: true })).toBeVisible();
    await expect(primaryAction(page)).toHaveText('Read');

    await openCentredWithKeyboard(page);
    await scrollSheetToEnd(page);
    const mark = readerOf(page).getByRole('button', { name: 'Mark as read' });
    await expect(mark).toBeVisible();
    await expect(mark).toHaveAttribute('aria-pressed', 'false');
    // Arriving at the end marks nothing by itself.
    expect((await storedLibrary(page))?.done ?? {}).toEqual({});

    await mark.click();
    await expect(mark).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => Object.keys((await storedLibrary(page))?.done ?? {})).toEqual([FIRST_EXAMPLE.id]);

    await closeReader(page);
    await expect(page.getByText(/^1 of 6 read\. About \d+ (h \d+ )?min left\./)).toBeVisible();
    await expect(page.locator('#shelf-status').getByRole('button', { name: SECOND_EXAMPLE.title, exact: true })).toBeVisible();
    await expect(primaryAction(page)).toHaveText('Read again');
    await expect(centredControl(page)).toHaveAccessibleName(/Marked as read$/);

    // The list says the same in words.
    await showList(page);
    await expect(listRowFor(page, FIRST_EXAMPLE.id).getByText(/^Read\b/)).toBeVisible();
    await expect(rowTitle(listRowFor(page, FIRST_EXAMPLE.id))).toHaveAccessibleName(`${FIRST_EXAMPLE.title}. Read again`);
    await expect(rowTitle(listRowFor(page, SECOND_EXAMPLE.id))).toHaveAccessibleName(`${SECOND_EXAMPLE.title}. Read`);
  });

  test('the mark can be taken back, and it is the person who decides', async ({ page }) => {
    await openApp(page);
    await openShelf(page, HOMEWORK.id);
    await openCentredWithKeyboard(page);
    await scrollSheetToEnd(page);
    const mark = readerOf(page).getByRole('button', { name: 'Mark as read' });
    await mark.click();
    await expect(mark).toHaveAttribute('aria-pressed', 'true');
    await mark.click();
    await expect(mark).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(async () => (await readLibrary(page)).done).toEqual({});

    await closeReader(page);
    await expect(page.getByText('Nothing read yet.')).toBeVisible();
  });

  test('at the end of a text on one shelf, "Next" opens the link that follows', async ({ page }) => {
    test.fixme(true, 'Pressing "Next" shows the next text for a moment and then drops back to the shelf.');
    await openApp(page);
    await openShelf(page, HOMEWORK.id);
    await openCentredWithKeyboard(page);
    await scrollSheetToEnd(page);

    const next = readerOf(page).getByRole('button', { name: new RegExp(`^Next: ${SECOND_EXAMPLE.title}`) });
    await expect(next).toBeVisible();
    await next.click();
    await expect(readerTitle(page)).toHaveText(SECOND_EXAMPLE.title);
    await expectReaderOpen(page);
    // The next text starts at its top.
    expect(await sheetOf(page).evaluate((sheet) => sheet.scrollTop)).toBe(0);

    await closeReader(page);
    await expectCentred(page, SECOND_EXAMPLE.id);
  });

  test('"Next" says how long the link that follows takes', async ({ page }) => {
    test.fixme(true, 'The button at the end of a text names the next link but leaves out its reading time ("Next: Web Storage API" instead of "…, about 2 min").');
    await openApp(page);
    await openShelf(page, HOMEWORK.id);
    await openCentredWithKeyboard(page);
    await scrollSheetToEnd(page);
    await expect(readerOf(page).getByRole('button', { name: new RegExp(`^Next: ${SECOND_EXAMPLE.title}, about \\d+ min$`) })).toBeVisible();
  });

  test('with every shelf in view there is no "Next", because no single order is being worked through', async ({ page }) => {
    await openApp(page);
    await openCentredWithKeyboard(page);
    await scrollSheetToEnd(page);
    await expect(readerOf(page).getByRole('button', { name: 'Mark as read' })).toBeVisible();
    await expect(readerOf(page).getByRole('button', { name: /^Next:/ })).toHaveCount(0);
  });

  test('the title after "Next:" in the shelf line brings that link to the centre', async ({ page }) => {
    await openApp(page);
    await openShelf(page, HOMEWORK.id);
    await centredControl(page).focus();
    await page.keyboard.press('End');
    await expect(stageOf(page).locator('#caption-title')).not.toHaveText(FIRST_EXAMPLE.title);

    await page.locator('#shelf-status').getByRole('button', { name: FIRST_EXAMPLE.title, exact: true }).click();
    await expectCentred(page, FIRST_EXAMPLE.id);
  });

  test('the hand-in summary lists what was marked read and is not sent anywhere', async ({ page }) => {
    await openApp(page);
    await openShelf(page, HOMEWORK.id);
    await openCentredWithKeyboard(page);
    await scrollSheetToEnd(page);
    await readerOf(page).getByRole('button', { name: 'Mark as read' }).click();
    await closeReader(page);

    await chooseInShelfMenu(page, 'Hand-in summary');
    const dialog = page.getByRole('dialog', { name: 'Hand-in summary' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Nothing is sent anywhere.')).toBeVisible();
    const summary = dialog.getByRole('textbox', { name: `Summary for ${HOMEWORK.name}` });
    await expect(summary).toHaveValue(new RegExp(HOMEWORK.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(summary).toHaveValue(/What is a URL\?/);
    await expect(summary).toHaveValue(/1 of \d/);
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toBeHidden();
  });
});

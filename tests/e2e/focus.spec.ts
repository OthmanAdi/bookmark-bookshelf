import {
  EXAMPLE_COUNT,
  FIRST_EXAMPLE,
  HOMEWORK,
  LONG_EXAMPLE,
  LOOKUPS,
  READING,
  SECOND_EXAMPLE,
  addButton,
  addLink,
  captionTitle,
  centredControl,
  closeReaderButton,
  editAction,
  editorOf,
  expect,
  expectCentred,
  expectReaderGone,
  expectReaderOpen,
  expectSettled,
  expectTabCount,
  focusedControl,
  listRows,
  makeParagraphs,
  openApp,
  openShelf,
  readLibrary,
  readerOf,
  readerTitle,
  shelfOf,
  shelfTab,
  showList,
  stageOf,
  test,
  toastsOf,
  viewButton,
} from './fixtures';

test.describe('focus never falls to the page', () => {
  test('choosing a shelf with the keyboard leaves focus on its tab', async ({ page }) => {
    await openApp(page);
    await shelfTab(page, READING.id).focus();
    await page.keyboard.press('Enter');
    await expect(shelfTab(page, READING.id)).toHaveAttribute('aria-pressed', 'true');
    await expectSettled(page);
    await expect(shelfTab(page, READING.id)).toBeFocused();

    await shelfTab(page).focus();
    await page.keyboard.press('Space');
    await expect(shelfTab(page)).toHaveAttribute('aria-pressed', 'true');
    await expectSettled(page);
    await expect(shelfTab(page)).toBeFocused();
  });

  test('moving a link keeps focus on the move button, also when it can go no further', async ({ page }) => {
    await openApp(page);
    await openShelf(page, HOMEWORK.id);
    await expectCentred(page, FIRST_EXAMPLE.id);
    const later = stageOf(page).getByRole('button', { name: 'Move later' });

    await later.focus();
    for (let place = 1; place < HOMEWORK.count; place++) {
      await page.keyboard.press('Enter');
      await expect(shelfOf(page)).toHaveAttribute('data-focus', String(place));
      await expectCentred(page, FIRST_EXAMPLE.id);
      await expect(later).toBeFocused();
    }
    // At the end the button stays where it is and says that it cannot go further.
    await expect(later).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Enter');
    await expect(shelfOf(page)).toHaveAttribute('data-focus', String(HOMEWORK.count - 1));
    await expect(later).toBeFocused();
  });

  test('Alt with an arrow key moves the centred link, and focus stays on its volume', async ({ page }) => {
    await openApp(page);
    await openShelf(page, HOMEWORK.id);
    await expectCentred(page, FIRST_EXAMPLE.id);
    await centredControl(page).focus();

    await page.keyboard.press('Alt+ArrowRight');
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '1');
    await expectCentred(page, FIRST_EXAMPLE.id);
    await expect(centredControl(page)).toBeFocused();
    const order = (await readLibrary(page)).bookmarks.filter((entry) => entry.shelfId === HOMEWORK.id).sort((a, b) => a.order - b.order);
    expect(order.map((entry) => entry.id).slice(0, 2)).toEqual([SECOND_EXAMPLE.id, FIRST_EXAMPLE.id]);

    await page.keyboard.press('Alt+ArrowLeft');
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '0');
    await expectCentred(page, FIRST_EXAMPLE.id);
    await expect(centredControl(page)).toBeFocused();
  });

  test('saving a dialog gives focus back to the control that opened it', async ({ page }) => {
    await openApp(page);
    await editAction(page).focus();
    await page.keyboard.press('Enter');
    const editor = editorOf(page);
    await expect(editor.getByRole('textbox', { name: 'Title', exact: true })).toBeFocused();
    await editor.getByRole('textbox', { name: 'Why you saved it' }).fill('A reason of my own.');
    await page.keyboard.press('Enter');
    await expect(editor).toBeHidden();
    await expect(editAction(page)).toBeFocused();

    await addButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(editor.getByRole('textbox', { name: 'Link (required)' })).toBeFocused();
    await page.keyboard.type('https://example.org/typed-with-keys');
    await page.keyboard.press('Enter');
    await expect(editor).toBeHidden();
    await expect(addButton(page)).toBeFocused();
    await expectTabCount(page, null, EXAMPLE_COUNT + 1);

    // Escape leaves a dialog the same way.
    await page.keyboard.press('Enter');
    await expect(editor).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(editor).toBeHidden();
    await expect(addButton(page)).toBeFocused();
  });

  test('removing a link moves focus to the control that now stands in its place', async ({ page }) => {
    await openApp(page);
    await editAction(page).focus();
    await page.keyboard.press('Enter');
    await editorOf(page).getByRole('button', { name: 'Remove link' }).click();
    await expect(editorOf(page)).toBeHidden();
    await expect(toastsOf(page)).toContainText(`Removed ${FIRST_EXAMPLE.title}.`);
    // The same button, now for the link that moved up.
    await expect(editAction(page)).toBeFocused();
    await expect(captionTitle(page)).not.toHaveText(FIRST_EXAMPLE.title);

    // Undo is a real button: it can be reached and pressed with the keyboard.
    const undo = toastsOf(page).getByRole('button', { name: 'Undo' });
    await undo.focus();
    await page.keyboard.press('Enter');
    await expectTabCount(page, null, EXAMPLE_COUNT);
    expect(await focusedControl(page)).not.toBe('the page');
  });

  test('removing a row from the list moves focus to the row that takes its place', async ({ page }) => {
    test.fixme(true, 'After a link is removed from the list, focus jumps up to the shelf tabs instead of the row that moved into its place.');
    await openApp(page);
    await showList(page);
    const third = listRows(page).nth(2);
    const followingId = await listRows(page).nth(3).getAttribute('data-id');
    await third.getByRole('button', { name: /^Edit / }).focus();
    await page.keyboard.press('Enter');
    await editorOf(page).getByRole('button', { name: 'Remove link' }).click();
    await expect(editorOf(page)).toBeHidden();
    await expect(listRows(page)).toHaveCount(EXAMPLE_COUNT - 1);

    await expect(listRows(page).nth(2)).toHaveAttribute('data-id', followingId as string);
    expect(await listRows(page).nth(2).evaluate((row) => row.contains(document.activeElement))).toBe(true);
  });

  test('removing the last link of a shelf moves focus to the way forward', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'New shelf' }).click();
    const prompt = page.getByRole('dialog', { name: 'New shelf' });
    await prompt.getByLabel('Name').fill('One link only');
    await page.keyboard.press('Enter');
    await expect(prompt).toBeHidden();
    await stageOf(page).getByRole('button', { name: 'Add a link to One link only' }).click();
    await editorOf(page).getByRole('textbox', { name: 'Link (required)' }).fill('https://example.org/the-only-one');
    await page.keyboard.press('Enter');
    await expect(editorOf(page)).toBeHidden();
    await expect(captionTitle(page)).toHaveText(/\S/);
    await expectSettled(page);

    await editAction(page).focus();
    await page.keyboard.press('Enter');
    await editorOf(page).getByRole('button', { name: 'Remove link' }).click();
    await expect(editorOf(page)).toBeHidden();
    await expect(stageOf(page).getByRole('heading', { name: 'Nothing on One link only yet.' })).toBeVisible();
    await expect(stageOf(page).getByRole('button', { name: 'Add a link to One link only' })).toBeFocused();
  });

  test('a menu opens on the choice in use, the arrow keys only move, and Escape gives focus back to its button', async ({ page }) => {
    await openApp(page);
    await viewButton(page).focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu', { name: 'View' });
    await expect(menu).toBeVisible();
    const inUse = page.getByRole('group', { name: 'View' }).getByRole('menuitemradio', { checked: true });
    await expect(inUse).toHaveText('Shelf');
    await expect(inUse).toBeFocused();

    // Passing over a look does not put it on.
    for (const name of ['List', 'Paper Row', 'Oak Library', 'Night Study']) {
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('menuitemradio', { name, exact: true })).toBeFocused();
    }
    await expect(shelfOf(page)).toHaveAttribute('data-variant', 'paper');
    await expect(shelfOf(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(viewButton(page)).toBeFocused();
    await expect(viewButton(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('the view in use keeps its plain name in the menu', async ({ page }) => {
    test.fixme(true, 'The tick drawn beside the chosen view is read out as part of its name ("check mark Shelf"), so the name changes with the choice.');
    await openApp(page);
    await viewButton(page).click();
    await expect(page.getByRole('group', { name: 'View' }).getByRole('menuitemradio', { checked: true })).toHaveAccessibleName('Shelf');
  });

  test('a press somewhere else closes an open menu', async ({ page }) => {
    await openApp(page);
    await viewButton(page).focus();
    const menu = page.getByRole('menu', { name: 'View' });
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    // The corner of the bar: on the page, on no control, and not under the menu on any screen.
    await page.mouse.click(4, 4);
    await expect(menu).toBeHidden();
    await expect(viewButton(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('a stray click beside the dialog does not throw away what was typed without asking', async ({ page }) => {
    await openApp(page);
    await addButton(page).click();
    const editor = editorOf(page);
    await editor.getByRole('textbox', { name: 'Text to read (optional)' }).fill('Three paragraphs I just pasted.');
    // The corner of the window is outside the dialog, on the dimmed page behind it.
    await page.mouse.click(3, 3);

    const question = page.getByRole('dialog', { name: 'Discard what you typed?' });
    await expect(question).toBeVisible();
    await expect(question.getByRole('button', { name: 'Keep editing' })).toBeFocused();
    await question.getByRole('button', { name: 'Keep editing' }).click();
    await expect(question).toBeHidden();
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('textbox', { name: 'Text to read (optional)' })).toHaveValue('Three paragraphs I just pasted.');
  });
});

test.describe('the reader, Escape and Back', () => {
  test('Escape pressed straight after Enter closes the reader before it has opened, and focus is back on the volume', async ({ page }) => {
    await openApp(page);
    await centredControl(page).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expectReaderGone(page);
    await expect(centredControl(page)).toBeFocused();
    await expect(shelfOf(page)).toHaveAttribute('data-focus-id', FIRST_EXAMPLE.id);
  });

  test('focus is inside the reader as soon as it exists, and comes back to whatever opened it', async ({ page }) => {
    await openApp(page);
    const read = stageOf(page).getByRole('button', { name: 'Read', exact: true });
    await read.focus();
    await page.keyboard.press('Enter');
    await expect(readerOf(page)).toHaveCount(1);
    expect(await readerOf(page).evaluate((reader) => reader.contains(document.activeElement)), 'focus is in the reader while it opens').toBe(true);
    await expectReaderOpen(page);
    await expect(closeReaderButton(page)).toBeFocused();

    await page.keyboard.press('Escape');
    await expectReaderGone(page);
    await expect(read).toBeFocused();
  });

  test('the browser Back button closes the reader instead of leaving the app, and Forward opens it again', async ({ page }) => {
    await openApp(page);
    const address = page.url();
    await centredControl(page).focus();
    await page.keyboard.press('Enter');
    await expectReaderOpen(page);
    await expect(readerTitle(page)).toHaveText(FIRST_EXAMPLE.title);

    await page.goBack();
    await expectReaderGone(page);
    expect(page.url()).toBe(address);
    await expect(captionTitle(page)).toHaveText(FIRST_EXAMPLE.title);
    await expect(centredControl(page)).toBeFocused();

    await page.goForward();
    await expectReaderOpen(page);
    await expect(readerTitle(page)).toHaveText(FIRST_EXAMPLE.title);
    expect(page.url()).toBe(address);
  });

  test('closing in the page takes back the history entry, so Back is not needed twice', async ({ page }) => {
    await page.goto('/index.html');
    await openApp(page);
    for (let round = 0; round < 2; round++) {
      await centredControl(page).focus();
      await page.keyboard.press('Enter');
      await expectReaderOpen(page);
      await page.keyboard.press('Escape');
      await expectReaderGone(page);
    }
    // One step back from the app is the page before it, not a reader that was already closed.
    await page.goBack();
    await expect(page).toHaveURL(/\/index\.html$/);
  });

  test('a reader restored after a reload still closes with Back', async ({ page }) => {
    await openApp(page);
    await centredControl(page).focus();
    await page.keyboard.press('Enter');
    await expectReaderOpen(page);
    await page.reload();
    await expectReaderOpen(page);

    await page.goBack();
    await expectReaderGone(page);
    await expect(page).toHaveURL(/\/app\.html$/);
  });

  test('the page title names the open link, or else the open shelf', async ({ page }) => {
    await openApp(page);
    await expect(page).toHaveTitle('All links | Bookmark Bookshelf');
    await expect(page.getByRole('main', { name: 'All links' })).toBeVisible();

    await openShelf(page, READING.id);
    await expect(page).toHaveTitle(`${READING.name} | Bookmark Bookshelf`);
    await expect(page.getByRole('main', { name: READING.name })).toBeVisible();

    await centredControl(page).focus();
    await page.keyboard.press('Enter');
    await expectReaderOpen(page);
    await expect(page).toHaveTitle(`${LONG_EXAMPLE.title} | Bookmark Bookshelf`);

    await page.keyboard.press('Escape');
    await expectReaderGone(page);
    await expect(page).toHaveTitle(`${READING.name} | Bookmark Bookshelf`);
  });

  test('an address that names a link opens it, on its own shelf', async ({ page, context }) => {
    await openApp(page);
    await openShelf(page, LOOKUPS.id);
    const bookmark = await addLink(page, { url: 'https://example.org/named-in-the-address', title: 'Named in the address', readingText: makeParagraphs(12) });

    const tab = await context.newPage();
    await tab.goto(`/app.html#link=${bookmark.id}`);
    await expectReaderOpen(tab);
    await expect(readerTitle(tab)).toHaveText('Named in the address');
    expect(new URL(tab.url()).hash).toBe('');

    await tab.keyboard.press('Escape');
    await expectReaderGone(tab);
    await expect(shelfOf(tab)).toHaveAttribute('data-focus-id', bookmark.id);
    await expect(shelfTab(tab, LOOKUPS.id)).toHaveAttribute('aria-pressed', 'true');
  });
});

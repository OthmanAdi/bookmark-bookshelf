import {
  EXAMPLE_COUNT,
  FIRST_EXAMPLE,
  HOMEWORK,
  LOOKUPS,
  READING,
  addLink,
  captionTitle,
  chooseInLibraryMenu,
  editCentred,
  editorOf,
  expect,
  expectReaderOpen,
  expectSettled,
  expectTabCount,
  focusedControl,
  libraryButton,
  openApp,
  openCentredWithKeyboard,
  openShelf,
  primaryAction,
  readLibrary,
  readerOf,
  reloadApp,
  shelfOf,
  shelfTab,
  stageOf,
  storedLibrary,
  test,
  toastsOf,
} from './fixtures';

const EXAMPLES_SENTENCE = `These ${EXAMPLE_COUNT} links are examples. Add your own, or remove the examples.`;

test.describe('the examples', () => {
  test('a first visit shows three shelves of unread examples and says that they are examples', async ({ page }) => {
    await openApp(page);
    await expect(page.getByText(EXAMPLES_SENTENCE)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove examples' })).toBeVisible();

    await expectTabCount(page, null, EXAMPLE_COUNT);
    for (const shelf of [HOMEWORK, READING, LOOKUPS]) {
      await expect(shelfTab(page, shelf.id)).toHaveAccessibleName(shelf.name);
      await expectTabCount(page, shelf.id, shelf.count);
    }
    // Nothing has been read for the person: no invented history.
    await expect(captionTitle(page)).toHaveText(FIRST_EXAMPLE.title);
    await expect(primaryAction(page)).toHaveText('Read');
    expect(await storedLibrary(page), 'nothing is written before the person changes something').toBeNull();

    // With one shelf open the line makes room for what that shelf has to say.
    await openShelf(page, HOMEWORK.id);
    await expect(page.getByText(EXAMPLES_SENTENCE)).toBeHidden();
    await expect(page.getByText('Nothing read yet.')).toBeVisible();
  });

  test('an example text is marked as written for the app', async ({ page }) => {
    await openApp(page);
    await openCentredWithKeyboard(page);
    await expectReaderOpen(page);
    await expect(readerOf(page).getByText('Example text written for this app. It is not the linked page.')).toBeVisible();
  });

  test('"Remove examples" empties the library in one step, and Undo brings everything back', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Remove examples' }).click();

    const toasts = toastsOf(page);
    await expect(toasts).toContainText(`Removed ${EXAMPLE_COUNT} example links.`);
    await expect(page.getByText(EXAMPLES_SENTENCE)).toBeHidden();
    await expectTabCount(page, null, 0);
    await expect(shelfOf(page)).toHaveAttribute('data-empty', '1');
    const stage = stageOf(page);
    await expect(stage.getByRole('heading', { name: 'Nothing on your shelves yet.' })).toBeVisible();
    await expect(stage.getByRole('button', { name: 'Add a link', exact: true })).toBeVisible();
    await expect(stage.getByRole('button', { name: 'Bring links in' })).toBeVisible();
    // The line that held the button is gone; focus is on a control that stayed.
    expect(await focusedControl(page)).not.toBe('the page');

    const emptied = await readLibrary(page);
    expect(emptied.bookmarks).toEqual([]);
    // A library always keeps one shelf to file the next link on.
    expect(emptied.shelves.map((shelf) => shelf.name)).toEqual([READING.name]);

    await toasts.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText(EXAMPLES_SENTENCE)).toBeVisible();
    await expectTabCount(page, null, EXAMPLE_COUNT);
    await expect(shelfOf(page)).toHaveAttribute('data-empty', '0');
    await expectSettled(page);
    const restored = await readLibrary(page);
    expect(restored.bookmarks).toHaveLength(EXAMPLE_COUNT);
    expect(restored.shelves.sort((a, b) => a.order - b.order).map((shelf) => shelf.id)).toEqual([HOMEWORK.id, READING.id, LOOKUPS.id]);
    expect(restored.progress).toEqual({});
    expect(restored.done).toEqual({});
    await expect(captionTitle(page)).toHaveText(/\S/);
  });

  test('removing the examples leaves the links a person added, and the shelf they are on', async ({ page }) => {
    await openApp(page);
    const own = await addLink(page, { url: 'https://example.org/my-own', title: 'My own link', shelfId: LOOKUPS.id });
    await expect(page.getByText(EXAMPLES_SENTENCE)).toBeVisible();

    await chooseInLibraryMenu(page, 'Remove examples');
    await expect(toastsOf(page)).toContainText(`Removed ${EXAMPLE_COUNT} example links.`);
    await expectTabCount(page, null, 1);
    await expect(shelfTab(page, LOOKUPS.id)).toBeVisible();
    await expectTabCount(page, LOOKUPS.id, 1);
    await expect(shelfTab(page, HOMEWORK.id)).toHaveCount(0);
    await expect(shelfTab(page, READING.id)).toHaveCount(0);
    await expect(captionTitle(page)).toHaveText('My own link');
    expect((await readLibrary(page)).bookmarks.map((entry) => entry.id)).toEqual([own.id]);

    // With no example left the Library menu no longer offers to remove them, also after a reload.
    await reloadApp(page);
    await expect(page.getByText(/are examples|is an example/)).toBeHidden();
    await libraryButton(page).click();
    await expect(page.locator('#library-menu').getByRole('button', { name: 'Bring links in' })).toBeVisible();
    await expect(page.locator('#library-menu').getByRole('button', { name: 'Remove examples' })).toBeHidden();
  });

  test('the line counts the examples that are left', async ({ page }) => {
    await openApp(page);
    await editCentred(page);
    await editorOf(page).getByRole('button', { name: 'Remove link' }).click();
    await expect(page.getByText(`These ${EXAMPLE_COUNT - 1} links are examples. Add your own, or remove the examples.`)).toBeVisible();
  });

  test('a link sent to an empty browser starts a library of its own, without the examples', async ({ page }) => {
    await page.goto('/app.html#add=https%3A%2F%2Fexample.org%2Fsent-page&title=A%20page%20sent%20here&text=A%20few%20selected%20words.');
    const editor = editorOf(page);
    await expect(editor).toBeVisible();
    // The app offers the link; it never saves by itself.
    await expect(editor.getByRole('textbox', { name: 'Link (required)' })).toHaveValue('https://example.org/sent-page');
    await expect(editor.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('A page sent here');
    await expect(editor.getByRole('textbox', { name: 'Text to read (optional)' })).toHaveValue('A few selected words.');
    expect(new URL(page.url()).hash).toBe('');
    await expectTabCount(page, null, 0);
    await expect(page.getByText(/are examples|is an example/)).toBeHidden();

    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editor).toBeHidden();
    await expectTabCount(page, null, 1);
    await expect(captionTitle(page)).toHaveText('A page sent here');
    expect((await readLibrary(page)).bookmarks.map((entry) => entry.url)).toEqual(['https://example.org/sent-page']);
  });
});

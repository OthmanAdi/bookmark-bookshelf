import {
  EXAMPLE_COUNT,
  FIRST_EXAMPLE,
  HOMEWORK,
  LONG_EXAMPLE,
  LOOKUPS,
  READING,
  addButton,
  addLink,
  captionTitle,
  centredControl,
  editCentred,
  editorOf,
  expect,
  expectCentred,
  expectSettled,
  expectTabCount,
  fillEditor,
  findStored,
  focusId,
  openApp,
  openShelf,
  originalLink,
  readLibrary,
  reloadApp,
  saveEditor,
  shelfOf,
  shelfTab,
  stageOf,
  test,
  toastsOf,
} from './fixtures';

test.describe('add, edit and organise', () => {
  test('an address that is not a web address is refused under its field and adds nothing', async ({ page }) => {
    await openApp(page);
    await addButton(page).click();
    const editor = editorOf(page);
    const link = editor.getByRole('textbox', { name: 'Link (required)' });

    for (const refused of ['javascript:alert(1)', 'read this later']) {
      await fillEditor(page, { url: refused, title: 'Should not exist' });
      await editor.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(link).toHaveAttribute('aria-invalid', 'true');
      await expect(link).toHaveAccessibleDescription(/\S/);
      await expect(link).toBeFocused();
      await expect(editor).toBeVisible();
    }

    await editor.getByRole('button', { name: 'Cancel' }).click();
    await expect(editor).toBeHidden();
    await expectTabCount(page, null, EXAMPLE_COUNT);
    await expect(page.locator('.bb-book__control[aria-label^="Should not exist"]')).toHaveCount(0);
    await expect(shelfOf(page)).toHaveAttribute('data-focus-id', FIRST_EXAMPLE.id);
  });

  test('the dialog leads with five fields and keeps cover, author and tags folded away until a link is edited', async ({ page }) => {
    await openApp(page);
    await addButton(page).click();
    const editor = editorOf(page);
    await expect(editor.getByRole('heading', { name: 'Add a link' })).toBeVisible();
    for (const name of ['Link (required)', 'Title', 'Why you saved it', 'Text to read (optional)']) {
      await expect(editor.getByRole('textbox', { name, exact: true })).toBeVisible();
    }
    await expect(editor.getByRole('combobox', { name: 'Shelf' })).toBeVisible();
    await expect(editor.getByRole('group').getByText('Cover, author and tags')).toBeVisible();
    await expect(editor.getByLabel('Author')).toBeHidden();
    await expect(editor.getByRole('button', { name: 'Save', exact: true })).toBeInViewport();
    await editor.getByRole('button', { name: 'Cancel' }).click();
    await expect(editor).toBeHidden();

    await editCentred(page);
    await expect(editor.getByRole('heading', { name: 'Edit link' })).toBeVisible();
    await expect(editor.getByLabel('Author')).toBeVisible();
    await expect(editor.getByLabel('Tags, separated by commas')).toHaveValue('urls, basics');
  });

  test('an address without a scheme gets https, and tracking parameters are dropped on save', async ({ page }) => {
    await openApp(page);
    await addButton(page).click();
    await fillEditor(page, { url: 'example.org/essay?utm_source=newsletter&page=2&fbclid=abc', title: 'A tidy address' });
    await saveEditor(page);
    const bookmark = await findStored(page, 'A tidy address');
    expect(bookmark.url).toBe('https://example.org/essay?page=2');
    await expectCentred(page, bookmark.id);
    await expect(originalLink(page)).toHaveAttribute('href', 'https://example.org/essay?page=2');
  });

  test('an address that is already saved says where it is and can show it', async ({ page }) => {
    await openApp(page);
    await addButton(page).click();
    const editor = editorOf(page);
    const link = editor.getByRole('textbox', { name: 'Link (required)' });
    await link.fill('https://en.wikipedia.org/wiki/Commonplace_book');
    await expect(editor.getByText(`Already on ${READING.name}.`)).toBeVisible();

    await editor.getByRole('button', { name: 'Show it' }).click();
    await expect(editor).toBeHidden();
    await expectCentred(page, LONG_EXAMPLE.id);
    await expect(captionTitle(page)).toHaveText(LONG_EXAMPLE.title);
    await expectTabCount(page, null, EXAMPLE_COUNT);
  });

  test('"Save and add another" keeps the dialog open for the next link', async ({ page }) => {
    await openApp(page);
    await addButton(page).click();
    const editor = editorOf(page);
    await fillEditor(page, { url: 'https://example.org/first-of-two', title: 'First of two' });
    await editor.getByRole('button', { name: 'Save and add another' }).click();

    await expect(editor.getByText('Saved. Add the next link.')).toBeVisible();
    const link = editor.getByRole('textbox', { name: 'Link (required)' });
    await expect(link).toHaveValue('');
    await expect(link).toBeFocused();
    await expectTabCount(page, null, EXAMPLE_COUNT + 1);

    await fillEditor(page, { url: 'https://example.org/second-of-two', title: 'Second of two' });
    await saveEditor(page);
    await expectTabCount(page, null, EXAMPLE_COUNT + 2);
    await expect(captionTitle(page)).toHaveText('Second of two');
  });

  test('editing a link changes its title on the spine and in the caption', async ({ page }) => {
    await openApp(page);
    await editCentred(page);
    await editorOf(page).getByRole('textbox', { name: 'Title', exact: true }).fill('A Renamed Volume');
    await saveEditor(page);

    await expect(captionTitle(page)).toHaveText('A Renamed Volume');
    await expectSettled(page);
    await expect(page.locator('.bb-book.is-centre .bb-spine__title')).toHaveText('A Renamed Volume');
    await expect(centredControl(page)).toHaveAccessibleName(/^A Renamed Volume\./);
    await expect(originalLink(page)).toHaveAccessibleDescription('A Renamed Volume');
  });

  test('removing a link shows an Undo toast and Undo restores it', async ({ page }) => {
    await openApp(page);
    await editCentred(page);
    await editorOf(page).getByRole('button', { name: 'Remove link' }).click();

    const toasts = toastsOf(page);
    await expect(toasts).toContainText(`Removed ${FIRST_EXAMPLE.title}.`);
    await expectTabCount(page, null, EXAMPLE_COUNT - 1);
    expect((await readLibrary(page)).bookmarks).toHaveLength(EXAMPLE_COUNT - 1);
    await expect(shelfOf(page)).not.toHaveAttribute('data-focus-id', FIRST_EXAMPLE.id);

    await toasts.getByRole('button', { name: 'Undo' }).click();
    await expect(toasts).toBeEmpty();
    await expectTabCount(page, null, EXAMPLE_COUNT);
    const restored = (await readLibrary(page)).bookmarks.find((entry) => entry.id === FIRST_EXAMPLE.id);
    expect(restored?.title).toBe(FIRST_EXAMPLE.title);
  });

  test('a new shelf starts empty, says what it is for, and can receive a link', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'New shelf' }).click();
    const prompt = page.getByRole('dialog', { name: 'New shelf' });
    await expect(prompt).toBeVisible();
    await prompt.getByLabel('Name').fill('Night reads');
    await prompt.getByRole('button', { name: 'Save' }).click();
    await expect(prompt).toBeHidden();

    const newTab = page.locator('#tabs').getByRole('button', { name: 'Night reads' });
    await expect(newTab).toHaveAttribute('aria-pressed', 'true');
    await expect(shelfOf(page)).toHaveAttribute('data-empty', '1');
    const stage = stageOf(page);
    await expect(stage.getByRole('heading', { name: 'Nothing on Night reads yet.' })).toBeVisible();
    await expect(stage.getByText('Links you add while this shelf is open are filed here.')).toBeVisible();
    await expect(stage.getByRole('button', { name: 'Add a link to Night reads' })).toBeVisible();
    await expect(stage.getByRole('button', { name: 'Bring links in' })).toBeVisible();

    // Back on "All", move the centred link to the new shelf through the edit dialog.
    await openShelf(page);
    await expect(shelfOf(page)).toHaveAttribute('data-empty', '0');
    await expect(captionTitle(page)).toHaveText(/\S/);
    const moved = await focusId(page);
    const movedTitle = (await captionTitle(page).textContent()) ?? '';
    await editCentred(page);
    await editorOf(page).getByRole('combobox', { name: 'Shelf' }).selectOption({ label: 'Night reads' });
    await saveEditor(page);
    await expect(newTab).toHaveAccessibleDescription('1 link');

    await newTab.click();
    await expect(newTab).toHaveAttribute('aria-pressed', 'true');
    await expectCentred(page, moved);
    await expect(page.locator('.bb-book__control')).toHaveCount(1);
    await expect(captionTitle(page)).toHaveText(movedTitle);

    await reloadApp(page);
    await expect(page.locator('#tabs').getByRole('button', { name: 'Night reads' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.bb-book__control')).toHaveCount(1);
  });

  test('move later and earlier reorder a link inside its shelf, and the order survives a reload', async ({ page }) => {
    await openApp(page);
    const stage = stageOf(page);
    const earlier = stage.getByRole('button', { name: 'Move earlier' });
    const later = stage.getByRole('button', { name: 'Move later' });
    // With every shelf in view there is no single order to change.
    await expect(later).toBeHidden();

    await openShelf(page, HOMEWORK.id);
    await expectCentred(page, FIRST_EXAMPLE.id);
    await expect(earlier).toHaveAttribute('aria-disabled', 'true');

    await later.click();
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '1');
    await expectCentred(page, FIRST_EXAMPLE.id);
    await later.click();
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '2');
    await expectCentred(page, FIRST_EXAMPLE.id);
    await earlier.click();
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '1');
    await expectCentred(page, FIRST_EXAMPLE.id);

    const order = async (): Promise<string[]> =>
      (await readLibrary(page)).bookmarks
        .filter((entry) => entry.shelfId === HOMEWORK.id)
        .sort((a, b) => a.order - b.order)
        .map((entry) => entry.id);
    expect((await order()).indexOf(FIRST_EXAMPLE.id)).toBe(1);

    await reloadApp(page);
    await expect(shelfTab(page, HOMEWORK.id)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(`.bb-book[data-id="${FIRST_EXAMPLE.id}"]`).first()).toHaveAttribute('data-index', '1');
    expect((await order()).indexOf(FIRST_EXAMPLE.id)).toBe(1);
  });

  test('a link added while one shelf is open lands on that shelf and is centred', async ({ page }) => {
    await openApp(page);
    await openShelf(page, LOOKUPS.id);
    const bookmark = await addLink(page, { url: 'https://example.org/lookup-note', title: 'A lookup note' });
    expect(bookmark.shelfId).toBe(LOOKUPS.id);
    await expectTabCount(page, LOOKUPS.id, LOOKUPS.count + 1);
    await expect(shelfTab(page, LOOKUPS.id)).toHaveAttribute('aria-pressed', 'true');
    await expect(captionTitle(page)).toHaveText('A lookup note');
  });
});

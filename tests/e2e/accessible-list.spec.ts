import {
  EXAMPLE_COUNT,
  LINK_ONLY_EXAMPLE,
  LONG_EXAMPLE,
  chosenView,
  closeReaderButton,
  expect,
  expectReaderGone,
  expectReaderOpen,
  listOf,
  listRowFor,
  listRows,
  openApp,
  readerTitle,
  reloadApp,
  rowTitle,
  shelfOf,
  showList,
  showShelf,
  test,
} from './fixtures';

test.describe('the list, a full alternative to the row', () => {
  test('the View menu shows 15 rows, each with a title that opens it, its state in words and a safe link to the original', async ({
    page,
  }) => {
    await openApp(page);
    expect(await chosenView(page)).toBe('Shelf');

    await showList(page);
    expect(await chosenView(page)).toBe('List');
    await expect(shelfOf(page)).toBeHidden();

    const rows = listRows(page);
    await expect(rows).toHaveCount(EXAMPLE_COUNT);
    for (const row of await rows.all()) {
      // The title names the link and says what activating it does.
      await expect(rowTitle(row)).toHaveAccessibleName(/\. (Read|Add text)$/);
      await expect(row.getByText(/^(Not started|No text saved yet)/)).toBeVisible();
      await expect(row.getByRole('button', { name: /^Edit / })).toHaveCount(1);
      const original = row.getByRole('link', { name: /open the original of .+ in a new tab$/ });
      await expect(original).toHaveCount(1);
      await expect(original).toHaveAttribute('target', '_blank');
      await expect(original).toHaveAttribute('rel', /noopener/);
      await expect(original).toHaveAttribute('rel', /noreferrer/);
    }
    await expect(rowTitle(listRowFor(page, LONG_EXAMPLE.id))).toHaveAccessibleName(`${LONG_EXAMPLE.title}. Read`);
    await expect(rowTitle(listRowFor(page, LINK_ONLY_EXAMPLE.id))).toHaveAccessibleName(`${LINK_ONLY_EXAMPLE.title}. Add text`);

    // Every link that leaves the app is safe, not only the ones inside rows.
    const unsafe = await listOf(page)
      .locator('a[target="_blank"]')
      .evaluateAll((links) => links.filter((link) => !/noopener/.test(link.getAttribute('rel') ?? '') || !/noreferrer/.test(link.getAttribute('rel') ?? '')).length);
    expect(unsafe).toBe(0);
  });

  test('a row takes two tab stops: its title, then one group of actions', async ({ page }) => {
    await openApp(page);
    await showList(page);
    const first = listRows(page).nth(0);
    const second = listRows(page).nth(1);

    await rowTitle(first).focus();
    await page.keyboard.press('Tab');
    await expect(first.getByRole('toolbar').locator(':focus')).toHaveCount(1);
    // Arrow keys walk the group, so it stays one stop.
    await page.keyboard.press('ArrowRight');
    await expect(first.getByRole('button', { name: /^Edit / })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(rowTitle(second)).toBeFocused();
  });

  test('activating a title with the keyboard opens the reader, Escape closes it and focus is back on that title', async ({ page }) => {
    await openApp(page);
    await showList(page);
    const title = rowTitle(listRowFor(page, LONG_EXAMPLE.id));
    await title.focus();
    await page.keyboard.press('Enter');

    await expectReaderOpen(page);
    await expect(readerTitle(page)).toHaveText(LONG_EXAMPLE.title);
    await expect(closeReaderButton(page)).toBeFocused();

    await page.keyboard.press('Escape');
    await expectReaderGone(page);
    await expect(listOf(page)).toBeVisible();
    await expect(listRows(page)).toHaveCount(EXAMPLE_COUNT);
    await expect(title).toBeFocused();
  });

  test('the list choice survives a reload', async ({ page }) => {
    await openApp(page);
    await showList(page);

    await page.reload();
    await expect(listOf(page)).toBeVisible();
    await expect(listRows(page)).toHaveCount(EXAMPLE_COUNT);
    expect(await chosenView(page)).toBe('List');

    await showShelf(page);
    await reloadApp(page);
    await expect(listOf(page)).toBeHidden();
    expect(await chosenView(page)).toBe('Shelf');
  });
});

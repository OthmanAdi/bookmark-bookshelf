import {
  centreOf,
  centredControl,
  closeReaderButton,
  closeReaderByButton,
  expect,
  expectSettled,
  focusIndex,
  mouseDrag,
  pasteField,
  readerBody,
  readerOf,
  readerTitle,
  readout,
  sheetOf,
  shelfOf,
  test,
} from './fixtures';

test.describe('the parts on their own', () => {
  test('shelf-only has a working shelf and never creates a reader', async ({ page }) => {
    // Narrow enough that the twelve volumes are more than the row can show at once, so it can be dragged.
    await page.setViewportSize({ width: 412, height: 780 });
    await page.goto('/examples/shelf-only.html');
    await expect(shelfOf(page)).toBeVisible();
    await expectSettled(page);
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '0');

    // Keyboard step.
    await centredControl(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '1');
    await expectSettled(page);
    await expect(centredControl(page)).toBeFocused();

    // Mouse drag.
    const scene = await centreOf(page.locator('.bb-shelf__scene'));
    const reach = Math.min(220, scene.x * 0.7);
    await mouseDrag(page, { x: scene.x + reach, y: scene.y }, -2 * reach);
    await expect.poll(() => focusIndex(page)).not.toBe(1);
    await expectSettled(page);

    // Picking the centred volume only reports it.
    await centredControl(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toContainText('Picked:');
    await expect(readerOf(page)).toHaveCount(0);
    await expect(shelfOf(page)).toHaveAttribute('data-open', '0');
  });

  test('shelf-only offers the four looks and keeps the centred volume when the look changes', async ({ page }) => {
    await page.goto('/examples/shelf-only.html');
    await expectSettled(page);
    await centredControl(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '1');
    await expectSettled(page);

    const look = page.getByRole('combobox', { name: 'Look' });
    await expect(look.getByRole('option')).toHaveText(['Paper Row', 'Oak Library', 'Night Study', 'Pocket Paperbacks']);
    for (const name of ['oak', 'night', 'pocket', 'paper']) {
      await look.selectOption(name);
      await expect(shelfOf(page)).toHaveAttribute('data-variant', name);
      await expect(page.locator('html')).toHaveAttribute('data-variant', name);
      await expect(shelfOf(page)).toHaveAttribute('data-focus', '1');
      await expectSettled(page);
    }
  });

  test('reader-only has a working reader that resumes after a reload and no shelf', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 420 });
    await page.goto('/examples/reader-only.html');
    await expect(shelfOf(page)).toHaveCount(0);
    await expect(readerOf(page)).toHaveCount(0);

    const opener = page.getByRole('button', { name: 'Read the example text' });
    await opener.click();
    await expect(readerOf(page)).toHaveAttribute('data-open', '1');
    await expect(closeReaderButton(page)).toBeFocused();
    await expect(readerTitle(page)).toHaveText('Why read slowly');
    await expect(readerBody(page).getByRole('heading', { level: 2 })).toHaveCount(1);
    await expect(readerBody(page).getByRole('listitem')).toHaveCount(4);

    const reached = await sheetOf(page).evaluate((sheet) => {
      sheet.scrollTop = sheet.scrollHeight;
      return sheet.scrollTop;
    });
    expect(reached).toBeGreaterThan(100);
    await expect(readout(page)).not.toHaveText('0% read');
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('bookmark-bookshelf:example:reader-only')))
      .toContain('"percent":1');

    await page.reload();
    await expect(readerOf(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Read the example text' }).click();
    await expect(readerOf(page)).toHaveAttribute('data-open', '1');
    await expect
      .poll(async () => Math.abs((await sheetOf(page).evaluate((sheet) => sheet.scrollTop)) - reached))
      .toBeLessThanOrEqual(80);

    // Closing removes the reader and returns focus to the button.
    await closeReaderByButton(page);
    await expect(page.getByRole('button', { name: 'Read the example text' })).toBeFocused();
    await expect(shelfOf(page)).toHaveCount(0);
  });

  test('reader-only shows the field for a link with no text, and a saved text replaces it in memory', async ({ page }) => {
    await page.goto('/examples/reader-only.html');
    await page.getByRole('button', { name: 'Open a link with no text' }).click();
    await expect(readerOf(page)).toHaveAttribute('data-open', '1');
    await expect(readerBody(page).getByRole('heading', { name: 'No text saved yet' })).toBeVisible();
    await expect(pasteField(page)).toBeVisible();
    // The field is already open, so there is nothing for an edit button to open.
    await expect(readerOf(page).getByRole('button', { name: 'Edit text' })).toHaveCount(0);

    await pasteField(page).fill('Just one pasted line.');
    await readerOf(page).getByRole('button', { name: 'Save text' }).click();
    await expect(readerBody(page).getByRole('paragraph')).toHaveText('Just one pasted line.');
    await expect(readerBody(page).getByRole('heading', { name: 'No text saved yet' })).toHaveCount(0);
    await expect(readerOf(page).getByRole('button', { name: 'Edit text' })).toBeVisible();

    // Close and open again: the text is still there, but only in memory.
    await closeReaderByButton(page);
    await page.getByRole('button', { name: 'Open a link with no text' }).click();
    await expect(readerBody(page).getByRole('paragraph')).toHaveText('Just one pasted line.');
    await expect(shelfOf(page)).toHaveCount(0);
  });

  test('store-only adds a link, refuses a javascript: address, shows the library and has no shelf or reader', async ({ page }) => {
    await page.goto('/examples/store-only.html');
    await expect(shelfOf(page)).toHaveCount(0);
    await expect(readerOf(page)).toHaveCount(0);
    const rows = page.getByRole('list', { name: 'Links' }).getByRole('listitem');
    const library = page.locator('#json');
    const link = page.getByRole('textbox', { name: 'Link', exact: true });
    await expect(rows).toHaveCount(0);

    await link.fill('https://example.org/store-example');
    await page.getByRole('textbox', { name: 'Title (optional)' }).fill('Store example');
    await page.getByRole('button', { name: 'Add a link' }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText('Store example');
    await expect(rows).toContainText('https://example.org/store-example');
    await expect(library).toContainText('"title": "Store example"');
    await expect(page.getByRole('alert')).toBeHidden();

    await link.fill('javascript:alert(1)');
    await page.getByRole('button', { name: 'Add a link' }).click();
    await expect(page.getByRole('alert')).toHaveText(/\S/);
    await expect(rows).toHaveCount(1);
    await expect(library).not.toContainText('javascript:');

    await page.getByRole('button', { name: 'Remove the last link' }).click();
    await expect(rows).toHaveCount(0);
    await expect(library).not.toContainText('Store example');
    await expect(shelfOf(page)).toHaveCount(0);
    await expect(readerOf(page)).toHaveCount(0);
  });
});

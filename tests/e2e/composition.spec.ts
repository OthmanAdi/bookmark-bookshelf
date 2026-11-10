import {
  centreOf,
  centredControl,
  closeReaderByButton,
  expect,
  expectSettled,
  focusIndex,
  mouseDrag,
  shelfOf,
  test,
} from './fixtures';

test.describe('selective composition', () => {
  test('shelf-only has a working shelf and never creates a reader', async ({ page }) => {
    await page.goto('/examples/shelf-only.html');
    await expect(shelfOf(page)).toBeVisible();
    await expectSettled(page);
    await expect(page.locator('.bb-book__control')).toHaveCount(12);

    // Keyboard step.
    await centredControl(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '1');
    await expectSettled(page);

    // Mouse drag.
    const scene = await centreOf(page.locator('.bb-shelf__scene'));
    const reach = Math.min(220, scene.x * 0.7);
    await mouseDrag(page, { x: scene.x + reach, y: scene.y }, -2 * reach);
    await expect.poll(() => focusIndex(page)).not.toBe(1);
    await expectSettled(page);

    // Picking the centred volume only reports it.
    await centredControl(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#log')).toContainText('Picked:');
    await expect(page.locator('.bb-reader')).toHaveCount(0);
    await expect(shelfOf(page)).toHaveAttribute('data-open', '0');
  });

  test('reader-only has a working reader that resumes after a reload and no shelf', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 420 });
    await page.goto('/examples/reader-only.html');
    await expect(page.locator('.bb-shelf')).toHaveCount(0);
    await expect(page.locator('.bb-reader')).toHaveCount(0);

    const opener = page.getByRole('button', { name: 'Open the reader' });
    await opener.click();
    await expect(page.locator('.bb-reader')).toHaveAttribute('data-open', '1');
    await expect(page.locator('.bb-reader__close')).toBeFocused();
    await expect(page.locator('.bb-reader__title')).toHaveText('Why read slowly');
    await expect(page.locator('.bb-reader__body h2')).toHaveCount(1);
    await expect(page.locator('.bb-reader__body li')).toHaveCount(4);

    const reached = await page.locator('.bb-reader__sheet').evaluate((sheet) => {
      sheet.scrollTop = sheet.scrollHeight;
      return sheet.scrollTop;
    });
    expect(reached).toBeGreaterThan(100);
    await expect(page.locator('.bb-reader__readout')).not.toHaveText('0% read');
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('bookmark-bookshelf:example:reader-only')))
      .toContain('"percent":1');

    await page.reload();
    await expect(page.locator('.bb-reader')).toHaveCount(0);
    await page.getByRole('button', { name: 'Open the reader' }).click();
    await expect(page.locator('.bb-reader')).toHaveAttribute('data-open', '1');
    await expect
      .poll(async () => Math.abs((await page.locator('.bb-reader__sheet').evaluate((sheet) => sheet.scrollTop)) - reached))
      .toBeLessThanOrEqual(80);

    // Closing destroys the reader and returns focus to the button.
    await closeReaderByButton(page);
    await expect(page.getByRole('button', { name: 'Open the reader' })).toBeFocused();
    await expect(page.locator('.bb-shelf')).toHaveCount(0);
  });

  test('reader-only shows the paste panel for a link without text, and a saved text replaces it in memory', async ({ page }) => {
    await page.goto('/examples/reader-only.html');
    await page.getByRole('button', { name: 'Open a link without text' }).click();
    await expect(page.locator('.bb-reader')).toHaveAttribute('data-open', '1');
    await expect(page.locator('.bb-reader__paste-field')).toBeVisible();
    await expect(page.locator('.bb-reader__empty-title')).toBeVisible();

    await page.locator('.bb-reader__paste-field').fill('Just one pasted line.');
    await page.locator('.bb-reader__save').click();
    await expect(page.locator('.bb-reader__body p')).toHaveText('Just one pasted line.');
    await expect(page.locator('.bb-reader__empty-title')).toHaveCount(0);

    // Close and open again: the text is still there, but only in memory.
    await closeReaderByButton(page);
    await page.getByRole('button', { name: 'Open a link without text' }).click();
    await expect(page.locator('.bb-reader__body p')).toHaveText('Just one pasted line.');
    await expect(page.locator('.bb-shelf')).toHaveCount(0);
  });

  test('store-only adds a bookmark, rejects a javascript: link, shows JSON and has no shelf or reader', async ({ page }) => {
    await page.goto('/examples/store-only.html');
    await expect(page.locator('.bb-shelf')).toHaveCount(0);
    await expect(page.locator('.bb-reader')).toHaveCount(0);
    await expect(page.locator('#list li')).toHaveCount(0);

    await page.getByLabel('Link', { exact: false }).fill('https://example.org/store-example');
    await page.getByLabel('Title, optional').fill('Store example');
    await page.getByRole('button', { name: 'Add bookmark' }).click();
    await expect(page.locator('#list li')).toHaveCount(1);
    await expect(page.locator('#list li')).toContainText('Store example');
    await expect(page.locator('#list li')).toContainText('https://example.org/store-example');
    await expect(page.locator('#json')).toContainText('"title": "Store example"');
    await expect(page.locator('[role="alert"]')).toBeEmpty();

    await page.getByLabel('Link', { exact: false }).fill('javascript:alert(1)');
    await page.getByRole('button', { name: 'Add bookmark' }).click();
    await expect(page.locator('[role="alert"]')).not.toBeEmpty();
    await expect(page.locator('#list li')).toHaveCount(1);
    await expect(page.locator('#json')).not.toContainText('javascript:');

    await page.getByRole('button', { name: 'Remove last' }).click();
    await expect(page.locator('#list li')).toHaveCount(0);
    await expect(page.locator('#json')).not.toContainText('Store example');
    await expect(page.locator('.bb-shelf')).toHaveCount(0);
    await expect(page.locator('.bb-reader')).toHaveCount(0);
  });
});

import { SAMPLE_COUNT, expect, expectReaderGone, expectReaderOpen, openApp, reloadApp, test } from './fixtures';

test.describe('accessible list fallback', () => {
  test('the list toggle shows 14 rows with the same actions and safe original links', async ({ page }) => {
    await openApp(page);
    const toggle = page.locator('#view');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#list')).toBeVisible();
    await expect(page.locator('#shelf')).toBeHidden();

    const rows = page.locator('.bb-list__row');
    await expect(rows).toHaveCount(SAMPLE_COUNT);
    for (const row of await rows.all()) {
      await expect(row.locator('.bb-list__title')).toBeVisible();
      // One reading action, one link to the original, one edit button on every row.
      await expect(row.getByRole('button', { name: /^(Read|Continue|Add reading text)$/ })).toHaveCount(1);
      await expect(row.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(1);
      const original = row.getByRole('link', { name: /Open original/ });
      await expect(original).toHaveCount(1);
      await expect(original).toHaveAttribute('target', '_blank');
      await expect(original).toHaveAttribute('rel', /noopener/);
      await expect(original).toHaveAttribute('rel', /noreferrer/);
    }
    // Every link is safe, not only the ones inside rows.
    const unsafe = await page
      .locator('#list a[target="_blank"]')
      .evaluateAll((links) => links.filter((link) => !/noopener/.test(link.getAttribute('rel') ?? '') || !/noreferrer/.test(link.getAttribute('rel') ?? '')).length);
    expect(unsafe).toBe(0);
  });

  test('activating a title with the keyboard opens the reader, Escape closes it and the list stays', async ({ page }) => {
    await openApp(page);
    await page.locator('#view').click();
    const title = page.locator('.bb-list__row[data-id="bm-commonplace-book"] .bb-list__title');
    await title.focus();
    await page.keyboard.press('Enter');

    await expectReaderOpen(page);
    await expect(page.locator('.bb-reader__title')).toHaveText('Keeping a Commonplace Book');
    await expect(page.locator('.bb-reader__close')).toBeFocused();

    await page.keyboard.press('Escape');
    await expectReaderGone(page);
    await expect(page.locator('#list')).toBeVisible();
    await expect(page.locator('.bb-list__row')).toHaveCount(SAMPLE_COUNT);
  });

  // Product bug: closing the reader opened from the list view leaves focus on the page body, not on the title.
  test('Escape returns keyboard focus to the title that opened the reader from the list', async ({ page }) => {
    await openApp(page);
    await page.locator('#view').click();
    const title = page.locator('.bb-list__row[data-id="bm-commonplace-book"] .bb-list__title');
    await title.focus();
    await page.keyboard.press('Enter');
    await expectReaderOpen(page);
    await page.keyboard.press('Escape');
    await expectReaderGone(page);
    await expect(title).toBeFocused();
  });

  test('the list choice survives a reload', async ({ page }) => {
    await openApp(page);
    await page.locator('#view').click();
    await expect(page.locator('#list')).toBeVisible();

    await page.reload();
    await expect(page.locator('#list')).toBeVisible();
    await expect(page.locator('#view')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.bb-list__row')).toHaveCount(SAMPLE_COUNT);

    await page.locator('#view').click();
    await reloadApp(page);
    await expect(page.locator('#view')).toHaveAttribute('aria-pressed', 'false');
  });
});

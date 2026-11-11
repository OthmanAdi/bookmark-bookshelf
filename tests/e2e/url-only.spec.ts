import { actionsOf, addLink, expect, expectReaderOpen, openApp, reloadApp, shelfOf, test } from './fixtures';

const URL_ONLY = 'https://example.org/only-a-link';

test.describe('a link without a reading copy', () => {
  test('the caption offers "Add reading text" and a safe "Open original" link', async ({ page }) => {
    await openApp(page);
    await addLink(page, { url: URL_ONLY, title: 'Only a link' });

    const actions = actionsOf(page);
    await expect(actions.getByRole('button', { name: 'Add reading text' })).toBeVisible();
    await expect(actions.getByRole('button', { name: 'Read', exact: true })).toHaveCount(0);

    const original = actions.getByRole('link', { name: /Open original/ });
    await expect(original).toHaveAttribute('href', URL_ONLY);
    await expect(original).toHaveAttribute('target', '_blank');
    await expect(original).toHaveAttribute('rel', /noopener/);
    await expect(original).toHaveAttribute('rel', /noreferrer/);
  });

  test('"Add reading text" opens the reader on the paste field, saving renders the text and it survives a reload', async ({ page }) => {
    await openApp(page);
    await addLink(page, { url: URL_ONLY, title: 'Only a link' });

    await actionsOf(page).getByRole('button', { name: 'Add reading text' }).click();
    await expectReaderOpen(page);
    await expect(page.locator('.bb-reader__paste-field')).toBeFocused();
    await expect(page.locator('.bb-reader__empty-title')).toBeVisible();
    await expect(page.locator('.bb-reader__empty-body')).toContainText('Paste the text you want to read');
    await expect(page.locator('.bb-reader__open')).toHaveAttribute('href', URL_ONLY);

    await page.locator('.bb-reader__paste-field').fill('# A pasted heading\n\nFirst pasted paragraph.\n\n- one\n- two');
    await page.locator('.bb-reader__save').click();

    await expect(page.locator('.bb-reader__body h2')).toHaveText('A pasted heading');
    await expect(page.locator('.bb-reader__body p')).toHaveText('First pasted paragraph.');
    await expect(page.locator('.bb-reader__body li')).toHaveCount(2);
    await expect(page.locator('.bb-reader__empty-title')).toHaveCount(0);
    await expect(page.locator('.bb-reader__paste-field')).toHaveCount(0);

    await reloadApp(page);
    await expectReaderOpen(page);
    await expect(page.locator('.bb-reader__body h2')).toHaveText('A pasted heading');
    await expect(page.locator('.bb-reader__empty-title')).toHaveCount(0);

    await page.locator('.bb-reader__close').click();
    await expect(page.locator('.bb-reader')).toHaveCount(0);
    await expect(shelfOf(page)).toHaveAttribute('data-open', '0');
    await expect(actionsOf(page).getByRole('button', { name: 'Read', exact: true })).toBeVisible();
  });

  test('a sample without a reading copy behaves the same way', async ({ page }) => {
    await openApp(page);
    await page.locator('#view').click();
    const row = page.locator('.bb-list__row[data-id="bm-internet-archive"]');
    await expect(row.getByRole('button', { name: 'Add reading text' })).toBeVisible();
    await row.getByRole('button', { name: 'Add reading text' }).click();
    await expectReaderOpen(page);
    await expect(page.locator('.bb-reader__paste-field')).toBeFocused();
  });
});

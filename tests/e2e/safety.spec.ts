import { actionsOf, addLink, expect, expectReaderOpen, openApp, test } from './fixtures';

const IMG_PAYLOAD = '<img src=x onerror="window.__xss=1">';
const SCRIPT_PAYLOAD = '<script>window.__xss=1</script>';

test.describe('safety', () => {
  test('markup in a title and a reading copy is shown as text and never runs', async ({ page }) => {
    await openApp(page);
    const bookmark = await addLink(page, {
      url: 'https://example.org/markup',
      title: IMG_PAYLOAD,
      readingText: `${IMG_PAYLOAD}\n\n${SCRIPT_PAYLOAD}\n\nA plain closing paragraph.`,
    });
    expect(bookmark.title).toBe(IMG_PAYLOAD);

    // On the shelf: caption, spine and the accessible name carry the text, no element was created.
    await expect(page.locator('.bb-shelf__title')).toHaveText(IMG_PAYLOAD);
    await expect(page.locator('.bb-book.is-centre .bb-spine__title')).toHaveText(IMG_PAYLOAD);
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    await expect(page.locator('.bb-shelf script')).toHaveCount(0);

    await actionsOf(page).getByRole('button', { name: 'Read', exact: true }).click();
    await expectReaderOpen(page);
    await expect(page.locator('.bb-reader__title')).toHaveText(IMG_PAYLOAD);
    const body = page.locator('.bb-reader__body');
    await expect(body).toContainText(IMG_PAYLOAD);
    await expect(body).toContainText(SCRIPT_PAYLOAD);
    await expect(body.locator('img, script')).toHaveCount(0);

    expect(await page.evaluate(() => Reflect.get(window, '__xss'))).toBeUndefined();
  });

  test('the list view shows the same markup as text', async ({ page }) => {
    await openApp(page);
    await addLink(page, { url: 'https://example.org/markup-list', title: IMG_PAYLOAD, readingText: SCRIPT_PAYLOAD });
    await page.locator('#view').click();
    await expect(page.locator('.bb-list__title', { hasText: IMG_PAYLOAD })).toHaveCount(1);
    await expect(page.locator('#list img, #list script')).toHaveCount(0);
    expect(await page.evaluate(() => Reflect.get(window, '__xss'))).toBeUndefined();
  });

  test('markup pasted into the reader is shown as text too', async ({ page }) => {
    await openApp(page);
    await addLink(page, { url: 'https://example.org/paste-markup', title: 'Pasted markup' });
    await actionsOf(page).getByRole('button', { name: 'Add reading text' }).click();
    await expectReaderOpen(page);
    await page.locator('.bb-reader__paste-field').fill(`${IMG_PAYLOAD}\n\n${SCRIPT_PAYLOAD}`);
    await page.locator('.bb-reader__save').click();
    await expect(page.locator('.bb-reader__body')).toContainText(SCRIPT_PAYLOAD);
    await expect(page.locator('.bb-reader__body img, .bb-reader__body script')).toHaveCount(0);
    expect(await page.evaluate(() => Reflect.get(window, '__xss'))).toBeUndefined();
  });
});

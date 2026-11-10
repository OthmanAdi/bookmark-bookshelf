import type { Page } from '@playwright/test';
import {
  SAMPLE_COUNT,
  actionsOf,
  addLink,
  captionTitle,
  expect,
  expectSettled,
  fillEditor,
  openApp,
  readLibrary,
  reloadApp,
  shelfOf,
  test,
} from './fixtures';

async function editCentred(page: Page): Promise<void> {
  await actionsOf(page).getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('#editor')).toBeVisible();
}

test.describe('add, edit and organise', () => {
  test('an invalid link shows the dialog error and adds nothing', async ({ page }) => {
    await openApp(page);
    await page.locator('#add').click();
    await fillEditor(page, { url: 'javascript:alert(1)', title: 'Should not exist' });
    await page.locator('#editor-save').click();

    const error = page.locator('#editor-error');
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute('role', 'alert');
    await expect(error).not.toBeEmpty();
    await expect(page.locator('#editor')).toBeVisible();

    await page.locator('#editor-cancel').click();
    await expect(page.locator('#tabs .bb-tab', { hasText: 'All' }).locator('.bb-tab__count')).toHaveText(String(SAMPLE_COUNT));
    await expect(page.locator('.bb-book__control')).toHaveCount(SAMPLE_COUNT);
    await expect(page.locator('.bb-book__control[aria-label^="Should not exist"]')).toHaveCount(0);
    await expect(page.locator('#editor')).not.toBeVisible();
    await expect(shelfOf(page)).toHaveAttribute('data-focus-id', 'bm-tsundoku');
  });

  test('editing a volume changes its title on the spine and in the caption', async ({ page }) => {
    await openApp(page);
    await editCentred(page);
    await page.locator('#editor [name="title"]').fill('A Renamed Volume');
    await page.locator('#editor-save').click();
    await expect(page.locator('#editor')).not.toBeVisible();

    await expect(captionTitle(page)).toHaveText('A Renamed Volume');
    await expect(page.locator('.bb-book.is-centre .bb-spine__title')).toHaveText('A Renamed Volume');
    await expectSettled(page);
    await expect(actionsOf(page).getByRole('link', { name: /Open original of A Renamed Volume/ })).toBeVisible();
  });

  test('removing a volume shows an Undo toast and Undo restores it', async ({ page }) => {
    await openApp(page);
    await editCentred(page);
    await page.locator('#editor-delete').click();

    const toast = page.locator('.bb-toast');
    await expect(toast).toContainText('Removed "On Piles of Unread Books"');
    await expect(page.locator('.bb-tab', { hasText: 'All' }).locator('.bb-tab__count')).toHaveText(String(SAMPLE_COUNT - 1));
    expect((await readLibrary(page)).bookmarks).toHaveLength(SAMPLE_COUNT - 1);
    await expect(shelfOf(page)).not.toHaveAttribute('data-focus-id', 'bm-tsundoku');

    await toast.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('.bb-toast')).toHaveCount(0);
    await expect(page.locator('.bb-tab', { hasText: 'All' }).locator('.bb-tab__count')).toHaveText(String(SAMPLE_COUNT));
    const restored = (await readLibrary(page)).bookmarks.find((entry) => entry.id === 'bm-tsundoku');
    expect(restored?.title).toBe('On Piles of Unread Books');
  });

  test('a new shelf can receive a volume, and its tab shows only that volume', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'New shelf' }).click();
    await expect(page.locator('#prompt')).toBeVisible();
    await page.locator('#prompt-input').fill('Night reads');
    await page.locator('#prompt-form button[type="submit"]').click();
    await expect(page.locator('#prompt')).not.toBeVisible();

    const newTab = page.locator('#tabs .bb-tab', { hasText: 'Night reads' });
    await expect(newTab).toHaveAttribute('aria-pressed', 'true');
    await expect(shelfOf(page)).toHaveAttribute('data-empty', '1');

    // Back on "All", move the centred volume to the new shelf through the edit dialog.
    await page.locator('#tabs .bb-tab', { hasText: 'All' }).click();
    await expect(shelfOf(page)).toHaveAttribute('data-empty', '0');
    await expectSettled(page);
    const movedTitle = (await captionTitle(page).textContent()) ?? '';
    await editCentred(page);
    await page.locator('#editor [name="shelfId"]').selectOption({ label: 'Night reads' });
    await page.locator('#editor-save').click();
    await expect(page.locator('#editor')).not.toBeVisible();

    await newTab.click();
    await expect(newTab).toHaveAttribute('aria-pressed', 'true');
    await expect(newTab.locator('.bb-tab__count')).toHaveText('1');
    await expect(page.locator('.bb-book__control')).toHaveCount(1);
    await expect(captionTitle(page)).toHaveText(movedTitle);
    await expectSettled(page);

    await reloadApp(page);
    await expect(page.locator('#tabs .bb-tab', { hasText: 'Night reads' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.bb-book__control')).toHaveCount(1);
  });

  test('move earlier and later reorders a volume inside its shelf and survives a reload', async ({ page }) => {
    await openApp(page);
    await page.locator('#tabs .bb-tab[data-shelf="shelf-reading"]').click();
    await expect(shelfOf(page)).toHaveAttribute('data-focus-id', 'bm-tsundoku');
    await expectSettled(page);
    const actions = actionsOf(page);

    await actions.getByRole('button', { name: /one place later/ }).click();
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '1');
    await expectSettled(page);
    await actions.getByRole('button', { name: /one place later/ }).click();
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '2');
    await expectSettled(page);
    await actions.getByRole('button', { name: /one place earlier/ }).click();
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '1');
    await expectSettled(page);

    const order = async (): Promise<string[]> =>
      (await readLibrary(page)).bookmarks
        .filter((entry) => entry.shelfId === 'shelf-reading')
        .sort((a, b) => a.order - b.order)
        .map((entry) => entry.id);
    expect((await order()).indexOf('bm-tsundoku')).toBe(1);

    await reloadApp(page);
    await expect(page.locator('#tabs .bb-tab[data-shelf="shelf-reading"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.bb-book[data-id="bm-tsundoku"]').first()).toHaveAttribute('data-index', '1');
    expect((await order()).indexOf('bm-tsundoku')).toBe(1);
  });

  test('a link added on a filtered shelf lands on that shelf and is centred', async ({ page }) => {
    await openApp(page);
    await page.locator('#tabs .bb-tab[data-shelf="shelf-craft"]').click();
    await expectSettled(page);
    const bookmark = await addLink(page, { url: 'https://example.org/craft-note', title: 'A craft note' });
    expect(bookmark.shelfId).toBe('shelf-craft');
    await expect(page.locator('#tabs .bb-tab[data-shelf="shelf-craft"] .bb-tab__count')).toHaveText('6');
  });
});

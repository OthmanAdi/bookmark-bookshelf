import type { Page } from '@playwright/test';
import { expect, openApp, test, viewButton } from './fixtures';

/**
 * Choosing how a book looks: the small live book in the editor, and a View menu that stays open while
 * looks and drawings are tried.
 */

/** Whether this browser can draw WebGL 2 at all. Without it there is no lit book to wait for. */
const canDraw = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    try {
      return document.createElement('canvas').getContext('webgl2') !== null;
    } catch {
      return false;
    }
  });

test.describe('the look of a link', () => {
  test('binding and title stamp stand in view with a small book that follows the choice', async ({ page }, testInfo) => {
    await openApp(page, '/app.html?paint=classic');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Edit link' });
    await expect(editor).toBeVisible();

    const look = editor.getByRole('group', { name: 'How it looks' });
    const stage = editor.locator('#look-stage');
    if (testInfo.project.name === 'desktop') {
      // On a desktop both rows are on screen without scrolling, and so is the small book.
      await expect(look.getByRole('group', { name: 'Binding' })).toBeInViewport({ ratio: 1 });
      await expect(look.getByRole('group', { name: 'Title stamp' })).toBeInViewport({ ratio: 1 });
      await expect(stage).toBeInViewport({ ratio: 1 });
    } else {
      await look.scrollIntoViewIfNeeded();
    }
    const book = stage.locator('.bb-showcase__book');
    await expect(book).toBeVisible();
    const height = (await book.boundingBox())?.height ?? 0;
    expect(height).toBeGreaterThanOrEqual(105);
    expect(height).toBeLessThanOrEqual(175);

    // A choice is named beside its row at once, and nothing is saved by it.
    await look.getByRole('radio', { name: 'Leather' }).check();
    await expect(look.locator('#field-binding .bb-swatches__chosen')).toHaveText('Leather');
    // A stamp that would be hard to read can still be chosen, and says so.
    await look.getByRole('radio', { name: 'Blind deboss' }).check();
    await expect(look.getByRole('radio', { name: 'Blind deboss' })).toHaveAccessibleDescription(/hard to read/i);
    await expect(look.locator('#field-stamp .bb-swatches__chosen')).toContainText('hard to read');

    test.skip(!(await canDraw(page)), 'This browser has no WebGL 2.');

    // In Classic the words say where the choice shows, and Studio is one press away.
    await expect(editor.getByText('Binding and title stamp show when the shelf is drawn in Studio.')).toBeVisible();
    await editor.getByRole('button', { name: 'Switch to Studio' }).click();

    // The lit book takes the place of the CSS one, in the dialog, before anything is saved.
    const lit = stage.locator('canvas[data-drawn]');
    await expect(lit).toBeVisible({ timeout: 60_000 });
    await expect(stage).toHaveAttribute('data-preview', 'studio');
    await expect(editor.getByText('Lit as on your Studio shelf.')).toBeVisible();
    await expect(editor).toBeVisible();

    // A new choice is drawn again at once.
    const drawnBefore = Number(await lit.getAttribute('data-drawn'));
    await look.getByRole('radio', { name: 'Copper foil' }).check();
    await expect.poll(async () => Number(await lit.getAttribute('data-drawn'))).toBeGreaterThan(drawnBefore);

    // Closing the dialog takes the lit book, and its WebGL context, away.
    await editor.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Discard' }).click({ timeout: 2000 }).catch(() => undefined);
    await expect(editor).toBeHidden();
    await expect(page.locator('#look-stage canvas')).toHaveCount(0);
  });

  test('the View menu stays open while looks and drawings are tried, and closes on a view or Escape', async ({ page }) => {
    await openApp(page, '/app.html?paint=classic');
    const button = viewButton(page);
    await button.click();
    const menu = page.getByRole('menu', { name: 'View' });
    await expect(menu).toBeVisible();

    // The drawing comes first, as a two-way switch.
    const items = menu.getByRole('menuitemradio');
    await expect(items.nth(0)).toHaveAccessibleName('Classic');
    await expect(items.nth(1)).toHaveAccessibleName('Studio');

    await menu.getByRole('menuitemradio', { name: 'Night Study', exact: true }).click();
    await expect(menu).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-variant', 'night');
    await expect(menu.getByRole('menuitemradio', { name: 'Night Study', exact: true })).toHaveAttribute('aria-checked', 'true');

    await menu.getByRole('menuitemradio', { name: 'Oak Library', exact: true }).click();
    await expect(menu).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-variant', 'oak');

    if (await canDraw(page)) {
      const studio = menu.getByRole('menuitemradio', { name: 'Studio', exact: true });
      await studio.click();
      await expect(menu).toBeVisible();
      await expect(studio).toHaveAttribute('aria-checked', 'true');
      // Until the shelf is drawn with it the side is busy; then it is not.
      await expect(page.locator('canvas.bb-studio[data-drawn]')).toBeAttached({ timeout: 60_000 });
      await expect(studio).not.toHaveAttribute('aria-busy', 'true');
      await expect(studio).toHaveAccessibleDescription('Lit materials, drawn with WebGL.');
    }

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    await button.click();
    await menu.getByRole('menuitemradio', { name: 'List', exact: true }).click();
    await expect(menu).toBeHidden();
  });
});

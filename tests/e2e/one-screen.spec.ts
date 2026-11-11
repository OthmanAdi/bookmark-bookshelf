import type { Page } from '@playwright/test';
import {
  HOMEWORK,
  LOOKS,
  addButton,
  captionTitle,
  chooseLook,
  expect,
  libraryButton,
  openApp,
  openShelf,
  originalLink,
  primaryAction,
  shelfOf,
  test,
  viewButton,
} from './fixtures';

const SIZES = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

/** How much taller and wider the page is than the window. Zero means nothing scrolls. */
function overflow(page: Page): Promise<{ down: number; across: number }> {
  return page.evaluate(() => ({
    down: document.documentElement.scrollHeight - window.innerHeight,
    across: document.documentElement.scrollWidth - window.innerWidth,
  }));
}

async function expectWholeViewOnScreen(page: Page): Promise<void> {
  expect(await overflow(page)).toEqual({ down: 0, across: 0 });
  for (const control of [primaryAction(page), originalLink(page), captionTitle(page), viewButton(page), libraryButton(page), addButton(page)]) {
    await expect(control).toBeInViewport({ ratio: 1 });
  }
  // The strip of tabs scrolls sideways when there are many; the open shelf's tab is the one brought into it.
  await expect(page.locator('#tabs').getByRole('button', { pressed: true })).toBeInViewport();
  // The row has real room: it is not squeezed to a strip to make the rest fit.
  const row = await shelfOf(page).boundingBox();
  expect(row?.height ?? 0).toBeGreaterThan(200);
}

test.describe('the working view fits one screen', () => {
  for (const size of SIZES) {
    test(`at ${size.width} x ${size.height} nothing scrolls and the main action is on screen`, async ({ page }) => {
      await page.setViewportSize(size);
      await openApp(page);
      await expectWholeViewOnScreen(page);

      // One shelf adds its status line and its menu; the view still fits.
      await openShelf(page, HOMEWORK.id);
      await expect(page.getByText('Nothing read yet.')).toBeVisible();
      await expectWholeViewOnScreen(page);
      await expect(page.getByRole('button', { name: 'Shelf', exact: true })).toBeInViewport({ ratio: 1 });
    });
  }

  test('every look gives the row the same room, and none of them scrolls', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openApp(page);
    const room = async (): Promise<number> => Math.round((await page.locator('#shelf').boundingBox())?.height ?? 0);
    const paper = await room();
    for (const look of LOOKS) {
      if (look.name !== 'paper') await chooseLook(page, look.name);
      expect(await overflow(page), look.label).toEqual({ down: 0, across: 0 });
      expect(Math.abs((await room()) - paper), `${look.label}: height of the stage`).toBeLessThanOrEqual(1);
      await expect(primaryAction(page)).toBeInViewport({ ratio: 1 });
    }
  });

  test('there is no footer: saving and the way out live in the Library menu', async ({ page }) => {
    await openApp(page);
    await expect(page.getByRole('contentinfo')).toHaveCount(0);
    await expect(page.locator('footer')).toHaveCount(0);

    await libraryButton(page).click();
    const menu = page.locator('#library-menu');
    await expect(menu).toBeVisible();
    for (const item of ['Bring links in', 'Take links out', 'Send the current page here', 'Remove examples']) {
      await expect(menu.getByRole('button', { name: item, exact: true })).toBeVisible();
    }
    await expect(menu.getByText('Saved in this browser only. Export a copy before clearing site data.')).toBeVisible();
    await expect(menu).toBeInViewport({ ratio: 1 });
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(libraryButton(page)).toBeFocused();
  });
});

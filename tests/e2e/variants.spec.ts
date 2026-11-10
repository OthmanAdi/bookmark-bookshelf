import type { Page } from '@playwright/test';
import { afterTwoFrames, centredControl, expect, expectSettled, focusId, openApp, reloadApp, shelfOf, test } from './fixtures';

async function variantNames(page: Page): Promise<string[]> {
  return page.locator('#variant option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
}

test.describe('variants', () => {
  test('every look is offered, applies to the shelf and the page, keeps a centred volume and survives a reload', async ({ page }) => {
    await openApp(page);
    const names = await variantNames(page);
    expect(names).toEqual(expect.arrayContaining(['paper', 'oak', 'night', 'pocket']));

    for (const name of names) {
      await page.locator('#variant').selectOption(name);
      await expect(shelfOf(page)).toHaveAttribute('data-variant', name);
      await expect(page.locator('html')).toHaveAttribute('data-variant', name);
      await expect(page.locator('.bb-book.is-centre')).toHaveCount(1);
      await expectSettled(page);
      expect(await focusId(page)).not.toBe('');

      await reloadApp(page);
      await expect(page.locator('#variant')).toHaveValue(name);
      await expect(shelfOf(page)).toHaveAttribute('data-variant', name);
      await expect(page.locator('html')).toHaveAttribute('data-variant', name);
      await expect(page.locator('.bb-book.is-centre')).toHaveCount(1);
    }
  });

  test('switching the look keeps the same volume in the centre', async ({ page }) => {
    await openApp(page);
    await centredControl(page).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '2');
    await expectSettled(page);
    const id = await focusId(page);

    for (const name of ['oak', 'night', 'pocket', 'paper']) {
      await page.locator('#variant').selectOption(name);
      await expect(shelfOf(page)).toHaveAttribute('data-variant', name);
      await expect(shelfOf(page)).toHaveAttribute('data-focus-id', id);
      await expectSettled(page);
    }
  });

  test('oak is a row with two ends: every volume is real and the first one does not wrap', async ({ page }) => {
    await openApp(page);
    await page.locator('#variant').selectOption('oak');
    await expect(shelfOf(page)).toHaveAttribute('data-variant', 'oak');
    await expectSettled(page);

    await expect(page.locator('.bb-book[aria-hidden="true"]')).toHaveCount(0);
    await centredControl(page).focus();
    await page.keyboard.press('Home');
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '0');
    await expectSettled(page);
    const first = await focusId(page);

    await page.keyboard.press('ArrowLeft');
    await afterTwoFrames(page);
    await expectSettled(page);
    expect(await focusId(page)).toBe(first);
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '0');

    await page.keyboard.press('End');
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '13');
    await expectSettled(page);
    await page.keyboard.press('ArrowRight');
    await afterTwoFrames(page);
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '13');
  });
});

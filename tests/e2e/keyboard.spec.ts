import type { Page } from '@playwright/test';
import {
  SAMPLE_COUNT,
  centredControl,
  controlFor,
  expect,
  expectReaderGone,
  expectReaderOpen,
  expectSettled,
  focusId,
  focusIndex,
  openApp,
  shelfOf,
  test,
} from './fixtures';

/** Presses Tab until a volume control has focus. Returns how many presses it took. */
async function tabToVolume(page: Page): Promise<number> {
  for (let presses = 1; presses <= 30; presses++) {
    await page.keyboard.press('Tab');
    const onVolume = await page.evaluate(() => document.activeElement?.classList.contains('bb-book__control') ?? false);
    if (onVolume) return presses;
  }
  return -1;
}

test.describe('keyboard', () => {
  test('Tab reaches the centred volume, and it is the only tab stop in the row', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('.bb-book__control[tabindex="0"]')).toHaveCount(1);

    expect(await tabToVolume(page)).toBeGreaterThan(0);
    await expect(centredControl(page)).toBeFocused();

    // One more Tab leaves the row instead of walking through every volume.
    await page.keyboard.press('Tab');
    const stillOnVolume = await page.evaluate(() => document.activeElement?.classList.contains('bb-book__control') ?? false);
    expect(stillOnVolume).toBe(false);
  });

  test('ArrowRight and ArrowLeft change the focused volume', async ({ page }) => {
    await openApp(page);
    await centredControl(page).focus();
    const first = await focusId(page);

    await page.keyboard.press('ArrowRight');
    await expect(shelfOf(page)).not.toHaveAttribute('data-focus-id', first);
    await expectSettled(page);
    const second = await focusId(page);
    expect(await focusIndex(page)).toBe(1);
    await expect(centredControl(page)).toBeFocused();

    await page.keyboard.press('ArrowLeft');
    await expect(shelfOf(page)).toHaveAttribute('data-focus-id', first);
    await expectSettled(page);
    expect(second).not.toBe(first);
  });

  test('Home and End jump to the first and last volume', async ({ page }) => {
    await openApp(page);
    await centredControl(page).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '2');
    await expectSettled(page);

    await page.keyboard.press('End');
    await expect(shelfOf(page)).toHaveAttribute('data-focus', String(SAMPLE_COUNT - 1));
    await expectSettled(page);

    await page.keyboard.press('Home');
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '0');
    await expectSettled(page);
    await expect(centredControl(page)).toBeFocused();
  });

  test('Enter opens the reader, focus lands on Close, Tab stays inside, Escape returns focus to the same volume', async ({ page }) => {
    await openApp(page);
    await centredControl(page).focus();
    await page.keyboard.press('ArrowRight');
    await expectSettled(page);
    const id = await focusId(page);

    await page.keyboard.press('Enter');
    await expectReaderOpen(page);
    await expect(page.locator('.bb-reader__close')).toBeFocused();

    // Walk forward and backward through more stops than the dialog has: focus never leaves it.
    for (let press = 0; press < 8; press++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.closest('.bb-reader') !== null)).toBe(true);
    }
    for (let press = 0; press < 8; press++) {
      await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(() => document.activeElement?.closest('.bb-reader') !== null)).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expectReaderGone(page);
    await expect(controlFor(page, id).first()).toBeFocused();
    await expect(centredControl(page)).toBeFocused();
    expect(await focusId(page)).toBe(id);
  });

  test('exactly 14 volume controls exist even when more than 14 volumes are drawn', async ({ page }) => {
    await openApp(page);
    const drawn = await page.locator('.bb-book').count();
    expect(drawn).toBeGreaterThan(SAMPLE_COUNT);
    await expect(page.locator('.bb-book__control')).toHaveCount(SAMPLE_COUNT);
    // The repeated copies are hidden from assistive technology.
    await expect(page.locator('.bb-book[aria-hidden="true"]')).toHaveCount(drawn - SAMPLE_COUNT);
  });
});

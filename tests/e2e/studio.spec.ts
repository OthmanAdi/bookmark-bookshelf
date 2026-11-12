import type { Page } from '@playwright/test';
import { expect, expectReaderGone, expectReaderOpen, expectSettled, focusId, openApp, shelfOf, test } from './fixtures';

/** Whether this browser can draw WebGL 2 at all. Studio steps back to the CSS shelf where it cannot. */
const canDraw = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    try {
      return document.createElement('canvas').getContext('webgl2') !== null;
    } catch {
      return false;
    }
  });

test.describe('Studio drawing', () => {
  test('paints the row in WebGL behind the DOM volumes, which keep their controls', async ({ page }) => {
    await openApp(page, '/app.html?paint=studio');
    test.skip(!(await canDraw(page)), 'This browser has no WebGL 2.');
    await expect(shelfOf(page)).toHaveAttribute('data-paint', 'studio');
    const canvas = page.locator('.bb-shelf__scene canvas.bb-studio');
    await expect(canvas).toHaveCount(1);
    await expect(canvas).toHaveAttribute('aria-hidden', 'true');
    // The canvas never takes a press: the volume under the pointer is still the DOM one.
    expect(await canvas.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none');
    // Every link keeps exactly one control.
    await expect(page.locator('.bb-book__control')).toHaveCount(15);
    // It has drawn frames, and in them every volume that stands in view.
    await expect.poll(async () => Number(await canvas.getAttribute('data-drawn'))).toBeGreaterThan(0);
    expect(Number(await canvas.getAttribute('data-volumes'))).toBeGreaterThan(5);
  });

  test('keeps the keyboard working: arrows move along the row and Enter opens the centre', async ({ page }) => {
    await openApp(page, '/app.html?paint=studio');
    test.skip(!(await canDraw(page)), 'This browser has no WebGL 2.');
    await page.locator('.bb-book.is-centre .bb-book__control').focus();
    const first = await focusId(page);
    await page.keyboard.press('ArrowRight');
    await expectSettled(page);
    expect(await focusId(page)).not.toBe(first);
    await page.keyboard.press('Enter');
    await expectReaderOpen(page);
    await page.keyboard.press('Escape');
    await expectReaderGone(page);
    await expect(shelfOf(page)).toHaveAttribute('data-paint', 'studio');
  });

  test('goes back to the CSS shelf when asked', async ({ page }) => {
    await openApp(page, '/app.html?paint=classic');
    await expect(shelfOf(page)).not.toHaveAttribute('data-paint', 'studio');
    await expect(page.locator('canvas.bb-studio')).toHaveCount(0);
  });
});

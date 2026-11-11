import type { Page } from '@playwright/test';
import {
  EXAMPLE_COUNT,
  FIRST_EXAMPLE,
  LOOKUPS,
  NARROW_WINDOW,
  SECOND_EXAMPLE,
  afterTwoFrames,
  centredControl,
  closeReaderButton,
  controlFor,
  expect,
  expectReaderGone,
  expectReaderOpen,
  expectSettled,
  focusId,
  openApp,
  openShelf,
  readerOf,
  shelfOf,
  test,
} from './fixtures';

/** True when keyboard focus is on a volume of the row. */
const onVolume = (page: Page): Promise<boolean> => page.evaluate(() => Boolean(document.activeElement?.closest('.bb-book')));

/** Presses Tab until a volume has focus. Returns how many presses it took. */
async function tabToVolume(page: Page): Promise<number> {
  for (let presses = 1; presses <= 40; presses++) {
    await page.keyboard.press('Tab');
    if (await onVolume(page)) return presses;
  }
  return -1;
}

const insideReader = (page: Page): Promise<boolean> => readerOf(page).evaluate((reader) => reader.contains(document.activeElement));

test.describe('keyboard', () => {
  test('Tab reaches the centred volume, it is the only tab stop in the row, and it says how the row works', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('.bb-book__control[tabindex="0"]')).toHaveCount(1);

    expect(await tabToVolume(page)).toBeGreaterThan(0);
    await expect(centredControl(page)).toBeFocused();
    await expect(centredControl(page)).toHaveAccessibleName(`${FIRST_EXAMPLE.title}. developer.mozilla.org. Volume 1 of ${EXAMPLE_COUNT}`);
    await expect(centredControl(page)).toHaveAccessibleDescription('Arrow keys move along the shelf, Enter opens.');

    // One more Tab leaves the row instead of walking through every volume.
    await page.keyboard.press('Tab');
    expect(await onVolume(page)).toBe(false);
  });

  test('ArrowRight and ArrowLeft move one link at a time and focus goes with them', async ({ page }) => {
    await openApp(page);
    await centredControl(page).focus();

    await page.keyboard.press('ArrowRight');
    await expect(shelfOf(page)).toHaveAttribute('data-focus-id', SECOND_EXAMPLE.id);
    await expectSettled(page);
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '1');
    await expect(centredControl(page)).toBeFocused();
    await expect(controlFor(page, SECOND_EXAMPLE.id)).toBeFocused();

    await page.keyboard.press('ArrowLeft');
    await expect(shelfOf(page)).toHaveAttribute('data-focus-id', FIRST_EXAMPLE.id);
    await expectSettled(page);
    await expect(centredControl(page)).toBeFocused();
  });

  test('Home and End jump to the first and the last link', async ({ page }) => {
    await openApp(page);
    await centredControl(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '1');
    await expectSettled(page);
    await page.keyboard.press('ArrowRight');
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '2');
    await expectSettled(page);

    await page.keyboard.press('End');
    await expect(shelfOf(page)).toHaveAttribute('data-focus', String(EXAMPLE_COUNT - 1));
    await expectSettled(page);
    await expect(centredControl(page)).toBeFocused();

    await page.keyboard.press('Home');
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '0');
    await expectSettled(page);
    await expect(centredControl(page)).toBeFocused();
  });

  test('Enter opens the reader, focus lands on "Back to shelf", Tab stays inside, Escape returns focus to the same volume', async ({
    page,
  }) => {
    await openApp(page);
    await centredControl(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(shelfOf(page)).toHaveAttribute('data-focus-id', SECOND_EXAMPLE.id);
    await expectSettled(page);

    await page.keyboard.press('Enter');
    await expectReaderOpen(page);
    await expect(closeReaderButton(page)).toBeFocused();

    // Walk forward and backward through more stops than the reader has: focus never leaves it.
    for (let press = 0; press < 12; press++) {
      await page.keyboard.press('Tab');
      expect(await insideReader(page)).toBe(true);
    }
    for (let press = 0; press < 12; press++) {
      await page.keyboard.press('Shift+Tab');
      expect(await insideReader(page)).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expectReaderGone(page);
    await expect(controlFor(page, SECOND_EXAMPLE.id)).toBeFocused();
    await expect(centredControl(page)).toBeFocused();
    expect(await focusId(page)).toBe(SECOND_EXAMPLE.id);
  });

  test('a long row goes round: every link has exactly one control, in shelf order, and the repeats are hidden from assistive technology', async ({
    page,
  }) => {
    await page.setViewportSize(NARROW_WINDOW);
    await openApp(page);
    await expect(shelfOf(page)).toHaveAttribute('data-loop', '1');
    await expect(page.locator('.bb-book__control')).toHaveCount(EXAMPLE_COUNT);

    const volumes = await page.locator('.bb-book').evaluateAll((books) =>
      books.map((book) => ({
        index: Number((book as HTMLElement).dataset.index),
        hidden: book.getAttribute('aria-hidden') === 'true',
        control: book.querySelector('.bb-book__control') !== null,
      })),
    );
    expect(volumes.length).toBeGreaterThan(EXAMPLE_COUNT);
    // A repeat is hidden and has no control; a real volume is neither.
    expect(volumes.filter((volume) => volume.hidden === volume.control)).toEqual([]);
    const real = volumes.filter((volume) => volume.control).map((volume) => volume.index);
    expect(real).toEqual(Array.from({ length: EXAMPLE_COUNT }, (_, index) => index));

    // Going left from the first link arrives at the last one.
    await centredControl(page).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(shelfOf(page)).toHaveAttribute('data-focus', String(EXAMPLE_COUNT - 1));
    await expectSettled(page);
    await expect(centredControl(page)).toBeFocused();
  });

  test('a short shelf stands between two bookends and the arrow keys stop at its ends', async ({ page }) => {
    await openApp(page);
    await openShelf(page, LOOKUPS.id);
    await expect(shelfOf(page)).toHaveAttribute('data-loop', '0');
    await expect(page.locator('.bb-book')).toHaveCount(LOOKUPS.count);
    await expect(page.locator('.bb-book__control')).toHaveCount(LOOKUPS.count);
    await expect(page.locator('.bb-shelf__bookend:visible')).toHaveCount(2);

    await centredControl(page).focus();
    await page.keyboard.press('Home');
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '0');
    await expectSettled(page);
    const first = await focusId(page);

    await page.keyboard.press('ArrowLeft');
    await afterTwoFrames(page);
    await expectSettled(page);
    expect(await focusId(page)).toBe(first);

    await page.keyboard.press('End');
    await expect(shelfOf(page)).toHaveAttribute('data-focus', String(LOOKUPS.count - 1));
    await expectSettled(page);
    await page.keyboard.press('ArrowRight');
    await afterTwoFrames(page);
    await expectSettled(page);
    await expect(shelfOf(page)).toHaveAttribute('data-focus', String(LOOKUPS.count - 1));
    await expect(centredControl(page)).toBeFocused();
  });
});

import type { Locator, Page } from '@playwright/test';
import { EXAMPLE_COUNT, expect, expectReaderGone, expectReaderOpen, FIRST_EXAMPLE, openApp, readerOf, SECOND_EXAMPLE, shelfOf, test, viewButton } from './fixtures';

const showcaseOf = (page: Page): Locator => page.locator('.bb-showcase');
const titleOf = (page: Page): Locator => showcaseOf(page).getByRole('heading', { level: 2 });
const ticksOf = (page: Page): Locator => showcaseOf(page).getByRole('navigation', { name: 'Books' }).getByRole('button');
const bookOf = (page: Page): Locator => page.locator('.bb-showcase__control');

/** Chooses Showcase in the View menu and waits until the first book stands still. */
async function showShowcase(page: Page): Promise<void> {
  await viewButton(page).click();
  await page.getByRole('menu', { name: 'View' }).getByRole('menuitemradio', { name: 'Showcase', exact: true }).click();
  await expect(viewButton(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(showcaseOf(page)).toBeVisible();
  await expectAt(page, 0);
}

/** Waits until book `index` is in view and nothing moves any more. */
async function expectAt(page: Page, index: number): Promise<void> {
  await expect(showcaseOf(page)).toHaveAttribute('data-index', String(index));
  await expect(showcaseOf(page)).toHaveAttribute('data-settled', '1');
}

/** The furthest any drawn book stood from the middle of the stage over the next frames, in stage heights. */
function furthestTravel(page: Page, frames: number): Promise<number> {
  return page.evaluate(
    (count) =>
      new Promise<number>((resolve) => {
        let furthest = 0;
        let left = count;
        const look = (): void => {
          for (const book of document.querySelectorAll<HTMLElement>('.bb-showcase__book')) {
            furthest = Math.max(furthest, Math.abs(Number(book.dataset.offset ?? 0)));
          }
          if (--left > 0) requestAnimationFrame(look);
          else resolve(furthest);
        };
        requestAnimationFrame(look);
      }),
    frames,
  );
}

test.describe('Showcase', () => {
  test.skip(({ isMobile }) => isMobile, 'The wheel and the keys belong to a desktop.');

  test('is chosen from the View menu and shows one book with its details', async ({ page }) => {
    await openApp(page);
    await showShowcase(page);
    await expect(shelfOf(page)).toBeHidden();
    await expect(titleOf(page)).toHaveText(FIRST_EXAMPLE.title);
    await expect(ticksOf(page)).toHaveCount(EXAMPLE_COUNT);
    await expect(ticksOf(page).first()).toHaveAttribute('aria-current', 'true');
    await expect(ticksOf(page).nth(1)).toHaveAccessibleName(`2 of ${EXAMPLE_COUNT}: ${SECOND_EXAMPLE.title}`);
    await expect(showcaseOf(page).getByRole('button', { name: 'Read', exact: true })).toBeVisible();
    await expect(showcaseOf(page).getByRole('link', { name: /^Open original/ })).toBeVisible();
    await expect(showcaseOf(page).getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    // The view is remembered.
    await page.reload();
    await expect(showcaseOf(page)).toBeVisible();
  });

  test('one notch of the wheel moves one book', async ({ page }) => {
    await openApp(page);
    await showShowcase(page);
    await bookOf(page).hover();
    await page.mouse.wheel(0, 100);
    await expectAt(page, 1);
    await expect(titleOf(page)).toHaveText(SECOND_EXAMPLE.title);
    await expect(page.locator('#announcer')).toHaveText(`2 of ${EXAMPLE_COUNT}: ${SECOND_EXAMPLE.title}`);
    await page.mouse.wheel(0, -100);
    await expectAt(page, 0);
  });

  test('ArrowDown moves one book, and the other keys go where they say', async ({ page }) => {
    await openApp(page);
    await showShowcase(page);
    await bookOf(page).focus();
    await page.keyboard.press('ArrowDown');
    await expectAt(page, 1);
    await expect(bookOf(page)).toBeFocused();
    await page.keyboard.press('k');
    await expectAt(page, 0);
    await page.keyboard.press('End');
    await expectAt(page, EXAMPLE_COUNT - 1);
    await page.keyboard.press('Home');
    await expectAt(page, 0);
    await page.keyboard.press('PageDown');
    await expectAt(page, 5);
  });

  test('a tick jumps to its book', async ({ page }) => {
    await openApp(page);
    await showShowcase(page);
    await ticksOf(page).nth(8).click();
    await expectAt(page, 8);
    await expect(ticksOf(page).nth(8)).toHaveAttribute('aria-current', 'true');
    await expect(ticksOf(page).first()).not.toHaveAttribute('aria-current', 'true');
  });

  test('Read opens the reader and Escape returns to the showcase', async ({ page }) => {
    await openApp(page);
    await showShowcase(page);
    await expect(page.locator('#announcer')).toHaveText(`Showcase. 1 of ${EXAMPLE_COUNT}: ${FIRST_EXAMPLE.title}`);
    await bookOf(page).focus();
    await page.keyboard.press('ArrowDown');
    await expectAt(page, 1);
    const read = showcaseOf(page).getByRole('button', { name: 'Read', exact: true });
    await read.click();
    await expectReaderOpen(page);
    await expect(readerOf(page).getByRole('heading', { level: 1 })).toHaveText(SECOND_EXAMPLE.title);
    await page.keyboard.press('Escape');
    await expectReaderGone(page);
    await expect(showcaseOf(page)).toBeVisible();
    await expectAt(page, 1);
    await expect(titleOf(page)).toHaveText(SECOND_EXAMPLE.title);
    await expect(read).toBeFocused();
  });

  test('a book travels between two places on its way', async ({ page }) => {
    await openApp(page);
    await showShowcase(page);
    await bookOf(page).focus();
    await page.keyboard.press('ArrowDown');
    expect(await furthestTravel(page, 20)).toBeGreaterThan(0.2);
    await expectAt(page, 1);
  });
});

test.describe('Showcase with reduced motion', () => {
  test.skip(({ isMobile }) => isMobile, 'The keys belong to a desktop.');
  test.use({ reducedMotion: 'reduce' });

  test('changes book with no travel', async ({ page }) => {
    await openApp(page);
    await showShowcase(page);
    await bookOf(page).focus();
    await page.keyboard.press('ArrowDown');
    expect(await furthestTravel(page, 20)).toBe(0);
    await expectAt(page, 1);
    await expect(titleOf(page)).toHaveText(SECOND_EXAMPLE.title);
  });
});

test.describe('Showcase on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'A phone layout.');

  test('stands the book above its details', async ({ page }) => {
    await openApp(page);
    await viewButton(page).click();
    await page.getByRole('menu', { name: 'View' }).getByRole('menuitemradio', { name: 'Showcase', exact: true }).click();
    await expect(showcaseOf(page)).toBeVisible();
    const book = await bookOf(page).boundingBox();
    const title = await titleOf(page).boundingBox();
    expect(book && title && book.y + book.height <= title.y).toBe(true);
  });
});

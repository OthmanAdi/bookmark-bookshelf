import type { Locator, Page } from '@playwright/test';
import {
  HOMEWORK,
  LONG_EXAMPLE,
  LOOKUPS,
  READING,
  captionTitle,
  centredControl,
  expect,
  expectCentred,
  listRowFor,
  openApp,
  openShelf,
  readerOf,
  rowTitle,
  shelfTab,
  showList,
  test,
} from './fixtures';

const PANCAKES = { id: 'example-pancakes', title: 'Cookbook:Pancakes (North American)' } as const;

const searchField = (page: Page): Locator => page.getByRole('combobox', { name: 'Search your links' });
const results = (page: Page): Locator => page.getByRole('listbox').getByRole('option');
/** The field itself, also while a phone has folded it back into its button. */
const foldedField = (page: Page): Locator => page.locator('#search');

/** Brings focus to the search field: with its key where the field is in the bar, with its button on a phone. */
async function openSearch(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: 'Search your links' });
  if (await button.isVisible()) await button.click();
  else await page.keyboard.press('/');
  await expect(searchField(page)).toBeFocused();
}

test.describe('search', () => {
  test('typing finds a link on another shelf, and choosing it opens that shelf with the link in the centre', async ({ page }) => {
    await openApp(page);
    await openShelf(page, HOMEWORK.id);

    await openSearch(page);
    await searchField(page).pressSequentially('pancakes');
    await expect(results(page)).toHaveCount(1);
    // Each result says what it is, which shelf it is on and which site it goes to.
    await expect(results(page)).toContainText(PANCAKES.title);
    await expect(results(page)).toContainText(LOOKUPS.name);
    await expect(results(page)).toContainText('en.wikibooks.org');
    await expect(searchField(page)).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Enter');
    await expect(shelfTab(page, LOOKUPS.id)).toHaveAttribute('aria-pressed', 'true');
    await expectCentred(page, PANCAKES.id);
    await expect(captionTitle(page)).toHaveText(PANCAKES.title);
    await expect(foldedField(page)).toHaveValue('');
    await expect(results(page)).toHaveCount(0);
    // Focus arrives on the link that was asked for, ready for Enter.
    await expect(centredControl(page)).toBeFocused();
    await expect(readerOf(page)).toHaveCount(0);
  });

  test('with every shelf in view the row stays as it is and only travels to the link', async ({ page }) => {
    await openApp(page);
    await openSearch(page);
    await searchField(page).pressSequentially('squared paper');
    // Found by the words of the note; every word has to match.
    await expect(results(page)).toHaveCount(1);
    await expect(results(page)).toContainText(LONG_EXAMPLE.title);
    await expect(results(page)).toContainText(READING.name);

    await results(page).first().click();
    await expectCentred(page, LONG_EXAMPLE.id);
    await expect(shelfTab(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(captionTitle(page)).toHaveText(LONG_EXAMPLE.title);
  });

  test('at most eight results are listed, the arrow keys walk them, and Escape first closes the list and then leaves the field', async ({
    page,
  }) => {
    await openApp(page);
    await openSearch(page);
    await searchField(page).pressSequentially('org');
    await expect(results(page)).toHaveCount(8);
    await expect(page.getByRole('status').filter({ hasText: 'links found.' })).toHaveText('8 links found.');
    await expect(results(page).nth(0)).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('ArrowDown');
    await expect(results(page).nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(results(page).nth(0)).toHaveAttribute('aria-selected', 'false');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(results(page).nth(7)).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('Escape');
    await expect(results(page).first()).toBeHidden();
    await expect(searchField(page)).toHaveValue('org');
    await expect(searchField(page)).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(foldedField(page)).toHaveValue('');
    await expect(foldedField(page)).not.toBeFocused();
    expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
  });

  test('a search that finds nothing says so in words', async ({ page }) => {
    await openApp(page);
    await openSearch(page);
    await searchField(page).pressSequentially('qqqzzz');
    await expect(results(page)).toHaveCount(0);
    await expect(page.getByText('No links match “qqqzzz”.')).toBeVisible();
  });

  test('in the list a chosen result takes focus on its row', async ({ page }) => {
    await openApp(page);
    await showList(page);
    await openSearch(page);
    await searchField(page).pressSequentially('pancakes');
    await expect(results(page)).toHaveCount(1);
    await page.keyboard.press('Enter');

    const title = rowTitle(listRowFor(page, PANCAKES.id));
    await expect(title).toBeFocused();
    await expect(title).toBeInViewport();
    await expect(foldedField(page)).toHaveValue('');
  });
});

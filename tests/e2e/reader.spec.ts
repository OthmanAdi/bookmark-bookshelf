import type { Page } from '@playwright/test';
import {
  FIRST_EXAMPLE,
  READING,
  addLink,
  afterTwoFrames,
  centreOf,
  chooseInShelfMenu,
  closeReader,
  closeReaderButton,
  expect,
  expectCentred,
  expectReaderOpen,
  makeParagraphs,
  openApp,
  openCentredWithKeyboard,
  openShelf,
  pasteField,
  primaryAction,
  readSession,
  readerBody,
  readerOf,
  readerTitle,
  readout,
  reloadApp,
  scrollSheet,
  sheetOf,
  storedLibrary,
  test,
} from './fixtures';

const SIZES = [17, 19, 21, 24, 28];
const NOTES = 'My notes (they stay in this browser)';

const textSize = (page: Page): Promise<number> => readerBody(page).evaluate((body) => Math.round(Number.parseFloat(getComputedStyle(body).fontSize)));

/** The number of the first block of text that is not hidden under the bar. */
function blockAtTop(page: Page): Promise<number> {
  return readerOf(page).evaluate((reader) => {
    const bar = reader.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
    const blocks = [...reader.querySelectorAll<HTMLElement>('[data-block]')];
    const first = blocks.find((block) => block.getBoundingClientRect().bottom > bar + 1);
    return Number(first?.dataset['block'] ?? -1);
  });
}

test.describe('the reader', () => {
  test('the head of the page says when the link was saved, whose it is, why it was kept and where the original is', async ({ page }) => {
    await openApp(page);
    await addLink(page, { url: 'https://example.org/a-head-to-read', title: 'A head to read', note: 'Kept for the argument in part two.', readingText: makeParagraphs(50) });
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#editor').getByLabel('Author').fill('Ada Example');
    await page.locator('#editor').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#editor')).toBeHidden();
    await primaryAction(page).click();
    await expectReaderOpen(page);
    const reader = readerOf(page);

    // Fifty paragraphs of sixteen words are 800 words: four minutes at 220 words a minute.
    await expect(reader.getByText(/^Saved \d{1,2} [A-Z][a-z]{2} \d{4}, 4 min$/)).toBeVisible();
    await expect(readerTitle(page)).toHaveText('A head to read');
    await expect(reader.getByRole('article').getByText('Ada Example', { exact: true })).toBeVisible();
    await expect(reader.getByText('Kept for the argument in part two.')).toBeVisible();
    const original = reader.getByRole('link', { name: /^Open original/ });
    await expect(original).toHaveAccessibleName(/example\.org.*opens in a new tab/);
    await expect(reader.getByRole('button', { name: 'Edit text' })).toBeVisible();
    // The site is named once, on the button that goes there.
    await expect(reader.locator('header, article').getByText('example.org', { exact: true })).toHaveCount(1);

    // The bar: the way back on the left and the place on the right.
    const back = await closeReaderButton(page).boundingBox();
    const place = await readout(page).boundingBox();
    expect(back?.x ?? 0).toBeLessThan(place?.x ?? 0);
    await expect(readout(page)).toHaveText('0% read');
    // Once the title has scrolled away the bar says what is being read: by name, or by its cover on a phone.
    const wide = (page.viewportSize()?.width ?? 0) >= 900;
    const inBar = wide ? reader.locator('.bb-reader__bar-text') : reader.locator('.bb-reader__thumb');
    await expect(inBar).toBeHidden();
    await scrollSheet(page, 900);
    await expect(inBar).toBeVisible();
    if (wide) await expect(inBar).toHaveText('A head to read');
  });

  test('the two size buttons step through five sizes, keep the place, and the choice is remembered', async ({ page }) => {
    await openApp(page);
    await openCentredWithKeyboard(page);
    const smaller = readerOf(page).getByRole('button', { name: 'Smaller text' });
    const larger = readerOf(page).getByRole('button', { name: 'Larger text' });
    const start = await textSize(page);
    expect(SIZES).toContain(start);

    await scrollSheet(page, 700);
    const block = await blockAtTop(page);
    expect(block).toBeGreaterThan(0);

    // The bar stays where it is, so each button is pressed at its place on the screen.
    const largerAt = await centreOf(larger);
    const smallerAt = await centreOf(smaller);
    for (const size of SIZES.filter((entry) => entry > start)) {
      await page.mouse.click(largerAt.x, largerAt.y);
      await expect.poll(() => textSize(page)).toBe(size);
      // The same words stay at the top of the page.
      await expect.poll(() => blockAtTop(page)).toBe(block);
    }
    await expect(larger).toHaveAttribute('aria-disabled');
    expect((await readSession(page)).textScale).toBe(4);

    await reloadApp(page);
    await expectReaderOpen(page);
    expect(await textSize(page)).toBe(28);

    for (const size of [...SIZES].reverse().slice(1)) {
      await page.mouse.click(smallerAt.x, smallerAt.y);
      await expect.poll(() => textSize(page)).toBe(size);
    }
    await expect(smaller).toHaveAttribute('aria-disabled');
    await expect(larger).not.toHaveAttribute('aria-disabled');
  });

  test('moving along the bar with Tab leaves the text where it is', async ({ page }) => {
    await openApp(page);
    await openCentredWithKeyboard(page);
    await scrollSheet(page, 900);
    const block = await blockAtTop(page);
    const place = await readout(page).textContent();

    await page.keyboard.press('Tab');
    await expect(readerOf(page).getByRole('button', { name: 'Smaller text' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(readerOf(page).getByRole('button', { name: 'Larger text' })).toBeFocused();
    await afterTwoFrames(page);
    expect(await blockAtTop(page)).toBe(block);
    await expect(readout(page)).toHaveText(place ?? '');
  });

  test('my notes are saved as they are typed, stay with the link and stop at 2,000 characters', async ({ page }) => {
    await openApp(page);
    await openCentredWithKeyboard(page);
    const notes = readerOf(page).getByRole('textbox', { name: NOTES });
    await expect(notes).toBeHidden();
    await readerOf(page).getByText(NOTES).click();
    await expect(notes).toBeVisible();

    await notes.fill('Ask about the fragment part on Monday.');
    await expect.poll(async () => (await storedLibrary(page))?.notes[FIRST_EXAMPLE.id]).toBe('Ask about the fragment part on Monday.');
    await closeReader(page);

    await primaryAction(page).click();
    await expectReaderOpen(page);
    await readerOf(page).getByText(NOTES).click();
    await expect(notes).toHaveValue('Ask about the fragment part on Monday.');

    await notes.fill('n'.repeat(2400));
    await expect(notes).toHaveValue('n'.repeat(2000));
    await expect(readerOf(page).getByText('2000 of 2000 characters')).toBeVisible();
    await expect.poll(async () => (await storedLibrary(page))?.notes[FIRST_EXAMPLE.id]?.length).toBe(2000);
  });

  test('a shelf with a language sets it on the page, and the date is written in that language', async ({ page }) => {
    await openApp(page);
    await openShelf(page, READING.id);
    await chooseInShelfMenu(page, 'Describe');
    const about = page.getByRole('dialog', { name: `About ${READING.name}` });
    await about.getByLabel('Language of the texts').fill('de');
    await about.getByRole('button', { name: 'Save' }).click();
    await expect(about).toBeHidden();

    await openCentredWithKeyboard(page);
    await expect(readerOf(page).getByRole('article')).toHaveAttribute('lang', 'de');
    // German writes the day with a full stop: "9. Sept. 2026".
    await expect(readerOf(page).locator('time')).toHaveText(/^\d{1,2}\. \S+ \d{4}$/);
  });

  test('a change made in another tab does not discard text being typed here', async ({ page, context }) => {
    await openApp(page);
    const link = await addLink(page, { url: 'https://example.org/typing-in-progress', title: 'Typing in progress' });
    await primaryAction(page).click();
    await expectReaderOpen(page);
    await pasteField(page).fill('Half a paragraph that is not saved yet');

    // Meanwhile, in a second tab, another link is added to the same library.
    const other = await context.newPage();
    await openApp(other);
    // The second tab opens where the first one is, on the same page; it goes back to the shelf first.
    await expectReaderOpen(other);
    await closeReader(other);
    await addLink(other, { url: 'https://example.org/added-elsewhere', title: 'Added elsewhere' });
    await other.close();

    await page.bringToFront();
    await expect(pasteField(page)).toHaveValue('Half a paragraph that is not saved yet');
    await readerOf(page).getByRole('button', { name: 'Save text' }).click();
    await expect(readerBody(page).getByRole('paragraph')).toHaveText('Half a paragraph that is not saved yet');
    await closeReader(page);
    // Both changes are there: the text saved here and the link added in the other tab.
    const library = await storedLibrary(page);
    expect(library?.bookmarks.find((entry) => entry.id === link.id)?.reading?.text).toBe('Half a paragraph that is not saved yet');
    expect(library?.bookmarks.some((entry) => entry.title === 'Added elsewhere')).toBe(true);
    await expectCentred(page, link.id);
    expect(await sheetOf(page).count()).toBe(0);
  });
});

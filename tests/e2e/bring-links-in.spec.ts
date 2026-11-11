import type { Locator, Page } from '@playwright/test';
import {
  EXAMPLE_COUNT,
  LONG_EXAMPLE,
  READING,
  captionTitle,
  chooseInLibraryMenu,
  expect,
  expectSettled,
  expectTabCount,
  findStored,
  openApp,
  readLibrary,
  storedLibrary,
  test,
  toastsOf,
} from './fixtures';

/** A bookmarks file as browsers write it: two folders, one address that is already saved, two that cannot be used. */
const BOOKMARKS_FILE = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000" LAST_MODIFIED="1700000300">Cooking</H3>
    <DL><p>
        <DT><A HREF="https://example.org/bread" ADD_DATE="1700000100">A plain loaf</A>
        <DT><A HREF="https://example.org/soup" ADD_DATE="1700000200">Soup for a week</A>
        <DT><A HREF="javascript:alert(1)">Run this</A>
    </DL><p>
    <DT><H3>Courses</H3>
    <DL><p>
        <DT><A HREF="https://example.com/syllabus">Syllabus &amp; dates</A>
        <DT><A HREF="https://en.wikipedia.org/wiki/Commonplace_book">A copy of a link I already have</A>
        <DT><A HREF="place:sort=8">Most visited</A>
    </DL><p>
</DL><p>
`;

const PASTED_LIST = [
  '[A link written as Markdown](https://example.org/markdown)',
  'A piped line | https://example.org/piped | with a note',
  '- https://example.org/bare',
  '3. An extra - https://example.org/extra (optional) ~12 min',
  'just some words with no address',
  'https://en.wikipedia.org/wiki/Tsundoku',
].join('\n');

const tabsOf = (page: Page): Locator => page.locator('#tabs').getByRole('button');

async function openBringLinksIn(page: Page): Promise<Locator> {
  await chooseInLibraryMenu(page, 'Bring links in');
  const dialog = page.getByRole('dialog', { name: 'Bring links in' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('bring links in', () => {
  test('a browser bookmarks file with two folders is previewed with its counts and becomes two shelves', async ({ page, watched }) => {
    await openApp(page);
    const dialog = await openBringLinksIn(page);
    await expect(dialog.getByRole('tab', { name: 'Browser bookmarks' })).toHaveAttribute('aria-selected', 'true');
    const confirm = dialog.getByRole('button', { name: /^Add/ });
    await expect(confirm).toBeDisabled();

    await dialog.getByLabel('Bookmarks file').setInputFiles({ name: 'bookmarks.html', mimeType: 'text/html', buffer: Buffer.from(BOOKMARKS_FILE) });

    // The preview: how many, which shelves, what is already here, what is skipped and why.
    await expect(dialog.getByText('4 links in 2 shelves.')).toBeVisible();
    await expect(dialog.getByRole('listitem').filter({ hasText: 'Cooking, 2 links' })).toBeVisible();
    await expect(dialog.getByRole('listitem').filter({ hasText: 'Courses, 2 links' })).toBeVisible();
    await expect(dialog.getByText('1 is already saved and will be left as it is.')).toBeVisible();
    await expect(dialog.getByText('2 entries cannot be used and will be skipped:')).toBeVisible();
    await expect(dialog.getByRole('listitem').filter({ hasText: 'Run this: not a web address (javascript:)' })).toBeVisible();
    await expect(dialog.getByRole('listitem').filter({ hasText: 'Most visited: not a web address (place:)' })).toBeVisible();
    await expect(confirm).toHaveText('Add 3 links');
    await expect(confirm).toBeEnabled();

    // Nothing is saved before the one confirm.
    await expectTabCount(page, null, EXAMPLE_COUNT);
    await expect(tabsOf(page)).toHaveCount(4);
    expect(await storedLibrary(page)).toBeNull();

    await confirm.click();
    await expect(dialog).toBeHidden();
    await expect(toastsOf(page)).toContainText('Added 3 links on 2 new shelves. 1 was already saved and left as it was. 2 entries could not be used.');

    await expectTabCount(page, null, EXAMPLE_COUNT + 3);
    const cooking = page.locator('#tabs').getByRole('button', { name: 'Cooking' });
    const courses = page.locator('#tabs').getByRole('button', { name: 'Courses' });
    await expect(cooking).toHaveAccessibleDescription('2 links');
    await expect(courses).toHaveAccessibleDescription('1 link');
    // The app lands on the first shelf that arrived, on its first link.
    await expect(cooking).toHaveAttribute('aria-pressed', 'true');
    await expect(captionTitle(page)).toHaveText('A plain loaf');
    await expectSettled(page);

    const loaf = await findStored(page, 'A plain loaf');
    expect(loaf.url).toBe('https://example.org/bread');
    expect(loaf.addedAt).toBe(new Date(1700000100 * 1000).toISOString());
    expect((await findStored(page, 'Syllabus & dates')).url).toBe('https://example.com/syllabus');
    const library = await readLibrary(page);
    expect(library.bookmarks.filter((entry) => /^(javascript|place):/.test(entry.url))).toEqual([]);

    // The link that was already saved is exactly as it was: its own title, shelf, note and text.
    const kept = library.bookmarks.filter((entry) => entry.url === 'https://en.wikipedia.org/wiki/Commonplace_book');
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({
      id: LONG_EXAMPLE.id,
      title: LONG_EXAMPLE.title,
      shelfId: READING.id,
      note: 'Started mine on squared paper. Still going.',
      tags: ['notes', 'reading'],
    });
    expect(kept[0]?.updatedAt).toBe(kept[0]?.addedAt);
    expect(kept[0]?.reading?.text.length ?? 0).toBeGreaterThan(1000);

    expect(watched.outside, 'no request left the server under test').toEqual([]);
  });

  test('a pasted list becomes links on a new shelf, says what it could not read and leaves a saved link alone', async ({ page, watched }) => {
    await openApp(page);
    const dialog = await openBringLinksIn(page);
    await dialog.getByRole('tab', { name: 'Pasted list' }).click();
    const confirm = dialog.getByRole('button', { name: /^Add/ });

    await dialog.getByLabel('Your list, one link on each line').fill(PASTED_LIST);
    await expect(dialog.getByText('5 links found, 1 already saved.')).toBeVisible();
    await expect(dialog.getByText('A link that is already saved is left as it is.')).toBeVisible();
    await expect(dialog.getByText('1 line could not be read and will be left out:')).toBeVisible();
    await expect(dialog.getByRole('listitem').filter({ hasText: 'Line 5: just some words with no address' })).toBeVisible();
    await expect(confirm).toHaveText('Add 4 links');
    await expectTabCount(page, null, EXAMPLE_COUNT);

    await dialog.getByLabel('Add them to').selectOption({ label: 'A new shelf' });
    await dialog.getByLabel('Name of the new shelf').fill('From a message');
    await confirm.click();
    await expect(dialog).toBeHidden();
    await expect(toastsOf(page)).toContainText('Added 4 links');
    await expect(toastsOf(page)).toContainText('1 was already saved and left as it was.');

    const shelf = page.locator('#tabs').getByRole('button', { name: 'From a message' });
    await expect(shelf).toHaveAttribute('aria-pressed', 'true');
    await expect(shelf).toHaveAccessibleDescription('4 links');
    await expectTabCount(page, null, EXAMPLE_COUNT + 4);
    await expect(captionTitle(page)).toHaveText('A link written as Markdown');
    await expectSettled(page);

    const library = await readLibrary(page);
    const added = library.bookmarks.filter((entry) => entry.url.startsWith('https://example.org/')).sort((a, b) => a.order - b.order);
    expect(added.map((entry) => entry.url)).toEqual([
      'https://example.org/markdown',
      'https://example.org/piped',
      'https://example.org/bare',
      'https://example.org/extra',
    ]);
    expect(added[1]).toMatchObject({ title: 'A piped line', note: 'with a note' });
    expect(added[3]).toMatchObject({ title: 'An extra', required: false, minutes: 12 });
    // The address that was already saved is still one link, on its own shelf.
    const tsundoku = library.bookmarks.filter((entry) => entry.url === 'https://en.wikipedia.org/wiki/Tsundoku');
    expect(tsundoku).toHaveLength(1);
    expect(tsundoku[0]).toMatchObject({ id: 'example-tsundoku', title: 'Tsundoku', shelfId: READING.id });

    expect(watched.outside, 'no request left the server under test').toEqual([]);
  });

  test('a file dropped on the page opens the same preview, and Cancel saves nothing', async ({ page, watched }) => {
    await openApp(page);
    await page.evaluate((text) => {
      const data = new DataTransfer();
      data.items.add(new File([text], 'bookmarks.html', { type: 'text/html' }));
      for (const type of ['dragover', 'drop']) {
        document.body.dispatchEvent(new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }));
      }
    }, BOOKMARKS_FILE);

    const dialog = page.getByRole('dialog', { name: 'Bring links in' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('4 links in 2 shelves.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Add 3 links' })).toBeEnabled();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expectTabCount(page, null, EXAMPLE_COUNT);
    await expect(tabsOf(page)).toHaveCount(4);
    expect(await storedLibrary(page)).toBeNull();
    expect(watched.outside).toEqual([]);
  });

  test('a file that is not from this app is refused in words and nothing can be added', async ({ page }) => {
    await openApp(page);
    const dialog = await openBringLinksIn(page);
    await dialog.getByRole('tab', { name: 'Library or shelf file' }).click();
    await dialog.getByLabel('File', { exact: true }).setInputFiles({
      name: 'something.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ format: 'somebody-else', links: ['https://example.org/'] })),
    });
    await expect(dialog.getByText('That JSON file was not made by this app, so it cannot be brought in.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^Add/ })).toBeDisabled();
    await expectTabCount(page, null, EXAMPLE_COUNT);
  });
});

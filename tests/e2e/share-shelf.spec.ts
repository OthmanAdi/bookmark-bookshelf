import type { Browser, BrowserContext, Locator, Page } from '@playwright/test';
import {
  EXAMPLE_COUNT,
  FIRST_EXAMPLE,
  HOMEWORK,
  captionTitle,
  centredControl,
  chooseInLibraryMenu,
  chooseInShelfMenu,
  closeReader,
  expect,
  expectCentred,
  expectReaderOpen,
  expectSettled,
  expectTabCount,
  openApp,
  openCentredWithKeyboard,
  openShelf,
  primaryAction,
  readLibrary,
  readerBody,
  readerOf,
  readerTitle,
  scrollSheetToEnd,
  shelfOf,
  storedLibrary,
  test,
  toastsOf,
  watch,
  type Watch,
} from './fixtures';

const IMG = '<img src=x onerror="window.__xss=1">';
const SCRIPT = '<script>window.__xss=1</script>';
/** Right-to-left override: makes "gnp.exe" read as "exe.png" where it is not removed. */
const OVERRIDE = '‮';

const tabs = (page: Page): Locator => page.locator('#tabs').getByRole('button');
const arrival = (page: Page): Locator => page.getByRole('dialog', { name: 'A shelf has arrived' });
const ranScript = (page: Page): Promise<unknown> => page.evaluate(() => Reflect.get(window, '__xss'));

/** A second browser with nothing stored, set up like the one the test runs in. */
async function freshBrowser(browser: Browser): Promise<{ context: BrowserContext; page: Page; seen: Watch }> {
  const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = test.info().project.use;
  const context = await browser.newContext({ baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });
  const page = await context.newPage();
  return { context, page, seen: watch(context, page, baseURL ?? 'http://127.0.0.1') };
}

/** Reads the first homework link, marks it read and writes a private note, then makes the link for that shelf. */
async function shareHomework(page: Page): Promise<{ link: string; dialog: Locator }> {
  await openApp(page);
  await openShelf(page, HOMEWORK.id);
  await expectCentred(page, FIRST_EXAMPLE.id);
  await openCentredWithKeyboard(page);
  await readerOf(page).getByText('My notes (they stay in this browser)').click();
  await readerOf(page).getByRole('textbox', { name: 'My notes (they stay in this browser)' }).fill('A private thought about this text.');
  await scrollSheetToEnd(page);
  await readerOf(page).getByRole('button', { name: 'Mark as read' }).click();
  await expect.poll(async () => (await storedLibrary(page))?.notes[FIRST_EXAMPLE.id]).toBe('A private thought about this text.');
  await expect.poll(async () => Object.keys((await storedLibrary(page))?.done ?? {})).toEqual([FIRST_EXAMPLE.id]);
  await closeReader(page);

  await chooseInShelfMenu(page, 'Share this shelf');
  const dialog = page.getByRole('dialog', { name: `Share ${HOMEWORK.name}` });
  await expect(dialog).toBeVisible();
  const field = dialog.getByRole('textbox', { name: 'The link to this shelf' });
  await expect(field).toHaveValue(/#shelf=1\.[dr]\./);
  return { link: await field.inputValue(), dialog };
}

test.describe('share a shelf', () => {
  test('the dialog offers a file and a link, says how the link travels, and can leave out the texts', async ({ page, watched }) => {
    const { link, dialog } = await shareHomework(page);
    const field = dialog.getByRole('textbox', { name: 'The link to this shelf' });
    const fits = dialog.getByText(/^[\d,.]+ characters\. /);

    await expect(dialog.getByRole('heading', { name: 'As a file' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'As a link' })).toBeVisible();
    await expect(dialog.getByText('Your reading places, read marks and notes are never included.')).toBeVisible();
    // With the long text the link is too long for a chat message but fine for a browser.
    expect(link.length).toBeGreaterThan(1800);
    expect(link.length).toBeLessThanOrEqual(8000);
    await expect(fits).toHaveText(`${link.length.toLocaleString('en-US')} characters. Works in a browser. Some chat apps cut long links, so send the file there.`);

    await dialog.getByRole('checkbox', { name: 'Leave out the texts' }).check();
    await expect(fits).toContainText('Short enough to send in a chat message.');
    const short = await field.inputValue();
    expect(short.length).toBeLessThanOrEqual(1800);
    expect(short).not.toBe(link);

    // The file is named after the shelf and holds nothing personal.
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Save the shelf file' }).click();
    const saved = await download;
    expect(saved.suggestedFilename()).toBe('homework-how-the-web-works.shelf.json');
    await expect(dialog.getByText('Saved homework-how-the-web-works.shelf.json.')).toBeVisible();
    const stream = await saved.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8');
    const file = JSON.parse(text) as { format: string; shelf: Record<string, unknown>; volumes: Array<Record<string, unknown>> };
    expect(Object.keys(file).sort()).toEqual(['format', 'shelf', 'version', 'volumes']);
    expect(file.format).toBe('bookmark-bookshelf-shelf');
    expect(file.shelf).toMatchObject({ id: HOMEWORK.id, name: HOMEWORK.name, author: 'Your teacher (example)' });
    expect(file.volumes).toHaveLength(HOMEWORK.count);
    const allowed = ['id', 'url', 'title', 'author', 'note', 'tags', 'required', 'minutes', 'cover'];
    expect(file.volumes.flatMap((volume) => Object.keys(volume)).filter((key) => !allowed.includes(key))).toEqual([]);
    expect(file.volumes.filter((volume) => volume['required'] === false)).toHaveLength(2);
    expect(text).not.toContain('A private thought');

    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toBeHidden();
    expect(watched.outside, 'no request left the server under test').toEqual([]);
  });

  test('a shared link opened in another browser shows a preview, and accepting adds one shelf with nothing personal', async ({
    page,
    browser,
    watched,
  }) => {
    const { link } = await shareHomework(page);
    const other = await freshBrowser(browser);
    try {
      await other.page.goto(link);
      const preview = arrival(other.page);
      await expect(preview).toBeVisible();
      await expect(preview.getByRole('heading', { name: HOMEWORK.name })).toBeVisible();
      await expect(preview.getByText('From Your teacher (example), as written in the file. This is not verified.')).toBeVisible();
      await expect(preview.getByText('Read these in order before the due date.')).toBeVisible();
      await expect(preview.getByText(/^6 links, 4 required, about 1 h 17 min, due \S.*\d{4}$/)).toBeVisible();
      await expect(preview.getByRole('listitem')).toHaveText(['What is a URL?', 'Web Storage API', 'Link rot']);
      const hosts = preview.getByText(/developer\.mozilla\.org/);
      for (const host of ['en.wikipedia.org', 'web.archive.org', 'rfc-editor.org', 'de.wikipedia.org']) await expect(hosts).toContainText(host);
      await expect(preview.getByText('Nothing of yours is changed')).toBeVisible();
      // The safe answer has focus, and the address no longer carries the shelf.
      await expect(preview.getByRole('button', { name: 'Cancel' })).toBeFocused();
      expect(new URL(other.page.url()).hash).toBe('');
      // A link into an empty browser starts a library of its own, and nothing is added before the answer.
      await expect(tabs(other.page).filter({ hasText: HOMEWORK.name })).toHaveCount(0);
      await expectTabCount(other.page, null, 0);

      await preview.getByRole('button', { name: 'Add as a new shelf' }).click();
      await expect(preview).toBeHidden();
      await expect(toastsOf(other.page)).toContainText('Added as a new shelf. Nothing of yours was changed.');
      const tab = tabs(other.page).filter({ hasText: HOMEWORK.name });
      await expect(tab).toHaveAttribute('aria-pressed', 'true');
      await expect(tab).toHaveAccessibleDescription('6 links');
      await expectTabCount(other.page, null, HOMEWORK.count);
      // It opens on the first link to read, and the shelf line starts from nothing.
      await expect(captionTitle(other.page)).toHaveText(FIRST_EXAMPLE.title);
      await expect(other.page.getByText('Nothing read yet.')).toBeVisible();
      await expectSettled(other.page);
      // The sender had read this one, marked it and written a note. None of that came along.
      await expect(primaryAction(other.page)).toHaveText('Read');
      await expect(centredControl(other.page)).not.toHaveAccessibleName(/Marked as read|percent read/);

      const library = await readLibrary(other.page);
      const arrived = library.shelves.filter((shelf) => shelf.name === HOMEWORK.name);
      expect(arrived).toHaveLength(1);
      expect(arrived[0]?.origin).toMatchObject({ shelfId: HOMEWORK.id });
      expect(arrived[0]).toMatchObject({ author: 'Your teacher (example)' });
      expect(library.bookmarks).toHaveLength(HOMEWORK.count);
      expect(library.bookmarks.every((entry) => entry.shelfId === arrived[0]?.id)).toBe(true);
      // The links arrive in the sender's order, each with an id of its own and a note of where it came from.
      const inOrder = [...library.bookmarks].sort((a, b) => a.order - b.order);
      expect(inOrder.map((entry) => entry.title).slice(0, 3)).toEqual(['What is a URL?', 'Web Storage API', 'Link rot']);
      expect(library.bookmarks.map((entry) => entry.id)).not.toContain(FIRST_EXAMPLE.id);
      expect(inOrder[0]?.origin).toEqual({ shelfId: HOMEWORK.id, volumeId: FIRST_EXAMPLE.id });
      expect(library.bookmarks.filter((entry) => entry.required === false)).toHaveLength(2);
      expect(library.progress).toEqual({});
      expect(library.done).toEqual({});
      expect(library.notes).toEqual({});
      expect(JSON.stringify(library)).not.toContain('A private thought');

      // The text travelled with the link.
      await primaryAction(other.page).click();
      await expectReaderOpen(other.page);
      await expect(readerTitle(other.page)).toHaveText(FIRST_EXAMPLE.title);
      await expect(readerBody(other.page).getByRole('paragraph').first()).toContainText('A web address has at most five parts');
      // What arrived is the person's own link now, not one of the app's examples.
      await expect(readerOf(other.page).getByText('Example text written for this app.')).toHaveCount(0);
      await readerOf(other.page).getByText('My notes (they stay in this browser)').click();
      await expect(readerOf(other.page).getByRole('textbox', { name: 'My notes (they stay in this browser)' })).toHaveValue('');

      expect(other.seen.problems).toEqual([]);
      expect(other.seen.outside, 'no request left the server under test').toEqual([]);
    } finally {
      await other.context.close();
    }
    expect(watched.outside).toEqual([]);
  });

  test('accepting a shelf next to an existing library adds one shelf and changes nothing else', async ({ page, browser }) => {
    const { link } = await shareHomework(page);
    const other = await freshBrowser(browser);
    try {
      // This browser already has the examples, and one of them has been edited.
      await openApp(other.page);
      await other.page.getByRole('button', { name: 'Edit', exact: true }).click();
      await other.page.locator('#editor').getByRole('textbox', { name: 'Why you saved it' }).fill('My own reason.');
      await other.page.locator('#editor').getByRole('button', { name: 'Save', exact: true }).click();
      await expect(other.page.locator('#editor')).toBeHidden();
      const before = await readLibrary(other.page);

      // The link arrives the way links do: in a new tab.
      const tab = await other.context.newPage();
      await tab.goto(link);
      await arrival(tab).getByRole('button', { name: 'Add as a new shelf' }).click();
      await expect(arrival(tab)).toBeHidden();
      // A shelf of that name is here already, so the new one is told apart.
      const added = tabs(tab).filter({ hasText: `${HOMEWORK.name} (2)` });
      await expect(added).toHaveAttribute('aria-pressed', 'true');
      await expect(added).toHaveAccessibleDescription('6 links');
      await expectTabCount(tab, null, EXAMPLE_COUNT + HOMEWORK.count);
      await expectTabCount(tab, HOMEWORK.id, HOMEWORK.count);

      const after = await readLibrary(tab);
      expect(after.shelves).toHaveLength(before.shelves.length + 1);
      expect(after.shelves.filter((shelf) => before.shelves.some((old) => old.id === shelf.id))).toEqual(before.shelves);
      const kept = after.bookmarks.filter((entry) => before.bookmarks.some((old) => old.id === entry.id));
      expect(kept).toEqual(before.bookmarks);
      expect(after.bookmarks).toHaveLength(before.bookmarks.length + HOMEWORK.count);
      expect(after.progress).toEqual(before.progress);
      expect(after.done).toEqual(before.done);
      expect(after.notes).toEqual(before.notes);
      expect(other.seen.outside, 'no request left the server under test').toEqual([]);
    } finally {
      await other.context.close();
    }
  });

  test('declining the preview adds nothing', async ({ page, browser }) => {
    const { link } = await shareHomework(page);
    const other = await freshBrowser(browser);
    try {
      await other.page.goto(link);
      await arrival(other.page).getByRole('button', { name: 'Cancel' }).click();
      await expect(arrival(other.page)).toBeHidden();
      await expectTabCount(other.page, null, 0);
      await expect(tabs(other.page).filter({ hasText: HOMEWORK.name })).toHaveCount(0);
      expect((await storedLibrary(other.page))?.bookmarks ?? []).toEqual([]);
    } finally {
      await other.context.close();
    }
  });

  test('a link that was cut short says so and adds nothing', async ({ page, browser }) => {
    const { link } = await shareHomework(page);
    const other = await freshBrowser(browser);
    try {
      for (const damaged of [link.slice(0, link.length - 60), `${link.slice(0, link.indexOf('#shelf=') + 14)}`, link.replace('#shelf=1.', '#shelf=9.')]) {
        await other.page.goto('/index.html');
        await other.page.goto(damaged);
        const notice = other.page.getByRole('dialog', { name: 'This shelf link cannot be opened' });
        await expect(notice).toBeVisible();
        await expect(notice.getByText(/^This link (is damaged or incomplete|was made by a newer version)/)).toBeVisible();
        await expect(arrival(other.page)).toHaveCount(0);
        await notice.getByRole('button', { name: 'OK' }).click();
        await expect(notice).toBeHidden();
        await expectTabCount(other.page, null, 0);
      }
      expect(other.seen.problems).toEqual([]);
      expect(other.seen.outside, 'no request left the server under test').toEqual([]);
    } finally {
      await other.context.close();
    }
  });

  test('a hostile shelf file is shown as plain text, loses what it must not carry, and runs nothing', async ({ page, watched }) => {
    const hostile = {
      format: 'bookmark-bookshelf-shelf',
      version: 1,
      shelf: { id: 'constructor', name: IMG, description: `Homework for week 3 ${OVERRIDE}gnp.exe`, author: SCRIPT, revision: 1 },
      volumes: [
        { id: '__proto__', url: 'https://example.org/proto', title: 'An id that must not be used' },
        {
          id: 'constructor',
          url: 'https://example.org/markup',
          title: SCRIPT,
          note: '<b onmouseover="window.__xss=1">hover me</b>',
          text: `${IMG}\n\n[run](javascript:window.__xss=1)\n\n${SCRIPT}`,
        },
        { id: 'toString', url: 'javascript:window.__xss=1', title: 'A script for an address' },
        { id: 'override', url: 'https://example.org/override', title: `invoice${OVERRIDE}fdp.exe` },
        { id: 'long', url: 'https://example.org/long', title: 'x'.repeat(5000) },
        { id: 'credentials', url: 'https://user:secret@example.org/private', title: 'Carries a password' },
        { id: 'hasOwnProperty', url: 'https://example.org/cover', title: 'A cover that is not one', cover: { cloth: '"><script>', pattern: '../../x', seed: 1e99 } },
      ],
    };

    await openApp(page);
    await chooseInLibraryMenu(page, 'Bring links in');
    const bring = page.getByRole('dialog', { name: 'Bring links in' });
    await bring.getByRole('tab', { name: 'Library or shelf file' }).click();
    await bring.getByLabel('File', { exact: true }).setInputFiles({ name: 'homework.shelf.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(hostile)) });

    // What arrived is shown as written, as text, with the sender marked as not verified.
    const preview = arrival(page);
    await expect(preview).toBeVisible();
    await expect(preview.getByRole('heading', { name: IMG })).toBeVisible();
    await expect(preview.getByText(`From ${SCRIPT}, as written in the file. This is not verified.`)).toBeVisible();
    await expect(preview.getByText('Homework for week 3 gnp.exe')).toBeVisible();
    await expect(preview.getByText(/^3 links\b/)).toBeVisible();
    await expect(preview.getByText('4 entries in the file could not be used and will be left out.')).toBeVisible();
    await expect(preview.getByRole('listitem')).toHaveText([SCRIPT, 'invoicefdp.exe', 'A cover that is not one']);
    await expect(preview.getByText('example.org', { exact: true })).toBeVisible();
    await expect(preview.locator('img, script, b')).toHaveCount(0);
    expect(await preview.evaluate((dialog) => dialog.textContent?.includes('‮'))).toBe(false);

    await preview.getByRole('button', { name: 'Add as a new shelf' }).click();
    await expect(preview).toBeHidden();
    const tab = tabs(page).filter({ hasText: IMG });
    await expect(tab).toHaveAttribute('aria-pressed', 'true');
    await expect(tab).toHaveAccessibleDescription('3 links');
    await expect(captionTitle(page)).toHaveText(SCRIPT);
    await expectSettled(page);
    await expect(page.locator('img[src="x"], #tabs script, .bb-shelf script, main b')).toHaveCount(0);

    // Stored: three links under fresh ids, safe addresses only, covers the app understands.
    const library = await readLibrary(page);
    const shelf = library.shelves.find((entry) => entry.name === IMG);
    const arrived = library.bookmarks.filter((entry) => entry.shelfId === shelf?.id);
    expect(arrived.map((entry) => entry.url)).toEqual(['https://example.org/markup', 'https://example.org/override', 'https://example.org/cover']);
    expect(arrived.map((entry) => entry.id).filter((id) => ['constructor', '__proto__', 'toString', 'hasOwnProperty'].includes(id))).toEqual([]);
    expect(library.bookmarks).toHaveLength(EXAMPLE_COUNT + 3);
    for (const entry of arrived) {
      expect(entry.cover.cloth).toMatch(/^[a-z0-9-]{1,24}$/);
      expect(entry.cover.pattern).toMatch(/^[a-z0-9-]{1,24}$/);
      expect(Number.isInteger(entry.cover.seed) && entry.cover.seed >= 0 && entry.cover.seed <= 2147483647).toBe(true);
    }
    expect(JSON.stringify(library)).not.toContain(OVERRIDE);
    expect(await page.evaluate(() => Object.keys(Object.prototype))).toEqual([]);

    // In the reader the text is text, and the script address is not a link.
    await shelfOf(page).locator('.bb-book.is-centre .bb-book__control').focus();
    await page.keyboard.press('Enter');
    await expectReaderOpen(page);
    await expect(readerTitle(page)).toHaveText(SCRIPT);
    await expect(readerBody(page)).toContainText(IMG);
    await expect(readerBody(page)).toContainText(SCRIPT);
    await expect(readerOf(page).getByText('<b onmouseover="window.__xss=1">hover me</b>')).toBeVisible();
    await expect(readerOf(page).locator('img, script, b, [href^="javascript:"]')).toHaveCount(0);

    expect(await ranScript(page)).toBeUndefined();
    expect(watched.outside, 'no request left the server under test').toEqual([]);
  });

  test('a shelf file with an oversized field or an unusable id is refused whole', async ({ page, watched }) => {
    await openApp(page);
    const refusals: Array<[shelf: Record<string, unknown>, message: string]> = [
      [{ id: 'week-3', name: 'Week 3', description: 'd'.repeat(501), revision: 1 }, 'The description can have at most 500 characters.'],
      [{ id: 'week-3', name: 'Week 3', author: 'a'.repeat(81), revision: 1 }, 'The author can have at most 80 characters.'],
      [{ id: '__proto__', name: 'Week 3', revision: 1 }, 'The shelf in the file has no usable id.'],
      [{ id: 'week-3', name: 'Week 3', lang: 'en"><script>', revision: 1 }, 'The language can only hold letters, digits and hyphens, up to 12 characters.'],
    ];
    await chooseInLibraryMenu(page, 'Bring links in');
    const bring = page.getByRole('dialog', { name: 'Bring links in' });
    await bring.getByRole('tab', { name: 'Library or shelf file' }).click();
    for (const [shelf, message] of refusals) {
      const file = { format: 'bookmark-bookshelf-shelf', version: 1, shelf, volumes: [{ id: 'one', url: 'https://example.org/one', title: 'One' }] };
      await bring.getByLabel('File', { exact: true }).setInputFiles({ name: 'week-3.shelf.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
      await expect(bring.getByText(message)).toBeVisible();
      await expect(bring.getByRole('button', { name: /^Add/ })).toBeDisabled();
      await expect(arrival(page)).toHaveCount(0);
    }
    await bring.getByRole('button', { name: 'Cancel' }).click();
    await expect(bring).toBeHidden();
    await expectTabCount(page, null, EXAMPLE_COUNT);
    await expect(tabs(page)).toHaveCount(4);
    expect(await storedLibrary(page)).toBeNull();
    expect(watched.outside, 'no request left the server under test').toEqual([]);
  });
});

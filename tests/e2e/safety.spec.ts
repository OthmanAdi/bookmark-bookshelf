import type { Page } from '@playwright/test';
import {
  addLink,
  captionTitle,
  centredControl,
  expect,
  expectReaderOpen,
  listOf,
  listRows,
  openApp,
  pasteField,
  primaryAction,
  readerBody,
  readerOf,
  readerTitle,
  showList,
  test,
} from './fixtures';

const IMG_PAYLOAD = '<img src=x onerror="window.__xss=1">';
const SCRIPT_PAYLOAD = '<script>window.__xss=1</script>';

const ranScript = (page: Page): Promise<unknown> => page.evaluate(() => Reflect.get(window, '__xss'));

/** The pages of the site. Only the first is the app; the rest are the homepage and the small examples. */
const PAGES = ['/app.html', '/index.html', '/examples/shelf-only.html', '/examples/reader-only.html', '/examples/store-only.html'];

test.describe('safety', () => {
  test('markup in a title and a text is shown as text and never runs', async ({ page }) => {
    await openApp(page);
    const bookmark = await addLink(page, {
      url: 'https://example.org/markup',
      title: IMG_PAYLOAD,
      readingText: `${IMG_PAYLOAD}\n\n${SCRIPT_PAYLOAD}\n\nA plain closing paragraph.`,
    });
    expect(bookmark.title).toBe(IMG_PAYLOAD);

    // On the shelf the caption, the spine and the accessible name carry the text; no element was created.
    await expect(captionTitle(page)).toHaveText(IMG_PAYLOAD);
    await expect(page.locator('.bb-book.is-centre .bb-spine__title')).toHaveText(IMG_PAYLOAD);
    await expect(centredControl(page)).toHaveAccessibleName(new RegExp(`^${IMG_PAYLOAD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    await expect(page.locator('.bb-shelf script')).toHaveCount(0);

    await expect(primaryAction(page)).toHaveText('Read');
    await primaryAction(page).click();
    await expectReaderOpen(page);
    await expect(readerTitle(page)).toHaveText(IMG_PAYLOAD);
    await expect(readerBody(page)).toContainText(IMG_PAYLOAD);
    await expect(readerBody(page)).toContainText(SCRIPT_PAYLOAD);
    await expect(readerOf(page).locator('img, script')).toHaveCount(0);

    expect(await ranScript(page)).toBeUndefined();
  });

  test('the list shows the same markup as text', async ({ page }) => {
    await openApp(page);
    await addLink(page, { url: 'https://example.org/markup-list', title: IMG_PAYLOAD, note: SCRIPT_PAYLOAD, readingText: SCRIPT_PAYLOAD });
    await showList(page);
    await expect(listRows(page).filter({ hasText: IMG_PAYLOAD })).toHaveCount(1);
    await expect(listRows(page).filter({ hasText: SCRIPT_PAYLOAD })).toHaveCount(1);
    await expect(listOf(page).locator('img, script')).toHaveCount(0);
    expect(await ranScript(page)).toBeUndefined();
  });

  test('markup pasted into the reader is shown as text too', async ({ page }) => {
    await openApp(page);
    await addLink(page, { url: 'https://example.org/paste-markup', title: 'Pasted markup' });
    await expect(primaryAction(page)).toHaveText('Add text');
    await primaryAction(page).click();
    await expectReaderOpen(page);
    await pasteField(page).fill(`${IMG_PAYLOAD}\n\n${SCRIPT_PAYLOAD}`);
    await readerOf(page).getByRole('button', { name: 'Save text' }).click();
    await expect(readerBody(page)).toContainText(SCRIPT_PAYLOAD);
    await expect(readerBody(page)).toContainText(IMG_PAYLOAD);
    await expect(readerOf(page).locator('img, script')).toHaveCount(0);
    expect(await ranScript(page)).toBeUndefined();
  });

  test('a link in a saved text shows where it really goes and opens safely', async ({ page }) => {
    await openApp(page);
    await addLink(page, {
      url: 'https://example.org/links-in-text',
      title: 'Links in a text',
      readingText: 'See [the standard](https://example.com/standard) and [example.org/safe](https://example.net/elsewhere) and [run](javascript:alert(1)).',
    });
    await primaryAction(page).click();
    await expectReaderOpen(page);

    const links = readerBody(page).getByRole('link');
    await expect(links).toHaveCount(2);
    for (const link of await links.all()) {
      await expect(link).toHaveAttribute('href', /^https:\/\//);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', /noopener/);
      await expect(link).toHaveAttribute('rel', /noreferrer/);
      await expect(link).toHaveAccessibleName(/opens in a new tab/);
    }
    // The real host stands after the link text, and a label that looks like another address is marked.
    await expect(readerBody(page)).toContainText('example.com');
    await expect(readerBody(page)).toContainText('Goes to example.net');
    await expect(readerBody(page).locator('[href^="javascript:"]')).toHaveCount(0);
  });

  for (const address of PAGES) {
    test(`${address} carries a content security policy that allows its own origin only`, async ({ page }) => {
      await page.goto(address);
      const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
      expect(policy, 'the page has a policy').toBeTruthy();
      const directives = new Map(
        (policy ?? '')
          .split(';')
          .map((part) => part.trim().split(/\s+/))
          .map(([name = '', ...sources]) => [name, sources] as const),
      );
      expect(directives.get('default-src')).toEqual(["'self'"]);
      expect(directives.get('object-src')).toEqual(["'none'"]);
      expect(directives.get('script-src') ?? []).not.toContain("'unsafe-inline'");
      // No directive names another host, and nothing may be evaluated from text.
      const sources = [...directives.values()].flat();
      expect(sources.filter((source) => /^(https?:|wss?:|\*)/.test(source))).toEqual([]);
      expect(sources).not.toContain("'unsafe-eval'");
    });
  }
});

import type { Locator, Page } from '@playwright/test';
import {
  LOOKS,
  SECOND_EXAMPLE,
  captionLine,
  captionTitle,
  centredControl,
  chooseLook,
  expect,
  expectCentred,
  expectSettled,
  focusId,
  openApp,
  primaryAction,
  reloadApp,
  shelfOf,
  shelfTab,
  test,
  viewButton,
} from './fixtures';

type Rgb = [red: number, green: number, blue: number];

/** Asks the browser what a CSS colour comes to, whatever notation the stylesheet used. */
function toRgb(page: Page, colour: string): Promise<Rgb> {
  return page.evaluate((value) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('no canvas');
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
    return [red, green, blue] as [number, number, number];
  }, colour);
}

/** Relative luminance as WCAG defines it: 0 is black, 1 is white. */
function luminance([red, green, blue]: Rgb): number {
  const linear = (channel: number): number => {
    const share = channel / 255;
    return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

function contrast(one: Rgb, other: Rgb): number {
  const [light, dark] = [luminance(one), luminance(other)].sort((a, b) => b - a) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** The colour of an element's text and the first solid colour behind it. */
async function colours(page: Page, element: Locator): Promise<{ text: Rgb; ground: Rgb }> {
  const found = await element.evaluate((node) => {
    const solid = (value: string): boolean => !/^(transparent|rgba\(.*,\s*0\))$/.test(value);
    let behind: Element | null = node;
    let ground = 'rgb(255, 255, 255)';
    while (behind) {
      const value = getComputedStyle(behind).backgroundColor;
      if (solid(value)) {
        ground = value;
        break;
      }
      behind = behind.parentElement;
    }
    return { text: getComputedStyle(node).color, ground };
  });
  return { text: await toRgb(page, found.text), ground: await toRgb(page, found.ground) };
}

const pageGround = async (page: Page): Promise<Rgb> => toRgb(page, await page.locator('body').evaluate((body) => getComputedStyle(body).backgroundColor));

/** Notes every look the page wears while it loads, starting before anything is drawn. */
async function noteLooksWhileLoading(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const looks: string[] = [];
    Reflect.set(window, '__looks', looks);
    const note = (): void => {
      const look = document.documentElement.getAttribute('data-variant');
      if (look !== null && looks.at(-1) !== look) looks.push(look);
    };
    new MutationObserver(note).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-variant'] });
    document.addEventListener('DOMContentLoaded', note);
  });
}

const looksWhileLoading = (page: Page): Promise<string[]> => page.evaluate(() => Reflect.get(window, '__looks') as string[]);

test.describe('looks', () => {
  test('the View menu offers four looks, each summed up in a line, and marks the one in use', async ({ page }) => {
    await openApp(page);
    await viewButton(page).click();
    const looks = page.getByRole('group', { name: 'Look' }).getByRole('menuitemradio');
    await expect(looks).toHaveCount(LOOKS.length);
    for (const look of LOOKS) {
      const item = page.getByRole('menuitemradio', { name: look.label, exact: true });
      await expect(item).toBeVisible();
      await expect(item).toHaveAccessibleDescription(/\w+ \w+ \w+/);
      await expect(item).toHaveAttribute('aria-checked', String(look.name === 'paper'));
    }
    await page.keyboard.press('Escape');
    await expect(viewButton(page)).toBeFocused();
  });

  test('every look dresses the row and the page and keeps the same link in the centre', async ({ page }) => {
    await openApp(page);
    await centredControl(page).focus();
    await page.keyboard.press('ArrowRight');
    await expectCentred(page, SECOND_EXAMPLE.id);

    for (const look of ['oak', 'night', 'pocket', 'paper'] as const) {
      await chooseLook(page, look);
      await expect(shelfOf(page)).toHaveAttribute('data-variant', look);
      await expect(page.locator('html')).toHaveAttribute('data-variant', look);
      await expect(page.locator('.bb-book.is-centre')).toHaveCount(1);
      await expectCentred(page, SECOND_EXAMPLE.id);
      await expect(captionTitle(page)).toHaveText(SECOND_EXAMPLE.title);
    }
  });

  test('Night Study is dark from the page to the browser bar, and every look keeps its words readable', async ({ page }) => {
    await openApp(page);
    for (const look of LOOKS) {
      if (look.name !== 'paper') await chooseLook(page, look.name);
      const ground = await pageGround(page);
      const themeColour = (await page.locator('meta[name="theme-color"]').getAttribute('content')) ?? '';
      // The browser's own bar takes the colour of the page.
      expect(await toRgb(page, themeColour), `${look.label}: the browser bar follows the page`).toEqual(ground);
      const scheme = await page.locator('html').evaluate((root) => getComputedStyle(root).colorScheme);
      if (look.name === 'night') {
        expect(luminance(ground), 'Night Study has a dark page').toBeLessThan(0.1);
        expect(scheme).toContain('dark');
      } else {
        expect(scheme).not.toBe('dark');
      }

      for (const [name, element, least] of [
        ['the title under the row', captionTitle(page), 4.5],
        ['the line under the title', captionLine(page), 4.5],
        ['the main action', primaryAction(page), 4.5],
        ['the open tab', shelfTab(page), 4.5],
        ['the View button', viewButton(page), 4.5],
      ] as const) {
        const { text, ground: behind } = await colours(page, element);
        expect(contrast(text, behind), `${look.label}: ${name}`).toBeGreaterThanOrEqual(least);
      }
    }
  });

  test('a chosen look survives a reload', async ({ page }) => {
    test.fixme(true, 'Until a link has been added or changed, a reload puts the look back to Paper Row (or to Night Study where the system is dark).');
    await openApp(page);
    for (const look of ['oak', 'night', 'pocket', 'paper'] as const) {
      await chooseLook(page, look);
      await reloadApp(page);
      await expect(shelfOf(page)).toHaveAttribute('data-variant', look);
      await expect(page.locator('html')).toHaveAttribute('data-variant', look);
      await expect(page.locator('.bb-book.is-centre')).toHaveCount(1);
      expect(await focusId(page)).not.toBe('');
      await expectSettled(page);
    }
  });

  test('the page loads in the chosen look and never in another one first', async ({ page }) => {
    test.fixme(true, 'A reload first paints Paper Row (or Night Study where the system is dark) and then changes to the chosen look.');
    await noteLooksWhileLoading(page);
    await openApp(page);
    expect(await looksWhileLoading(page)).toEqual(['paper']);
    await chooseLook(page, 'oak');
    await reloadApp(page);
    expect(await looksWhileLoading(page)).toEqual(['oak']);
  });

  test.describe('where the system is dark', () => {
    test.use({ colorScheme: 'dark' });

    test('a first visit opens in Night Study without painting another look first', async ({ page }) => {
      await noteLooksWhileLoading(page);
      await openApp(page);
      expect(await looksWhileLoading(page)).toEqual(['night']);
      await expect(shelfOf(page)).toHaveAttribute('data-variant', 'night');
      expect(luminance(await pageGround(page))).toBeLessThan(0.1);
    });

    test('choosing a light look is kept after a reload', async ({ page }) => {
      test.fixme(true, 'Where the system is dark, a reload goes back to Night Study until a link has been added or changed.');
      await openApp(page);
      await chooseLook(page, 'paper');
      await reloadApp(page);
      await expect(shelfOf(page)).toHaveAttribute('data-variant', 'paper');
    });
  });
});

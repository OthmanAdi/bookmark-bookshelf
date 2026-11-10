import { expect, type Locator, type Page } from '@playwright/test';
import type { Bookmark, LibraryV1 } from '../../src/store';

export const LIBRARY_KEY = 'bookmark-bookshelf:library';
export const SAMPLE_COUNT = 14;
/** The long sample with a reading copy. It is the first volume of a fresh library. */
export const LONG_SAMPLE = { id: 'bm-tsundoku', title: 'On Piles of Unread Books' } as const;
/** A sample that has only a link and no reading copy. */
export const LINK_ONLY_SAMPLE = { id: 'bm-internet-archive', title: 'A Library of Snapshots' } as const;

/* ---------- locators ---------- */

export const shelfOf = (page: Page): Locator => page.locator('.bb-shelf');
export const readerOf = (page: Page): Locator => page.locator('.bb-reader');
export const sheetOf = (page: Page): Locator => page.locator('.bb-reader__sheet');
export const controlFor = (page: Page, id: string): Locator => page.locator(`.bb-book[data-id="${id}"] .bb-book__control`);
export const centredControl = (page: Page): Locator => page.locator('.bb-book.is-centre .bb-book__control');
export const captionTitle = (page: Page): Locator => page.locator('.bb-shelf__title');
export const actionsOf = (page: Page): Locator => page.locator('.bb-shelf__actions');

/* ---------- waiting ---------- */

export async function expectSettled(page: Page): Promise<void> {
  await expect(shelfOf(page)).toHaveAttribute('data-settled', '1');
}

export async function expectReaderOpen(page: Page): Promise<void> {
  await expect(readerOf(page)).toHaveAttribute('data-open', '1');
  await expect(shelfOf(page)).toHaveAttribute('data-open', '1');
}

export async function expectReaderGone(page: Page): Promise<void> {
  await expect(readerOf(page)).toHaveCount(0);
  await expect(shelfOf(page)).toHaveAttribute('data-open', '0');
  await expectSettled(page);
}

/* ---------- navigation ---------- */

/** Opens the app and waits until the shelf is drawn and at rest. */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/app.html');
  await expect(shelfOf(page)).toBeVisible();
  await expectSettled(page);
}

export async function reloadApp(page: Page): Promise<void> {
  await page.reload();
  await expect(shelfOf(page)).toBeVisible();
  await expectSettled(page);
}

/* ---------- shelf state ---------- */

export async function focusIndex(page: Page): Promise<number> {
  return Number(await shelfOf(page).getAttribute('data-focus'));
}

export async function focusId(page: Page): Promise<string> {
  return (await shelfOf(page).getAttribute('data-focus-id')) ?? '';
}

/** Presses ArrowRight on the centred volume until `id` is centred, waiting for rest after every step. */
export async function stepTo(page: Page, id: string): Promise<void> {
  await centredControl(page).focus();
  for (let guard = 0; guard < SAMPLE_COUNT && (await focusId(page)) !== id; guard++) {
    const before = await focusId(page);
    await page.keyboard.press('ArrowRight');
    await expect(shelfOf(page)).not.toHaveAttribute('data-focus-id', before);
    await expectSettled(page);
  }
  expect(await focusId(page)).toBe(id);
}

/* ---------- stored library ---------- */

export async function readLibrary(page: Page): Promise<LibraryV1> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), LIBRARY_KEY);
  expect(raw, 'the library is stored').not.toBeNull();
  return JSON.parse(raw ?? '{}') as LibraryV1;
}

export async function findStored(page: Page, title: string): Promise<Bookmark> {
  const found = (await readLibrary(page)).bookmarks.find((entry) => entry.title === title);
  expect(found, `a stored bookmark titled "${title}"`).toBeDefined();
  return found as Bookmark;
}

/* ---------- reader ---------- */

export async function openCentredWithKeyboard(page: Page): Promise<void> {
  await centredControl(page).focus();
  await page.keyboard.press('Enter');
  await expectReaderOpen(page);
}

export async function closeReader(page: Page): Promise<void> {
  await page.locator('.bb-reader__close').click();
  await expectReaderGone(page);
}

/** Closes a reader that was mounted without the shelf (the examples) and waits for it to be removed. */
export async function closeReaderByButton(page: Page): Promise<void> {
  await page.locator('.bb-reader__close').click();
  await expect(page.locator('.bb-reader')).toHaveCount(0);
}

export async function readoutPercent(page: Page): Promise<number> {
  const text = (await page.locator('.bb-reader__readout').textContent()) ?? '';
  return Number.parseInt(text, 10);
}

/** Scrolls the reader sheet to a fixed offset and waits until the readout has caught up. Returns the offset reached. */
export async function scrollSheet(page: Page, top: number): Promise<number> {
  const reached = await sheetOf(page).evaluate((sheet, target) => {
    sheet.scrollTop = target;
    return sheet.scrollTop;
  }, top);
  await expect.poll(() => readoutPercent(page)).toBeGreaterThan(0);
  return reached;
}

/** Waits until the stored progress of a bookmark is above zero, so a reload cannot lose it. */
export async function expectProgressStored(page: Page, id: string): Promise<void> {
  await expect
    .poll(async () => {
      const library = await readLibrary(page);
      return library.progress[id]?.percent ?? 0;
    })
    .toBeGreaterThan(0);
}

/* ---------- adding links through the dialog ---------- */

export interface NewLink {
  url: string;
  title?: string;
  readingText?: string;
  shelfId?: string;
}

export async function fillEditor(page: Page, link: NewLink): Promise<void> {
  const editor = page.locator('#editor');
  await expect(editor).toBeVisible();
  await editor.locator('[name="url"]').fill(link.url);
  if (link.title !== undefined) await editor.locator('[name="title"]').fill(link.title);
  if (link.shelfId !== undefined) await editor.locator('[name="shelfId"]').selectOption(link.shelfId);
  if (link.readingText !== undefined) await editor.locator('[name="readingText"]').fill(link.readingText);
}

/** Adds a link through the dialog. Resolves with the new bookmark once it is centred and the shelf is at rest. */
export async function addLink(page: Page, link: NewLink): Promise<Bookmark> {
  await page.locator('#add').click();
  await fillEditor(page, link);
  await page.locator('#editor-save').click();
  await expect(page.locator('#editor')).not.toBeVisible();
  const library = await readLibrary(page);
  const created = library.bookmarks.find((entry) => entry.url.startsWith(link.url) && (!link.title || entry.title === link.title));
  expect(created, 'the new bookmark is stored').toBeDefined();
  const bookmark = created as Bookmark;
  // The centre changes while the shelf is still moving, so wait for it first and for rest second.
  await expect(shelfOf(page)).toHaveAttribute('data-focus-id', bookmark.id);
  await expectSettled(page);
  return bookmark;
}

/** Many short paragraphs, so the sheet is tall enough to scroll on any screen. */
export function makeParagraphs(count: number): string {
  return Array.from(
    { length: count },
    (_, index) => `Paragraph ${index + 1}. A short original line, kept brief on purpose, so that the reading copy grows tall.`,
  ).join('\n\n');
}

/* ---------- page checks ---------- */

export async function noHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

/* ---------- pointer helpers ---------- */

export interface Point {
  x: number;
  y: number;
}

export async function centreOf(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  expect(box, 'the element has a box').not.toBeNull();
  const { x, y, width, height } = box as NonNullable<typeof box>;
  return { x: x + width / 2, y: y + height / 2 };
}

/** A real mouse drag in several steps, starting at `from` and moving `dx` pixels sideways. */
export async function mouseDrag(page: Page, from: Point, dx: number, steps = 12): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y, { steps });
  await page.mouse.up();
}

/** Horizontal offset of the centred volume inside the row. It is the same at every rest on a whole index. */
export async function centreOffset(page: Page): Promise<number> {
  return page.locator('.bb-book.is-centre').evaluate((book) => new DOMMatrix(getComputedStyle(book).transform).m41);
}

/** Resolves after two animation frames, for checks that something did not change. */
export async function afterTwoFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

/** A touch drag through the Chrome DevTools protocol: touchStart, several touchMove, touchEnd. */
export async function touchDrag(page: Page, from: Point, to: Point, steps = 10): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    for (let step = 1; step <= steps; step++) {
      const x = from.x + ((to.x - from.x) * step) / steps;
      const y = from.y + ((to.y - from.y) * step) / steps;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await cdp.detach();
  }
}

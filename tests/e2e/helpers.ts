import { expect, type Locator, type Page } from '@playwright/test';
import type { Bookmark, LibraryV2, Session } from '../../src/store';

/** Where the links, shelves and everything personal are kept. Written when something in it first changes. */
export const LIBRARY_KEY = 'bookmark-bookshelf:library';
/** Where the open shelf, the centred link, the view and the look are kept. */
export const SESSION_KEY = `${LIBRARY_KEY}:session`;
export type StoredLibrary = Omit<LibraryV2, 'session'>;
export const EXAMPLE_COUNT = 15;
/** The first link of a fresh library. It has a text with headings. */
export const FIRST_EXAMPLE = { id: 'example-what-is-a-url', title: 'What is a URL?' } as const;
/** The link after it. It has a text too. */
export const SECOND_EXAMPLE = { id: 'example-web-storage-api', title: 'Web Storage API' } as const;
/** The example with the longest text. It stands on the second shelf. */
export const LONG_EXAMPLE = { id: 'example-commonplace-book', title: 'Commonplace book' } as const;
/** An example that has only a link and no text. */
export const LINK_ONLY_EXAMPLE = { id: 'example-link-rot', title: 'Link rot' } as const;
/** The three shelves of a fresh library, in tab order. */
export const HOMEWORK = { id: 'example-shelf-homework', name: 'Homework: how the web works', count: 6 } as const;
export const READING = { id: 'example-shelf-reading', name: 'Reading list', count: 5 } as const;
export const LOOKUPS = { id: 'example-shelf-lookups', name: 'Things I look up', count: 4 } as const;
export const LOOKS = [
  { name: 'paper', label: 'Paper Row' },
  { name: 'oak', label: 'Oak Library' },
  { name: 'night', label: 'Night Study' },
  { name: 'pocket', label: 'Pocket Paperbacks' },
] as const;

/**
 * A window in which the fifteen examples are more than the row can show, so the row goes round.
 * In a wider window they all fit and stand still between two bookends.
 */
export const NARROW_WINDOW = { width: 760, height: 720 } as const;

/* ---------- locators ---------- */

export const shelfOf = (page: Page): Locator => page.locator('.bb-shelf');
export const readerOf = (page: Page): Locator => page.locator('.bb-reader');
export const sheetOf = (page: Page): Locator => page.locator('.bb-reader__sheet');
export const controlFor = (page: Page, id: string): Locator => page.locator(`.bb-book[data-id="${id}"] .bb-book__control`);
export const centredControl = (page: Page): Locator => page.locator('.bb-book.is-centre .bb-book__control');
/** The title of the link in the centre, under the row. */
export const captionTitle = (page: Page): Locator => page.locator('#caption-title');
/** The line under the title: the note, or when the link was saved. */
export const captionLine = (page: Page): Locator => page.locator('#caption-line');
/** The page's main area: the row, the caption with its actions, or the list. */
export const stageOf = (page: Page): Locator => page.getByRole('main');
/** The one solid action under the row, whatever it says for the link in the centre. */
export const primaryAction = (page: Page): Locator => page.locator('#action-primary');
export const editAction = (page: Page): Locator => stageOf(page).getByRole('button', { name: 'Edit', exact: true });
export const originalLink = (page: Page): Locator => stageOf(page).getByRole('link', { name: /^Open original/ });
export const addButton = (page: Page): Locator => page.locator('#add');
export const editorOf = (page: Page): Locator => page.locator('#editor');
export const listOf = (page: Page): Locator => page.locator('#list');
/** One row of the list per link. */
export const listRows = (page: Page): Locator => listOf(page).locator('li[data-id]');
export const listRowFor = (page: Page, id: string): Locator => listOf(page).locator(`li[data-id="${id}"]`);
/** The title of a list row: the button that opens the link. */
export const rowTitle = (row: Locator): Locator => row.getByRole('heading').getByRole('button');
/** Where short messages appear, one at a time. */
export const toastsOf = (page: Page): Locator => page.locator('#toasts');
export const closeReaderButton = (page: Page): Locator => readerOf(page).getByRole('button', { name: 'Back to shelf' });
export const readerTitle = (page: Page): Locator => readerOf(page).getByRole('heading', { level: 1 });
export const readerBody = (page: Page): Locator => page.locator('.bb-reader__body');
export const pasteField = (page: Page): Locator => readerOf(page).getByLabel('Text to read');
export const readout = (page: Page): Locator => page.locator('.bb-reader__readout');

/** The tab of one shelf. Without an id it is the "All" tab. */
export function shelfTab(page: Page, id: string | null = null): Locator {
  return page.locator(`#tabs [data-shelf="${id ?? ''}"]`);
}

/** The figure a tab shows next to the shelf's name. */
export async function expectTabCount(page: Page, id: string | null, count: number): Promise<void> {
  await expect(shelfTab(page, id)).toHaveAccessibleDescription(count === 1 ? '1 link' : `${count} links`);
}

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

/** Waits until no transition or animation is running any more, so what is on screen is what stays. */
export async function expectStill(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0);
}

/** Waits until `id` is the link in the centre and the row has come to rest on it. */
export async function expectCentred(page: Page, id: string): Promise<void> {
  // The centre changes while the row is still moving, so wait for it first and for rest second.
  await expect(shelfOf(page)).toHaveAttribute('data-focus-id', id);
  await expectSettled(page);
  await expect(page.locator('.bb-book.is-centre')).toHaveAttribute('data-id', id);
}

/* ---------- navigation ---------- */

/** Opens the app and waits until the shelf is drawn and at rest. */
export async function openApp(page: Page, address = '/app.html'): Promise<void> {
  await page.goto(address);
  await expect(shelfOf(page)).toBeVisible();
  await expectSettled(page);
}

export async function reloadApp(page: Page): Promise<void> {
  await page.reload();
  await expect(shelfOf(page)).toBeVisible();
  await expectSettled(page);
}

/** Opens a shelf by its tab and waits for the row. Without an id it opens "All". */
export async function openShelf(page: Page, id: string | null = null): Promise<void> {
  await shelfTab(page, id).click();
  await expect(shelfTab(page, id)).toHaveAttribute('aria-pressed', 'true');
  await expectSettled(page);
}

/* ---------- menus ---------- */

export const viewButton = (page: Page): Locator => page.getByRole('button', { name: 'View', exact: true });
export const libraryButton = (page: Page): Locator => page.locator('#library-button');
export const shelfMenuButton = (page: Page): Locator => page.getByRole('button', { name: 'Shelf', exact: true });

async function chooseInViewMenu(page: Page, item: string): Promise<void> {
  await viewButton(page).click();
  await page
    .getByRole('menu', { name: 'View' })
    .getByRole('menuitemradio')
    .filter({ has: page.getByText(item, { exact: true }) })
    .click();
  await expect(viewButton(page)).toHaveAttribute('aria-expanded', 'false');
}

export async function showList(page: Page): Promise<void> {
  await chooseInViewMenu(page, 'List');
  await expect(listOf(page)).toBeVisible();
}

export async function showShelf(page: Page): Promise<void> {
  await chooseInViewMenu(page, 'Shelf');
  await expect(shelfOf(page)).toBeVisible();
  await expectSettled(page);
}

/** Chooses a look from the View menu and waits until the row and the page wear it. */
export async function chooseLook(page: Page, name: (typeof LOOKS)[number]['name']): Promise<void> {
  const look = LOOKS.find((entry) => entry.name === name);
  await chooseInViewMenu(page, look?.label ?? name);
  await expect(shelfOf(page)).toHaveAttribute('data-variant', name);
  await expect(page.locator('html')).toHaveAttribute('data-variant', name);
  await expectSettled(page);
  await expectStill(page);
}

/** Which view the View menu says is chosen. */
export async function chosenView(page: Page): Promise<string> {
  await viewButton(page).click();
  const chosen = page.getByRole('group', { name: 'View' }).getByRole('menuitemradio', { checked: true });
  await expect(chosen).toHaveCount(1);
  const name = (await chosen.textContent()) ?? '';
  await page.keyboard.press('Escape');
  await expect(viewButton(page)).toHaveAttribute('aria-expanded', 'false');
  return name.trim();
}

export async function chooseInLibraryMenu(page: Page, item: string): Promise<void> {
  await libraryButton(page).click();
  await page.locator('#library-menu').getByRole('button', { name: item, exact: true }).click();
}

export async function chooseInShelfMenu(page: Page, item: string): Promise<void> {
  await shelfMenuButton(page).click();
  await page.locator('#shelf-menu').getByRole('menuitem', { name: item, exact: true }).click();
}

/* ---------- shelf state ---------- */

export async function focusIndex(page: Page): Promise<number> {
  return Number(await shelfOf(page).getAttribute('data-focus'));
}

export async function focusId(page: Page): Promise<string> {
  return (await shelfOf(page).getAttribute('data-focus-id')) ?? '';
}

/** True when the row goes round: after the last link the first one follows. */
export async function rowLoops(page: Page): Promise<boolean> {
  return (await shelfOf(page).getAttribute('data-loop')) === '1';
}

/** Presses ArrowRight on the centred volume until `id` is centred, waiting for rest after every step. */
export async function stepTo(page: Page, id: string): Promise<void> {
  await centredControl(page).focus();
  for (let guard = 0; guard < EXAMPLE_COUNT && (await focusId(page)) !== id; guard++) {
    const before = await focusId(page);
    await page.keyboard.press('ArrowRight');
    await expect(shelfOf(page)).not.toHaveAttribute('data-focus-id', before);
    await expectSettled(page);
  }
  expect(await focusId(page)).toBe(id);
}

/* ---------- stored library ---------- */

/** The library as it is stored right now, or null while nothing in it has changed since the first visit. */
export async function storedLibrary(page: Page): Promise<StoredLibrary | null> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), LIBRARY_KEY);
  return raw === null ? null : (JSON.parse(raw) as StoredLibrary);
}

export async function readLibrary(page: Page): Promise<StoredLibrary> {
  const library = await storedLibrary(page);
  expect(library, 'the library is stored').not.toBeNull();
  return library as StoredLibrary;
}

/** How far a link has been read according to what is stored, 0 to 1. */
export async function storedPercent(page: Page, id: string): Promise<number> {
  return (await storedLibrary(page))?.progress[id]?.percent ?? 0;
}

export async function readSession(page: Page): Promise<Session> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY);
  expect(raw, 'the session is stored').not.toBeNull();
  return JSON.parse(raw ?? '{}') as Session;
}

export async function findStored(page: Page, title: string): Promise<Bookmark> {
  const found = (await readLibrary(page)).bookmarks.find((entry) => entry.title === title);
  expect(found, `a stored link titled "${title}"`).toBeDefined();
  return found as Bookmark;
}

/* ---------- reader ---------- */

export async function openCentredWithKeyboard(page: Page): Promise<void> {
  await centredControl(page).focus();
  await page.keyboard.press('Enter');
  await expectReaderOpen(page);
}

export async function closeReader(page: Page): Promise<void> {
  await closeReaderButton(page).click();
  await expectReaderGone(page);
}

/** Closes a reader that was mounted without the shelf (the examples) and waits for it to be removed. */
export async function closeReaderByButton(page: Page): Promise<void> {
  await closeReaderButton(page).click();
  await expect(readerOf(page)).toHaveCount(0);
}

export async function readoutPercent(page: Page): Promise<number> {
  const text = (await readout(page).textContent()) ?? '';
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

/** Scrolls the reader to the end of its text and waits until the readout says so. */
export async function scrollSheetToEnd(page: Page): Promise<void> {
  await sheetOf(page).evaluate((sheet) => {
    sheet.scrollTop = sheet.scrollHeight;
  });
  await expect.poll(() => readoutPercent(page)).toBeGreaterThan(90);
}

/** Waits until the stored reading place of a link is above zero, so a reload cannot lose it. */
export async function expectProgressStored(page: Page, id: string): Promise<void> {
  await expect.poll(() => storedPercent(page, id)).toBeGreaterThan(0);
}

/* ---------- adding links through the dialog ---------- */

export interface NewLink {
  url: string;
  title?: string;
  note?: string;
  readingText?: string;
  shelfId?: string;
}

export async function fillEditor(page: Page, link: NewLink): Promise<void> {
  const editor = editorOf(page);
  await expect(editor).toBeVisible();
  await editor.locator('[name="url"]').fill(link.url);
  if (link.title !== undefined) await editor.locator('[name="title"]').fill(link.title);
  if (link.note !== undefined) await editor.locator('[name="note"]').fill(link.note);
  if (link.shelfId !== undefined) await editor.locator('[name="shelfId"]').selectOption(link.shelfId);
  if (link.readingText !== undefined) await editor.locator('[name="readingText"]').fill(link.readingText);
}

export async function saveEditor(page: Page): Promise<void> {
  await editorOf(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editorOf(page)).toBeHidden();
}

/** Adds a link through the dialog. Resolves with the new link once it is centred and the shelf is at rest. */
export async function addLink(page: Page, link: NewLink): Promise<Bookmark> {
  await addButton(page).click();
  await fillEditor(page, link);
  await saveEditor(page);
  const library = await readLibrary(page);
  const created = library.bookmarks.find((entry) => entry.url.startsWith(link.url) && (!link.title || entry.title === link.title));
  expect(created, 'the new link is stored').toBeDefined();
  const bookmark = created as Bookmark;
  await expectCentred(page, bookmark.id);
  return bookmark;
}

/** Opens the edit dialog for the link in the centre. */
export async function editCentred(page: Page): Promise<void> {
  await editAction(page).click();
  await expect(editorOf(page)).toBeVisible();
}

/** Many short paragraphs, so the sheet is tall enough to scroll on any screen. */
export function makeParagraphs(count: number): string {
  return Array.from(
    { length: count },
    (_, index) => `Paragraph ${index + 1}. A short original line, kept brief on purpose, so that the text grows tall.`,
  ).join('\n\n');
}

/* ---------- page checks ---------- */

export async function noHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

/** The element that has keyboard focus, described well enough to tell controls apart. */
export async function focusedControl(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!active || active === document.body) return 'the page';
    const name = active.getAttribute('aria-label') ?? active.textContent?.trim() ?? '';
    return `${active.tagName.toLowerCase()}${active.id ? `#${active.id}` : ''} "${name}"`;
  });
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

/**
 * How far the volume in the centre has turned its cover to the front, as the row reports it.
 * It is the same at every rest on a whole place, whichever volume stands there.
 */
export async function centreTurn(page: Page): Promise<number> {
  return page.locator('.bb-book.is-centre').evaluate((book) => Number((book as HTMLElement).style.getPropertyValue('--bb-turn')));
}

/** Resolves after two animation frames, for checks that something did not change. */
export async function afterTwoFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

const nextFrame = (page: Page): Promise<void> => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

/** A touch drag through the Chrome DevTools protocol: touchStart, one touchMove per frame, touchEnd. */
export async function touchDrag(page: Page, from: Point, to: Point, steps = 10): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    for (let step = 1; step <= steps; step++) {
      const x = from.x + ((to.x - from.x) * step) / steps;
      const y = from.y + ((to.y - from.y) * step) / steps;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
      await nextFrame(page);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await cdp.detach();
  }
}

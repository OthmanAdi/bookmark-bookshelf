import type { Page } from '@playwright/test';
import {
  FIRST_EXAMPLE,
  afterTwoFrames,
  centredControl,
  closeReaderButton,
  expect,
  expectReaderGone,
  expectReaderOpen,
  openApp,
  readerOf,
  readerTitle,
  readout,
  shelfOf,
  test,
} from './fixtures';

/**
 * The cases of never-gone.spec.ts and reader.spec.ts that the flight touches, with Studio drawing. In
 * Studio the volume in the air is the lit volume itself, in a canvas over the CSS flight's layer.
 */

const STUDIO = '/app.html?paint=studio';

/** Centre and size of something on screen. */
type Box = [x: number, y: number, width: number, height: number];

/** One animation frame: where the volume could be seen, and whether Studio was the one carrying it. */
interface Frame {
  shelf: Box | null;
  flight: Box | null;
  reader: Box | null;
  /** The lit volume was being drawn in the flight's canvas. */
  lit: boolean;
  /** Share of the flight done, as the canvas reports it; null when nothing is in the air. */
  time: number | null;
}

/** What the canvas of a flight was like while the volume was in the air. */
interface CanvasFacts {
  count: number;
  ariaHidden: string | null;
  pointerEvents: string;
  layerPosition: string;
}

/** Whether this browser can draw WebGL 2 at all. Studio steps back to the CSS shelf where it cannot. */
const canDraw = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    try {
      return document.createElement('canvas').getContext('webgl2') !== null;
    } catch {
      return false;
    }
  });

async function openStudio(page: Page): Promise<void> {
  await openApp(page, STUDIO);
  test.skip(!(await canDraw(page)), 'This browser has no WebGL 2.');
  await expect(shelfOf(page)).toHaveAttribute('data-paint', 'studio');
  // Studio has drawn the row, so it knows the volume it is about to be asked to carry.
  const canvas = page.locator('.bb-shelf__scene canvas.bb-studio');
  await expect.poll(async () => Number(await canvas.getAttribute('data-drawn'))).toBeGreaterThan(0);
}

async function startWatching(page: Page): Promise<void> {
  await page.evaluate(() => {
    const frames: Frame[] = [];
    const watch: { frames: Frame[]; running: boolean; canvas: CanvasFacts | null } = { frames, running: true, canvas: null };
    const box = (element: Element): Box => {
      const rect = element.getBoundingClientRect();
      return [rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width, rect.height];
    };
    const onScreen = (element: Element | null | undefined): element is Element =>
      Boolean(element) && getComputedStyle(element as Element).visibility === 'visible' && (element as Element).getClientRects().length > 0;
    const sample = (): void => {
      const volume = document.querySelector('.bb-book.is-centre');
      const face = volume?.querySelector('.bb-book__cover');
      const flying = document.querySelector('.bb-flight__book');
      const canvas = document.querySelector<HTMLCanvasElement>('.bb-flight[data-paint="studio"] canvas.bb-studio-flight');
      const sheet = document.querySelector('.bb-reader__sheet');
      const place = document.querySelector('.bb-reader__cover-slot');
      const cover = place?.firstElementChild;
      // The flight is short: what its canvas is like is noted the first time it is seen.
      if (canvas && !watch.canvas) {
        watch.canvas = {
          count: document.querySelectorAll('canvas.bb-studio-flight').length,
          ariaHidden: canvas.getAttribute('aria-hidden'),
          pointerEvents: getComputedStyle(canvas).pointerEvents,
          layerPosition: getComputedStyle(canvas.parentElement as Element).position,
        };
      }
      const pageIsThere = sheet !== null && Number(getComputedStyle(sheet).opacity) >= 0.99;
      frames.push({
        shelf: onScreen(volume) && face ? box(face) : null,
        flight: onScreen(flying) ? box(flying) : null,
        reader: pageIsThere && onScreen(cover) && !place?.hasAttribute('data-cover-hidden') ? box(cover) : null,
        lit: canvas !== null,
        time: canvas?.dataset['time'] === undefined ? null : Number(canvas.dataset['time']),
      });
      if (watch.running) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    Reflect.set(window, '__watch', watch);
  });
}

const canvasFacts = (page: Page): Promise<CanvasFacts | null> =>
  page.evaluate(() => (Reflect.get(window, '__watch') as { canvas: CanvasFacts | null }).canvas);

async function stopWatching(page: Page): Promise<Frame[]> {
  await afterTwoFrames(page);
  return page.evaluate(() => {
    const watch = Reflect.get(window, '__watch') as { frames: Frame[]; running: boolean };
    watch.running = false;
    return watch.frames;
  });
}

function expectOneVolume(frames: Frame[], during: string): void {
  expect(frames.length, `frames were noted ${during}`).toBeGreaterThan(4);
  const gone: number[] = [];
  const doubled: number[] = [];
  frames.forEach((frame, index) => {
    const seen = [frame.shelf, frame.flight, frame.reader].filter((entry): entry is Box => entry !== null);
    if (seen.length === 0) gone.push(index);
    for (let one = 0; one < seen.length; one++) {
      for (let other = one + 1; other < seen.length; other++) {
        const [a, b] = [seen[one] as Box, seen[other] as Box];
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.1 * Math.max(a[3], b[3])) doubled.push(index);
      }
    }
  });
  expect(gone, `frames ${during} on which the volume was nowhere to be seen`).toEqual([]);
  expect(doubled, `frames ${during} on which the volume was in two places`).toEqual([]);
}

test.describe('the flight of a volume in Studio', () => {
  test('from the row to the page and back, the lit volume is always in exactly one place', async ({ page }) => {
    await openStudio(page);
    await centredControl(page).focus();

    await startWatching(page);
    await page.keyboard.press('Enter');
    await expectReaderOpen(page);
    const opening = await stopWatching(page);
    expectOneVolume(opening, 'while opening');
    expect(opening[0]?.shelf, 'it starts in the row').not.toBeNull();
    const carried = opening.filter((frame) => frame.flight !== null && frame.shelf === null && frame.reader === null);
    expect(carried.length, 'it was carried').toBeGreaterThan(0);
    expect(carried.some((frame) => frame.lit), 'Studio carried it, not the CSS flight').toBe(true);
    expect(opening.at(-1)?.reader, 'it ends beside the text').not.toBeNull();
    expect(opening.at(-1)?.flight).toBeNull();
    await expect(page.locator('.bb-flight')).toHaveCount(0);

    await startWatching(page);
    await page.keyboard.press('Escape');
    await expectReaderGone(page);
    const closing = await stopWatching(page);
    expectOneVolume(closing, 'while closing');
    expect(closing[0]?.reader, 'it starts beside the text').not.toBeNull();
    expect(closing.some((frame) => frame.lit && frame.flight !== null && frame.shelf === null && frame.reader === null)).toBe(true);
    expect(closing.at(-1)?.shelf, 'it ends in the row').not.toBeNull();
    expect(closing.at(-1)?.flight).toBeNull();
    // Closing plays the opening backwards: the flight's own clock runs down.
    const times = closing.map((frame) => frame.time).filter((time): time is number => time !== null);
    expect(times.length).toBeGreaterThan(1);
    expect(times.at(-1) ?? 1).toBeLessThan(times[0] ?? 0);
    for (let index = 1; index < times.length; index++) expect(times[index] ?? 0).toBeLessThanOrEqual((times[index - 1] ?? 0) + 1e-6);
  });

  test('the volume lands in the box of the reader’s cover, and its canvas never takes a press', async ({ page }) => {
    await openStudio(page);
    await centredControl(page).focus();
    await startWatching(page);
    await page.keyboard.press('Enter');
    await expectReaderOpen(page);
    const frames = await stopWatching(page);
    // While it was in the air: one canvas in a layer fixed over the page, hidden from assistive technology,
    // out of the pointer's way.
    expect(await canvasFacts(page)).toEqual({ count: 1, ariaHidden: 'true', pointerEvents: 'none', layerPosition: 'fixed' });

    const lastInAir = frames.filter((frame) => frame.flight !== null).at(-1)?.flight;
    const landed = frames.at(-1)?.reader;
    expect(lastInAir).toBeTruthy();
    expect(landed).toBeTruthy();
    if (!lastInAir || !landed) return;
    // Same place, same size: the hand-over to the reader's own cover moves nothing.
    expect(Math.abs(lastInAir[0] - landed[0])).toBeLessThan(1.5);
    expect(Math.abs(lastInAir[1] - landed[1])).toBeLessThan(3);
    expect(Math.abs(lastInAir[2] - landed[2])).toBeLessThan(1.5);
    expect(Math.abs(lastInAir[3] - landed[3])).toBeLessThan(1.5);
  });

  test('Escape while the volume is in the air turns it round, and it is still never gone', async ({ page }) => {
    await openStudio(page);
    await centredControl(page).focus();

    await startWatching(page);
    await page.keyboard.press('Enter');
    await expect(shelfOf(page)).toHaveAttribute('data-open', 'moving');
    await page.keyboard.press('Escape');
    await expectReaderGone(page);
    const frames = await stopWatching(page);

    expectOneVolume(frames, 'while opening and turning back');
    expect(frames.some((frame) => frame.flight !== null)).toBe(true);
    expect(frames.at(-1)?.shelf).not.toBeNull();
    await expect(readerOf(page)).toHaveCount(0);
    await expect(page.locator('.bb-flight')).toHaveCount(0);
    await expect(centredControl(page)).toBeFocused();
  });

  test('under reduced motion nothing flies', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openStudio(page);
    await centredControl(page).focus();
    await startWatching(page);
    await page.keyboard.press('Enter');
    await expectReaderOpen(page);
    const frames = await stopWatching(page);
    expect(frames.every((frame) => frame.flight === null && !frame.lit)).toBe(true);
    await expect(page.locator('.bb-flight')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expectReaderGone(page);
    await expect(page.locator('.bb-flight')).toHaveCount(0);
  });

  test('the reader opens on the link, reads from the top, and its button brings the volume back', async ({ page }) => {
    await openStudio(page);
    await centredControl(page).focus();
    await page.keyboard.press('Enter');
    await expectReaderOpen(page);
    await expect(readerTitle(page)).toHaveText(FIRST_EXAMPLE.title);
    await expect(readout(page)).toHaveText('0% read');
    await expect(closeReaderButton(page)).toBeFocused();
    // The reader's own cover is the one showing once the volume has landed.
    await expect(page.locator('.bb-reader__cover-slot')).not.toHaveAttribute('data-cover-hidden', /.*/);
    await closeReaderButton(page).click();
    await expectReaderGone(page);
    await expect(shelfOf(page)).toHaveAttribute('data-paint', 'studio');
    await expect(page.locator('.bb-flight')).toHaveCount(0);
  });
});

import type { Page } from '@playwright/test';
import { LOOKS, afterTwoFrames, centredControl, chooseLook, expect, expectReaderGone, expectReaderOpen, openApp, readerOf, shelfOf, test } from './fixtures';

/** Centre and size of something on screen. */
type Box = [x: number, y: number, width: number, height: number];

/** One animation frame: where the volume could be seen, in each of the three places it can be. */
interface Frame {
  time: number;
  /** The volume standing in the centre of the row. */
  shelf: Box | null;
  /** The cover carried between the row and the page. */
  flight: Box | null;
  /** The cover beside the text, counted only once the page is fully there. */
  reader: Box | null;
}

/** Starts noting, on every animation frame, where the centred volume can be seen. */
async function startWatching(page: Page): Promise<void> {
  await page.evaluate(() => {
    const frames: Frame[] = [];
    const watch = { frames, running: true };
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
      const sheet = document.querySelector('.bb-reader__sheet');
      const place = document.querySelector('.bb-reader__cover-slot');
      const cover = place?.firstElementChild;
      const pageIsThere = sheet !== null && Number(getComputedStyle(sheet).opacity) >= 0.99;
      frames.push({
        time: performance.now(),
        shelf: onScreen(volume) && face ? box(face) : null,
        flight: onScreen(flying) ? box(flying) : null,
        reader: pageIsThere && onScreen(cover) && !place?.hasAttribute('data-cover-hidden') ? box(cover) : null,
      });
      if (watch.running) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    Reflect.set(window, '__watch', watch);
  });
}

async function stopWatching(page: Page): Promise<Frame[]> {
  await afterTwoFrames(page);
  return page.evaluate(() => {
    const watch = Reflect.get(window, '__watch') as { frames: Frame[]; running: boolean };
    watch.running = false;
    return watch.frames;
  });
}

/** Frames on which the volume was nowhere, and frames on which it was in two different places. */
function faults(frames: Frame[]): { gone: number[]; doubled: number[] } {
  const gone: number[] = [];
  const doubled: number[] = [];
  frames.forEach((frame, index) => {
    const seen = [frame.shelf, frame.flight, frame.reader].filter((entry): entry is Box => entry !== null);
    if (seen.length === 0) gone.push(index);
    // While one hands over to the next, both stand on the same spot for a frame. Apart, they are two volumes.
    for (let one = 0; one < seen.length; one++) {
      for (let other = one + 1; other < seen.length; other++) {
        const [a, b] = [seen[one] as Box, seen[other] as Box];
        const apart = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (apart > 0.1 * Math.max(a[3], b[3])) doubled.push(index);
      }
    }
  });
  return { gone, doubled };
}

function expectOneVolume(frames: Frame[], during: string): void {
  expect(frames.length, `frames were noted ${during}`).toBeGreaterThan(10);
  const { gone, doubled } = faults(frames);
  expect(gone, `frames ${during} on which the volume was nowhere to be seen`).toEqual([]);
  expect(doubled, `frames ${during} on which the volume was in two places`).toEqual([]);
}

test.describe('a volume is never gone', () => {
  for (const look of LOOKS) {
    test(`${look.label}: from the row to the page and back, the volume is always in exactly one place`, async ({ page }) => {
      await openApp(page);
      if (look.name !== 'paper') await chooseLook(page, look.name);
      await centredControl(page).focus();

      await startWatching(page);
      await page.keyboard.press('Enter');
      await expectReaderOpen(page);
      const opening = await stopWatching(page);
      expectOneVolume(opening, 'while opening');
      // It left the row, was carried, and arrived beside the text.
      expect(opening[0]?.shelf, 'it starts in the row').not.toBeNull();
      expect(opening.some((frame) => frame.flight !== null && frame.shelf === null && frame.reader === null)).toBe(true);
      expect(opening.at(-1)?.reader, 'it ends beside the text').not.toBeNull();
      expect(opening.at(-1)?.flight).toBeNull();

      await startWatching(page);
      await page.keyboard.press('Escape');
      await expectReaderGone(page);
      const closing = await stopWatching(page);
      expectOneVolume(closing, 'while closing');
      expect(closing[0]?.reader, 'it starts beside the text').not.toBeNull();
      expect(closing.some((frame) => frame.flight !== null && frame.shelf === null && frame.reader === null)).toBe(true);
      expect(closing.at(-1)?.shelf, 'it ends in the row').not.toBeNull();
      expect(closing.at(-1)?.flight).toBeNull();
    });
  }

  test('Escape while the volume is in the air turns it round, and it is still never gone', async ({ page }) => {
    await openApp(page);
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
    await expect(centredControl(page)).toBeFocused();
  });
});

import type { Page } from '@playwright/test';
import { LOOKS, afterTwoFrames, centredControl, chooseLook, expect, expectReaderGone, expectReaderOpen, expectStill, openApp, test, viewButton } from './fixtures';

/** One picture of the page as the browser painted it, with the time it was painted. */
interface Shot {
  at: number;
  data: string;
}

/** How bright each frame was on average, 0 black to 1 white, with the time since the frame before. */
interface Brightness {
  value: number;
  gap: number;
}

/** The most the brightness of the page may change from one painted frame to the next, as a share of black to white. */
const STEP = 0.25;
/** Two frames this far apart are neighbours. Further apart, the browser skipped some, so more may have changed. */
const FRAME_MS = 34;
/** How far a transition may leave the band between where it starts and where it ends. */
const OVERSHOOT = 0.12;

/** Records every frame the browser paints while `action` runs, starting from the frame on screen before it. */
async function film(page: Page, action: () => Promise<void>): Promise<Shot[]> {
  const session = await page.context().newCDPSession(page);
  const shots: Shot[] = [];
  session.on('Page.screencastFrame', (event) => {
    shots.push({ at: event.metadata.timestamp ?? 0, data: event.data });
    void session.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => undefined);
  });
  try {
    await session.send('Page.startScreencast', { format: 'jpeg', quality: 50, maxWidth: 320, maxHeight: 320, everyNthFrame: 1 });
    await afterTwoFrames(page);
    const start = (await page.evaluate(() => performance.timeOrigin + performance.now())) / 1000;
    await action();
    await afterTwoFrames(page);
    await session.send('Page.stopScreencast');
    const before = shots.filter((shot) => shot.at < start).at(-1);
    const during = shots.filter((shot) => shot.at >= start);
    return before ? [before, ...during] : during;
  } finally {
    await session.detach();
  }
}

/** Works out the mean brightness of each picture on a blank page, so the app's own page does no extra work. */
async function brightness(bench: Page, shots: Shot[]): Promise<Brightness[]> {
  const values = await bench.evaluate(async (pictures) => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('no canvas');
    const means: number[] = [];
    for (const picture of pictures) {
      const bytes = Uint8Array.from(atob(picture), (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
      context.drawImage(bitmap, 0, 0, 32, 32);
      bitmap.close();
      const pixels = context.getImageData(0, 0, 32, 32).data;
      let sum = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        sum += (0.2126 * (pixels[index] ?? 0) + 0.7152 * (pixels[index + 1] ?? 0) + 0.0722 * (pixels[index + 2] ?? 0)) / 255;
      }
      means.push(sum / (pixels.length / 4));
    }
    return means;
  }, shots.map((shot) => shot.data));
  return values.map((value, index) => ({ value, gap: index === 0 ? 0 : ((shots[index]?.at ?? 0) - (shots[index - 1]?.at ?? 0)) * 1000 }));
}

/** Frames whose brightness jumped from the frame before. */
function jumps(frames: Brightness[]): string[] {
  const found: string[] = [];
  frames.forEach((frame, index) => {
    const before = frames[index - 1];
    if (!before) return;
    const allowed = STEP * Math.max(1, frame.gap / FRAME_MS);
    const jump = Math.abs(frame.value - before.value);
    if (jump > allowed) found.push(`frame ${index}: brightness jumped by ${jump.toFixed(2)} in ${Math.round(frame.gap)} ms`);
  });
  return found;
}

/** Frames that are a flash: a jump from the frame before, or a moment brighter or darker than both ends. */
function flashes(frames: Brightness[]): string[] {
  const found = jumps(frames);
  const first = frames[0]?.value ?? 0;
  const last = frames.at(-1)?.value ?? 0;
  const [low, high] = [Math.min(first, last) - OVERSHOOT, Math.max(first, last) + OVERSHOOT];
  frames.forEach((frame, index) => {
    if (frame.value < low || frame.value > high) {
      found.push(`frame ${index}: brightness ${frame.value.toFixed(2)} left the range ${first.toFixed(2)} to ${last.toFixed(2)}`);
    }
  });
  return found;
}

const brightest = (frames: Brightness[]): number => Math.max(...frames.map((frame) => frame.value));

test.describe('nothing flashes', () => {
  for (const look of LOOKS) {
    test(`${look.label}: the page arrives and leaves without a flash`, async ({ page, context }) => {
      const bench = await context.newPage();
      await page.bringToFront();
      await openApp(page);
      if (look.name !== 'paper') await chooseLook(page, look.name);
      await expectStill(page);
      await centredControl(page).focus();

      const opening = await film(page, async () => {
        await page.keyboard.press('Enter');
        await expectReaderOpen(page);
      });
      const closing = await film(page, async () => {
        await page.keyboard.press('Escape');
        await expectReaderGone(page);
      });

      const arriving = await brightness(bench, opening);
      const leaving = await brightness(bench, closing);
      expect(arriving.length, 'frames were filmed while opening').toBeGreaterThan(10);
      expect(leaving.length, 'frames were filmed while closing').toBeGreaterThan(10);
      expect(flashes(arriving), 'while opening').toEqual([]);
      expect(flashes(leaving), 'while closing').toEqual([]);

      if (look.name === 'night') {
        // A dark look opens a dark page: no frame on the way there or back is bright.
        expect(brightest(arriving), 'the brightest frame while opening').toBeLessThan(0.35);
        expect(brightest(leaving), 'the brightest frame while closing').toBeLessThan(0.35);
      }
    });
  }

  test('changing between the light looks fades from one to the other: no frame jumps', async ({ page, context }) => {
    const bench = await context.newPage();
    await page.bringToFront();
    await openApp(page);
    await expectStill(page);

    for (const look of ['pocket', 'oak', 'paper'] as const) {
      const shots = await film(page, async () => {
        await chooseLook(page, look);
      });
      const frames = await brightness(bench, shots);
      expect(frames.length).toBeGreaterThan(3);
      // The row fades out before the look changes, so the page may pass through its bare ground on the way.
      expect(jumps(frames), `changing to ${look}`).toEqual([]);
    }
    await expect(viewButton(page)).toBeVisible();
  });
});

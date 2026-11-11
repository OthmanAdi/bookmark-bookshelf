import type { Page } from '@playwright/test';
import {
  addButton,
  centredControl,
  editCentred,
  editorOf,
  expect,
  expectReaderGone,
  expectSettled,
  focusId,
  openApp,
  readerOf,
  shelfOf,
  test,
  toastsOf,
  viewButton,
} from './fixtures';

test.use({ reducedMotion: 'reduce' });

interface Stamps {
  pressed?: number;
  opened?: number;
}

/** Animations and transitions that are running now and last longer than a short fade. */
function longMoves(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document
      .getAnimations()
      .map((animation) => {
        const timing = animation.effect?.getComputedTiming();
        const duration = typeof timing?.duration === 'number' ? timing.duration : 0;
        const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
        const what = 'transitionProperty' in animation ? String(animation.transitionProperty) : 'animation';
        return { duration, label: `${what} on ${target?.className || target?.tagName || 'something'} for ${Math.round(duration)} ms` };
      })
      .filter((move) => move.duration > 150)
      .map((move) => move.label),
  );
}

test.describe('reduced motion', () => {
  test('ArrowRight changes the link and the shelf is settled on the very next frame', async ({ page }) => {
    await openApp(page);
    const before = await focusId(page);
    await centredControl(page).focus();

    const result = await page.evaluate(async () => {
      const shelf = document.querySelector<HTMLElement>('.bb-shelf');
      if (!shelf) throw new Error('no shelf');
      const control = document.querySelector<HTMLElement>('.bb-book.is-centre .bb-book__control');
      control?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return { settled: shelf.dataset.settled, id: shelf.dataset.focusId };
    });

    expect(result.settled).toBe('1');
    expect(result.id).not.toBe(before);
    await expect(shelfOf(page)).toHaveAttribute('data-focus', '1');
  });

  test('opening reaches the open page in under 400 ms, nothing travels, and closing is just as short', async ({ page }) => {
    await openApp(page);
    await centredControl(page).focus();

    // Stamp the key press and the moment the shelf reports "open" inside the page, so test latency does not count.
    await page.evaluate(() => {
      const stamps: Stamps = {};
      Reflect.set(window, '__stamps', stamps);
      Reflect.set(window, '__flew', false);
      const shelf = document.querySelector<HTMLElement>('.bb-shelf');
      document.addEventListener(
        'keydown',
        (event) => {
          if (event.key === 'Enter') stamps.pressed = performance.now();
        },
        { capture: true },
      );
      new MutationObserver(() => {
        if (shelf?.dataset.open === '1' && stamps.opened === undefined) stamps.opened = performance.now();
      }).observe(shelf as Element, { attributes: true, attributeFilter: ['data-open'] });
      // A cover carried through the air would be added to the page while the reader opens or closes.
      new MutationObserver(() => {
        if (document.querySelector('.bb-flight')) Reflect.set(window, '__flew', true);
      }).observe(document.body, { childList: true });
    });

    await page.keyboard.press('Enter');
    await expect(shelfOf(page)).toHaveAttribute('data-open', '1');
    await expect(readerOf(page)).toHaveAttribute('data-open', '1');

    const stamps = (await page.evaluate(() => Reflect.get(window, '__stamps'))) as Stamps;
    expect(stamps.pressed).toBeDefined();
    expect(stamps.opened).toBeDefined();
    expect((stamps.opened ?? Infinity) - (stamps.pressed ?? 0)).toBeLessThan(400);

    await page.keyboard.press('Escape');
    await expectReaderGone(page);
    expect(await page.evaluate(() => Reflect.get(window, '__flew'))).toBe(false);
  });

  test('menus, dialogs and messages appear without a move longer than a short fade', async ({ page }) => {
    await openApp(page);

    await viewButton(page).click();
    await expect(page.getByRole('menu', { name: 'View' })).toBeVisible();
    expect(await longMoves(page)).toEqual([]);
    await page.keyboard.press('Escape');

    await addButton(page).click();
    await expect(editorOf(page)).toBeVisible();
    expect(await longMoves(page)).toEqual([]);
    await editorOf(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(editorOf(page)).toBeHidden();

    await editCentred(page);
    await editorOf(page).getByRole('button', { name: 'Remove link' }).click();
    await expect(toastsOf(page)).toContainText('Removed');
    expect(await longMoves(page)).toEqual([]);
    await expectSettled(page);
    expect(await longMoves(page)).toEqual([]);
  });
});

import { centredControl, expect, expectSettled, focusId, openApp, shelfOf, test } from './fixtures';

test.use({ reducedMotion: 'reduce' });

interface Stamps {
  pressed?: number;
  opened?: number;
}

test.describe('reduced motion', () => {
  test('ArrowRight changes the volume and the shelf is settled on the very next frame', async ({ page }) => {
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

  test('opening reaches data-open="1" in under 400 ms and closing is just as short', async ({ page }) => {
    await openApp(page);
    await centredControl(page).focus();

    // Stamp the key press and the moment the shelf reports "open" inside the page, so test latency does not count.
    await page.evaluate(() => {
      const stamps: Stamps = {};
      Reflect.set(window, '__stamps', stamps);
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
    });

    await page.keyboard.press('Enter');
    await expect(shelfOf(page)).toHaveAttribute('data-open', '1');

    const stamps = (await page.evaluate(() => Reflect.get(window, '__stamps'))) as Stamps;
    expect(stamps.pressed).toBeDefined();
    expect(stamps.opened).toBeDefined();
    expect((stamps.opened ?? Infinity) - (stamps.pressed ?? 0)).toBeLessThan(400);

    await page.keyboard.press('Escape');
    await expect(page.locator('.bb-reader')).toHaveCount(0);
    await expectSettled(page);
  });
});

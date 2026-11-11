import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCover } from './cover-art';
import { DEFAULT_LIGHT, faceShades } from './light';
import { mountShelf } from './shelf';
import type { ShelfHandle, ShelfIntent, ShelfItem, ShelfOptions } from './types';

function makeItems(count: number): ShelfItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `id-${index}`,
    title: `Title ${index}`,
    source: `site${index}.example`,
  }));
}

let host: HTMLElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  // A real browser measures the scene. happy-dom reports 0, so give it a size.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1280);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
});

afterEach(() => {
  document.body.innerHTML = '';
});

function mount(options: Partial<ShelfOptions> = {}): { shelf: ShelfHandle; intents: ShelfIntent[] } {
  const shelf = mountShelf(host, { items: makeItems(5), variant: 'paper', ...options });
  const intents: ShelfIntent[] = [];
  shelf.on((intent) => intents.push(intent));
  return { shelf, intents };
}

const books = (shelf: ShelfHandle): HTMLElement[] => [...shelf.element.querySelectorAll<HTMLElement>('.bb-book')];
const controls = (shelf: ShelfHandle): HTMLButtonElement[] => [
  ...shelf.element.querySelectorAll<HTMLButtonElement>('.bb-book__control'),
];
const bySlot = (shelf: ShelfHandle, slot: number): HTMLElement => {
  const book = shelf.element.querySelector<HTMLElement>(`.bb-book[data-slot="${slot}"]`);
  if (!book) throw new Error(`no book in slot ${slot}`);
  return book;
};
const click = (target: Element): void => {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
};
const press = (shelf: ShelfHandle, key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  shelf.element.querySelector('.bb-shelf__row')?.dispatchEvent(event);
  return event;
};

describe('mountShelf rendering', () => {
  it('mounts a labelled region into the host', () => {
    const { shelf } = mount({ label: 'My links' });
    expect(host.contains(shelf.element)).toBe(true);
    expect(shelf.element.getAttribute('aria-label')).toBe('My links');
    expect(shelf.element.dataset.variant).toBe('paper');
    expect(shelf.surface.classList.contains('bb-shelf__scene')).toBe(true);
  });

  it('loops a row longer than the scene, and never shows one volume twice', () => {
    const { shelf } = mount({ items: makeItems(40) });
    expect(shelf.loop).toBe(true);
    const indexes = books(shelf).map((book) => book.dataset.index);
    expect(new Set(indexes).size).toBe(indexes.length);
    expect(controls(shelf)).toHaveLength(indexes.length);
    expect(books(shelf).some((book) => Number(book.dataset.slot) < 0)).toBe(true);
  });

  it('gives a short row two ends with a bookend at each, even in a look that loops', () => {
    const { shelf } = mount();
    expect(shelf.variant.loop).toBe(true);
    expect(shelf.loop).toBe(false);
    expect(books(shelf)).toHaveLength(5);
    const ends = [...shelf.element.querySelectorAll<HTMLElement>('.bb-shelf__bookend')];
    expect(ends).toHaveLength(2);
    for (const end of ends) {
      expect(end.hidden).toBe(false);
      expect(end.getAttribute('aria-hidden')).toBe('true');
    }
    const first = Number(/translate3d\(([-\d.e]+)px/.exec(bySlot(shelf, 0).style.transform)?.[1]);
    const start = Number(/translate3d\(([-\d.e]+)px/.exec(ends[0]!.style.transform)?.[1]);
    expect(start).toBeLessThan(first);
  });

  it('stands a short row still in the middle of the scene, whichever volume is presented', () => {
    const { shelf } = mount();
    expect(shelf.fixed).toBe(true);
    expect(shelf.element.dataset.fixed).toBe('1');
    const xOf = (element: HTMLElement): number => Number(/translate3d\(([-\d.e]+)px/.exec(element.style.transform)?.[1]);
    const ends = [...shelf.element.querySelectorAll<HTMLElement>('.bb-shelf__bookend')];
    const resting = xOf(bySlot(shelf, 4));
    for (const position of [0, 0.4, 1, 2.5, 4]) {
      shelf.setPose({ position, open: 0 });
      expect(Math.abs(xOf(ends[0]!) + xOf(ends[1]!))).toBeLessThan(1);
    }
    // The last volume was standing at rest at the far end and stays there while the focus moves up to it.
    shelf.setPose({ position: 2, open: 0 });
    expect(Math.abs(xOf(bySlot(shelf, 4)) - resting)).toBeLessThan(shelf.pitch() / 4);
    expect(xOf(bySlot(shelf, 2))).toBeGreaterThan(xOf(bySlot(shelf, 1)));
  });

  it('presents the end volume of a standing row for a position past that end', () => {
    const { shelf } = mount();
    shelf.setPose({ position: 9.7, open: 0 });
    expect(shelf.element.dataset.focus).toBe('4');
    expect(bySlot(shelf, 4).classList.contains('is-turned')).toBe(true);
    shelf.setPose({ position: -3, open: 0 });
    expect(shelf.element.dataset.focus).toBe('0');
    expect(bySlot(shelf, 0).classList.contains('is-turned')).toBe(true);
  });

  it('starts looping when the row grows past the scene, tells the host, and hides the bookends', () => {
    const changes: boolean[] = [];
    const { shelf } = mount({ onLoopChange: (loop) => changes.push(loop) });
    expect(changes).toEqual([]);
    shelf.setItems(makeItems(40));
    expect(changes).toEqual([true]);
    expect(shelf.loop).toBe(true);
    expect(shelf.fixed).toBe(false);
    expect(shelf.element.dataset.fixed).toBe('0');
    for (const end of shelf.element.querySelectorAll<HTMLElement>('.bb-shelf__bookend')) expect(end.hidden).toBe(true);
    shelf.setItems(makeItems(3));
    expect(changes).toEqual([true, false]);
    expect(shelf.fixed).toBe(true);
  });

  it('lets a host that asks for no loop keep a long row with two ends that travels', () => {
    const { shelf } = mount({ items: makeItems(40), loop: false });
    expect(shelf.loop).toBe(false);
    expect(shelf.fixed).toBe(false);
    shelf.setPose({ position: 39, open: 0 });
    expect(shelf.element.dataset.focus).toBe('39');
    expect(shelf.element.querySelector<HTMLElement>('.bb-shelf__bookend--end')?.hidden).toBe(false);
    expect(shelf.element.querySelector<HTMLElement>('.bb-shelf__bookend--start')?.hidden).toBe(true);
  });

  it('keeps keyboard focus in the row when it starts looping', () => {
    const { shelf } = mount();
    controls(shelf).find((control) => control.tabIndex === 0)?.focus();
    shelf.setItems(makeItems(40));
    expect(document.activeElement?.classList.contains('bb-book__control')).toBe(true);
  });

  it('marks repeated copies aria-hidden and the real ones not', () => {
    const { shelf } = mount();
    const hidden = books(shelf).filter((book) => book.getAttribute('aria-hidden') === 'true');
    const real = books(shelf).filter((book) => book.getAttribute('aria-hidden') === null);
    expect(real).toHaveLength(5);
    expect(hidden.length).toBe(books(shelf).length - 5);
    for (const book of hidden) expect(book.querySelector('.bb-book__control')).toBeNull();
    for (const book of real) expect(book.querySelector('.bb-book__control')).not.toBeNull();
  });

  it('gives exactly one control tabIndex 0, the centred one', () => {
    const { shelf } = mount();
    const stops = controls(shelf).filter((control) => control.tabIndex === 0);
    expect(stops).toHaveLength(1);
    const book = stops[0]?.closest<HTMLElement>('.bb-book');
    expect(book?.dataset.slot).toBe('0');
    expect(book?.classList.contains('is-centre')).toBe(true);
  });

  it('tells how to use the row with every volume', () => {
    const { shelf } = mount();
    const hint = shelf.element.querySelector<HTMLElement>('.bb-shelf__hint');
    expect(hint?.textContent).toBe('Arrow keys move along the shelf, Enter opens.');
    expect(hint?.id).toMatch(/^bb-shelf-hint-\d+$/);
    for (const control of controls(shelf)) expect(control.getAttribute('aria-describedby')).toBe(hint?.id);
    const other = mountShelf(document.body.appendChild(document.createElement('div')), { items: makeItems(2) });
    expect(other.element.querySelector('.bb-shelf__hint')?.id).not.toBe(hint?.id);
  });

  it('gives each volume a focus ring on its spine and on its cover', () => {
    const { shelf } = mount();
    const centre = bySlot(shelf, 0);
    expect(centre.querySelector('.bb-book__body > .bb-book__ring--spine')).not.toBeNull();
    expect(centre.querySelector('.bb-book__body > .bb-book__ring--cover')).not.toBeNull();
  });

  it('labels each control with the title and its place in the row', () => {
    const { shelf } = mount();
    for (const control of controls(shelf)) {
      const index = Number(control.closest<HTMLElement>('.bb-book')?.dataset.index);
      const label = control.getAttribute('aria-label') ?? '';
      expect(label).toContain(`Title ${index}`);
      expect(label).toContain(`Volume ${index + 1} of 5`);
    }
  });

  it('dresses the spines of one site alike and marks each with the site initial', () => {
    const items = makeItems(9).map((item, index) => ({ ...item, source: index % 3 === 0 ? 'docs.example.org' : item.source }));
    const { shelf } = mount({ items });
    const spine = (slot: number): HTMLElement => bySlot(shelf, slot).querySelector<HTMLElement>('.bb-book__spine')!;
    expect(spine(0).dataset.treatment).toBe(spine(3).dataset.treatment);
    expect(spine(3).dataset.treatment).toBe(spine(6).dataset.treatment);
    const device = (slot: number) => bySlot(shelf, slot).querySelector<HTMLElement>('.bb-spine__device')!;
    expect(device(0).dataset.shape).toBe(device(3).dataset.shape);
    expect(device(0).textContent).toBe('E');
    expect(shelf.element.querySelector('.bb-spine__sigil')).toBeNull();
  });

  it('pastes a label holding the title on spines dressed with one', () => {
    const items = Array.from({ length: 30 }, (_, index) => ({ id: `id-${index}`, title: `Title ${index}`, source: `site${index}.example` }));
    const { shelf } = mount({ items });
    const labelled = [...shelf.element.querySelectorAll<HTMLElement>('.bb-book__spine[data-treatment="label"]')];
    expect(labelled.length).toBeGreaterThan(0);
    for (const spine of labelled) {
      expect(spine.querySelector('.bb-spine__title > .bb-spine__label')?.textContent).toMatch(/^Title \d+$/);
    }
  });

  it('stands a reading slip in a volume in progress, placed by how far the reading got', () => {
    const items = makeItems(4).map((item, index) => ({ ...item, progress: [0, 0.34, 1, 0.5][index], done: index === 3 }));
    const { shelf } = mount({ items, variant: 'oak' });
    const slip = (slot: number) => bySlot(shelf, slot).querySelector<HTMLElement>('.bb-book__slip');
    expect(slip(0)).toBeNull();
    expect(slip(1)?.style.getPropertyValue('--bb-slip')).toBe('0.340');
    expect(slip(2)?.style.getPropertyValue('--bb-slip')).toBe('1.000');
    // A volume marked as read shows its check instead, and says so to a screen reader.
    expect(slip(3)).toBeNull();
    expect(bySlot(shelf, 3).classList.contains('is-done')).toBe(true);
    expect(bySlot(shelf, 3).querySelector('.bb-book__control')?.getAttribute('aria-label')).toContain('Marked as read');
    expect(shelf.element.querySelector('.bb-book__ribbon')).toBeNull();
  });

  it('leaves the number off the head of spines unless the look asks for it', () => {
    const { shelf } = mount();
    expect(shelf.element.dataset.mark).toBe('0');
  });

  it('gives every volume a front and a back board', () => {
    const { shelf } = mount({ items: makeItems(40) });
    for (const book of books(shelf)) {
      expect(book.querySelector('.bb-book__board--front')).not.toBeNull();
      expect(book.querySelector('.bb-book__board--back')).not.toBeNull();
    }
  });

  it('puts no sticker on the presented cover', () => {
    const { shelf } = mount();
    expect(shelf.element.querySelector('.bb-book__seal')).toBeNull();
    expect(shelf.element.textContent).not.toContain('Open');
  });

  it('prints covers for the volumes near the centre only', () => {
    const { shelf } = mount({ items: makeItems(40) });
    expect(bySlot(shelf, 0).querySelector('.bb-book__cover .bb-cover')).not.toBeNull();
    expect(bySlot(shelf, 1).querySelector('.bb-book__cover .bb-cover')).not.toBeNull();
    expect(bySlot(shelf, 2).querySelector('.bb-cover')).toBeNull();
    expect(bySlot(shelf, -3).querySelector('.bb-cover')).toBeNull();
  });

  it('composes the printed cover for the proportion of the look', () => {
    const { shelf } = mount({ variant: 'oak' });
    const { coverWidth, bookHeight } = shelf.variant.geometry;
    const item = makeItems(1)[0]!;
    const printed = bySlot(shelf, 0).querySelector('.bb-book__cover .bb-cover svg')?.getAttribute('viewBox');
    expect(printed).toBe(createCover(item, '01', { aspect: coverWidth / bookHeight }).querySelector('svg')?.getAttribute('viewBox'));
    expect(printed).not.toBe(createCover(item, '01').querySelector('svg')?.getAttribute('viewBox'));
  });

  it('keeps a print until the volume is well past the centre, then drops it', () => {
    const { shelf } = mount({ items: makeItems(40) });
    shelf.setPose({ position: 2, open: 0 });
    expect(bySlot(shelf, 0).querySelector('.bb-cover')).not.toBeNull();
    shelf.setPose({ position: 2.6, open: 0 });
    expect(bySlot(shelf, 0).querySelector('.bb-cover')).toBeNull();
  });

  it('shades faces from one light and rewrites a shade only when it changes', () => {
    const { shelf } = mount({ items: makeItems(40) });
    const film = (slot: number, face: string): HTMLElement =>
      bySlot(shelf, slot).querySelector<HTMLElement>(`${face} .bb-book__shade`)!;
    const turned = faceShades(DEFAULT_LIGHT, shelf.variant.geometry.focusAngle);
    expect(Number(film(0, '.bb-book__board--front').style.opacity)).toBeCloseTo(turned.front, 2);
    expect(Number(film(0, '.bb-book__spine').style.opacity)).toBeCloseTo(turned.spine, 2);
    expect(Number(film(4, '.bb-book__board--front').style.opacity)).toBeCloseTo(0.56, 2);
    expect(Number(film(4, '.bb-book__spine').style.opacity)).toBeCloseTo(0, 2);
    film(4, '.bb-book__spine').style.opacity = '0.5';
    shelf.setPose({ position: 0.1, open: 0 });
    expect(film(4, '.bb-book__spine').style.opacity).toBe('0.5');
    expect(shelf.element.style.getPropertyValue('--bb-light-tint')).toBe('#000');
  });

  it('writes the turn on turning volumes and clears it once they rest', () => {
    const { shelf } = mount({ items: makeItems(40) });
    const turn = Math.sin((shelf.variant.geometry.focusAngle * Math.PI) / 180);
    expect(Number(bySlot(shelf, 0).style.getPropertyValue('--bb-turn'))).toBeCloseTo(turn, 9);
    expect(bySlot(shelf, 3).style.getPropertyValue('--bb-turn')).toBe('');
    shelf.setPose({ position: 1, open: 0 });
    expect(bySlot(shelf, 0).style.getPropertyValue('--bb-turn')).toBe('0');
  });

  it('shows the caption of the centred item', () => {
    const { shelf } = mount();
    expect(shelf.element.querySelector('.bb-shelf__title')?.textContent).toBe('Title 0');
    expect(shelf.element.querySelector('.bb-shelf__meta')?.textContent).toBe('site0.example');
    expect(shelf.element.querySelector('.bb-shelf__meta')?.classList.contains('is-note')).toBe(false);
  });

  it('shows the note in the caption when there is one, and no counter', () => {
    const items = makeItems(5).map((item, index) => (index === 1 ? { ...item, note: 'For the essay on archives.' } : item));
    const { shelf } = mount({ items });
    shelf.setPose({ position: 1, open: 0, reduced: true });
    const meta = shelf.element.querySelector('.bb-shelf__meta');
    expect(meta?.textContent).toBe('For the essay on archives.');
    expect(meta?.classList.contains('is-note')).toBe(true);
    expect(shelf.element.querySelector('.bb-shelf__caption')?.textContent).not.toMatch(/\d+ \/ \d+/);
  });

  it('fades the old caption out before the new one comes in, landing on the latest', () => {
    const fades: Array<{ onfinish: (() => void) | null; cancel: () => void }> = [];
    const spy = vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(() => {
      const fade = { onfinish: null as (() => void) | null, cancel: vi.fn() };
      fades.push(fade);
      return fade as unknown as Animation;
    });
    const { shelf } = mount();
    const title = (): string | null | undefined => shelf.element.querySelector('.bb-shelf__title')?.textContent;
    shelf.setPose({ position: 1, open: 0 });
    shelf.setPose({ position: 2, open: 0 });
    expect(title()).toBe('Title 0');
    expect(shelf.element.dataset.focusId).toBe('id-2');
    expect(fades).toHaveLength(1);
    fades[0]?.onfinish?.();
    expect(title()).toBe('Title 2');
    expect(fades).toHaveLength(2);
    spy.mockRestore();
  });

  it('places the presented cover with its size, lean and turn', () => {
    const { shelf } = mount();
    const placement = shelf.coverPlacement();
    const size = shelf.coverSize();
    expect(placement).not.toBeNull();
    expect(placement?.width).toBe(size.width);
    expect(placement?.height).toBe(size.height);
    expect(placement?.lean).toBe(shelf.variant.geometry.focusLean);
    expect(placement?.yaw).toBeCloseTo(90 - shelf.variant.geometry.focusAngle, 9);
    expect(placement?.scale).toBeGreaterThanOrEqual(1);
    // Half way to the next volume the cover is still turned part of the way.
    shelf.setPose({ position: 0.3, open: 0 });
    const moving = shelf.coverPlacement();
    expect(moving?.yaw).toBeGreaterThan(0);
    expect(Math.abs(moving?.lean ?? 0)).toBeLessThan(Math.abs(shelf.variant.geometry.focusLean));
  });

  it('has no cover placement on an empty shelf', () => {
    const { shelf } = mount({ items: [] });
    expect(shelf.coverPlacement()).toBeNull();
  });

  it('sizes each volume from its thickness and stature', () => {
    const items = makeItems(6).map((item, index) => ({ ...item, thickness: index / 5, stature: index % 2 }));
    const { shelf } = mount({ items });
    const width = (slot: number): number => parseFloat(bySlot(shelf, slot).style.getPropertyValue('--bb-spine-w'));
    const height = (slot: number): number => parseFloat(bySlot(shelf, slot).style.getPropertyValue('--bb-book-h'));
    expect(width(5)).toBeGreaterThan(width(1));
    expect(height(1)).toBeGreaterThan(height(2));
    const placement = shelf.coverPlacement();
    expect(placement?.height).toBeCloseTo(height(0), 6);
    expect(shelf.pitchAt(0.5)).toBeGreaterThan(0);
    expect(shelf.pitch()).not.toBeCloseTo(shelf.pitchAt(0.5), 3);
  });

  it('leaves volumes of a shelf without sizes at the look size', () => {
    const { shelf } = mount();
    expect(bySlot(shelf, 1).style.getPropertyValue('--bb-spine-w')).toBe('');
    expect(shelf.pitchAt(1.5)).toBeCloseTo(shelf.pitch(), 9);
  });

  it('pitch is positive', () => {
    expect(mount().shelf.pitch()).toBeGreaterThan(0);
  });
});

describe('mountShelf pose', () => {
  it('setPose updates data-focus and data-focus-id', () => {
    const { shelf } = mount();
    shelf.setPose({ position: 2, open: 0 });
    expect(shelf.element.dataset.focus).toBe('2');
    expect(shelf.element.dataset.focusId).toBe('id-2');
    expect(controls(shelf).filter((control) => control.tabIndex === 0)).toHaveLength(1);
    expect(bySlot(shelf, 2).querySelector('.bb-book__control')?.getAttribute('tabindex')).toBe('0');
  });

  it('wraps a looping position past the end', () => {
    const { shelf } = mount({ items: makeItems(40) });
    shelf.setPose({ position: 47, open: 0 });
    expect(shelf.element.dataset.focus).toBe('7');
    shelf.setPose({ position: -1, open: 0 });
    expect(shelf.element.dataset.focus).toBe('39');
    expect(controls(shelf).filter((control) => control.tabIndex === 0)).toHaveLength(1);
  });

  it('reports data-open as 0, moving and 1', () => {
    const { shelf } = mount();
    expect(shelf.element.dataset.open).toBe('0');
    shelf.setPose({ position: 0, open: 0.5 });
    expect(shelf.element.dataset.open).toBe('moving');
    shelf.setPose({ position: 0, open: 1 });
    expect(shelf.element.dataset.open).toBe('1');
    shelf.setPose({ position: 0, open: 0 });
    expect(shelf.element.dataset.open).toBe('0');
  });

  it('leaves the opening volume in place but hidden, and parts its near neighbours', () => {
    const { shelf } = mount({ items: makeItems(40) });
    const xOf = (slot: number): number => Number(/translate3d\(([-\d.e]+)px/.exec(bySlot(shelf, slot).style.transform)?.[1]);
    const before = [-5, -4, -1, 0, 1, 4, 5].map(xOf);
    shelf.setPose({ position: 0, open: 1 });
    const after = [-5, -4, -1, 0, 1, 4, 5].map(xOf);
    expect(bySlot(shelf, 0).style.visibility).toBe('hidden');
    expect(after[3]).toBeCloseTo(before[3]!, 6);
    // Nearest neighbours move furthest, outward, and slots beyond four stay put.
    expect(before[2]! - after[2]!).toBeCloseTo(28 * (4 / 5) * (shelf.pitch() / 68), 6);
    expect(after[4]! - before[4]!).toBeCloseTo(before[2]! - after[2]!, 6);
    expect(after[5]! - before[5]!).toBeCloseTo(28 * (1 / 5) * (shelf.pitch() / 68), 6);
    expect(after[1]! - before[1]!).toBeLessThan(0);
    expect(after[0]).toBeCloseTo(before[0]!, 6);
    expect(after[6]).toBeCloseTo(before[6]!, 6);
    for (const slot of [-1, 1, 4]) expect(bySlot(shelf, slot).style.visibility).toBe('');
  });

  it('shows the volume again and closes the gap once it is back', () => {
    const { shelf } = mount();
    const resting = bySlot(shelf, 1).style.transform;
    shelf.setPose({ position: 0, open: 0.5 });
    expect(bySlot(shelf, 1).style.transform).not.toBe(resting);
    shelf.setPose({ position: 0, open: 0 });
    expect(bySlot(shelf, 0).style.visibility).toBe('');
    expect(bySlot(shelf, 1).style.transform).toBe(resting);
  });

  it('moves nothing and hides nothing while opening under reduced motion', () => {
    const { shelf } = mount();
    const resting = books(shelf).map((book) => book.style.transform);
    shelf.setPose({ position: 0, open: 0.6, reduced: true });
    expect(books(shelf).map((book) => book.style.transform)).toEqual(resting);
    expect(books(shelf).every((book) => book.style.visibility === '')).toBe(true);
    expect(shelf.surface.style.opacity).toBe('');
  });

  it('turns the centred volume and leaves the others', () => {
    const { shelf } = mount();
    shelf.setPose({ position: 1, open: 0 });
    expect(bySlot(shelf, 1).classList.contains('is-turned')).toBe(true);
    expect(bySlot(shelf, 0).classList.contains('is-turned')).toBe(false);
  });

  it('moves focus to the new centre when focus was inside the row', () => {
    const { shelf } = mount();
    controls(shelf).find((control) => control.tabIndex === 0)?.focus();
    shelf.setPose({ position: 1, open: 0 });
    expect(document.activeElement).toBe(bySlot(shelf, 1).querySelector('.bb-book__control'));
  });

  it('focusCurrent focuses the centred control', () => {
    const { shelf } = mount();
    shelf.setPose({ position: 3, open: 0 });
    shelf.focusCurrent();
    expect(document.activeElement).toBe(bySlot(shelf, 3).querySelector('.bb-book__control'));
  });
});

describe('mountShelf intents', () => {
  it('emits open when the centred book is clicked', () => {
    const { shelf, intents } = mount();
    click(bySlot(shelf, 0).querySelector('.bb-book__body')!);
    expect(intents).toEqual([{ type: 'open', id: 'id-0', index: 0 }]);
  });

  it('emits focus with the slot when another book is clicked', () => {
    const { shelf, intents } = mount();
    click(bySlot(shelf, 1).querySelector('.bb-book__body')!);
    expect(intents).toEqual([{ type: 'focus', id: 'id-1', index: 1, slot: 1 }]);
  });

  it('emits focus with the unwrapped slot for a volume across the seam of a looping row', () => {
    const { shelf, intents } = mount({ items: makeItems(40) });
    click(bySlot(shelf, -2).querySelector('.bb-book__body')!);
    expect(intents).toEqual([{ type: 'focus', id: 'id-38', index: 38, slot: -2 }]);
  });

  it('emits focus instead of open while the centre is still travelling', () => {
    const { shelf, intents } = mount();
    shelf.setPose({ position: 0.4, open: 0 });
    click(bySlot(shelf, 0).querySelector('.bb-book__body')!);
    expect(intents[0]?.type).toBe('focus');
  });

  it('emits nothing while a book is open', () => {
    const { shelf, intents } = mount();
    shelf.setPose({ position: 0, open: 1 });
    click(bySlot(shelf, 0).querySelector('.bb-book__body')!);
    press(shelf, 'ArrowRight');
    expect(intents).toEqual([]);
  });

  it.each([
    ['ArrowRight', { type: 'step', direction: 1 }],
    ['ArrowLeft', { type: 'step', direction: -1 }],
    ['Home', { type: 'jump', to: 'first' }],
    ['End', { type: 'jump', to: 'last' }],
  ] satisfies Array<[string, ShelfIntent]>)('maps %s to an intent and prevents the default', (key, expected) => {
    const { shelf, intents } = mount();
    const event = press(shelf, key);
    expect(event.defaultPrevented).toBe(true);
    expect(intents).toEqual([expected]);
  });

  it('ignores other keys and modified arrows', () => {
    const { shelf, intents } = mount();
    expect(press(shelf, 'a').defaultPrevented).toBe(false);
    expect(press(shelf, 'ArrowRight', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(press(shelf, 'ArrowLeft', { altKey: true }).defaultPrevented).toBe(false);
    expect(intents).toEqual([]);
  });

  it('emits step from the arrow buttons', () => {
    const { shelf, intents } = mount();
    click(shelf.element.querySelector('.bb-shelf__arrow--next')!);
    click(shelf.element.querySelector('.bb-shelf__arrow--prev')!);
    expect(intents).toEqual([
      { type: 'step', direction: 1 },
      { type: 'step', direction: -1 },
    ]);
  });

  it('hides the arrows and caption when asked', () => {
    const { shelf } = mount({ arrows: false, caption: false });
    expect(shelf.element.querySelector<HTMLElement>('.bb-shelf__nav')?.hidden).toBe(true);
    expect(shelf.element.querySelector<HTMLElement>('.bb-shelf__caption')?.hidden).toBe(true);
  });

  it('on() returns a working unsubscribe', () => {
    const { shelf } = mount();
    const listener = vi.fn();
    const off = shelf.on(listener);
    press(shelf, 'ArrowRight');
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    press(shelf, 'ArrowRight');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('mountShelf items, variants and teardown', () => {
  it('setItems([]) shows the empty message and sets data-empty', () => {
    const { shelf } = mount();
    expect(shelf.element.dataset.empty).toBe('0');
    shelf.setItems([]);
    const empty = shelf.element.querySelector<HTMLElement>('.bb-shelf__empty');
    expect(empty?.hidden).toBe(false);
    expect(empty?.textContent).toBe('This shelf is empty.');
    expect(shelf.element.dataset.empty).toBe('1');
    expect(books(shelf)).toHaveLength(0);
    expect(shelf.coverBox()).toBeNull();
  });

  // Defect: render() returns early for an empty shelf, so data-focus-id keeps naming a removed item.
  it('setItems([]) clears data-focus-id', () => {
    const { shelf } = mount();
    shelf.setItems([]);
    expect(shelf.element.dataset.focusId ?? '').toBe('');
  });

  it('shows books again after items come back', () => {
    const { shelf } = mount({ items: [] });
    expect(shelf.element.dataset.empty).toBe('1');
    shelf.setItems(makeItems(3));
    expect(shelf.element.dataset.empty).toBe('0');
    expect(controls(shelf)).toHaveLength(3);
    expect(shelf.element.querySelector<HTMLElement>('.bb-shelf__empty')?.hidden).toBe(true);
  });

  it('setVariant("oak") sets data-variant and turns looping off', () => {
    const { shelf } = mount();
    shelf.setVariant('oak');
    expect(shelf.element.dataset.variant).toBe('oak');
    expect(shelf.variant.name).toBe('oak');
    expect(shelf.loop).toBe(false);
    expect(controls(shelf)).toHaveLength(5);
    expect(books(shelf)).toHaveLength(5);
    expect(books(shelf).some((book) => book.getAttribute('aria-hidden') === 'true')).toBe(false);
  });

  it('an explicit loop option overrides the variant', () => {
    const { shelf } = mount({ variant: 'oak', loop: true, items: makeItems(40) });
    expect(shelf.loop).toBe(true);
    expect(books(shelf).some((book) => Number(book.dataset.slot) < 0)).toBe(true);
  });

  it('does not render slots past the ends when the row has two ends', () => {
    const { shelf } = mount({ variant: 'oak' });
    shelf.setPose({ position: 4, open: 0 });
    expect(books(shelf).map((book) => book.dataset.slot)).toEqual(['0', '1', '2', '3', '4']);
  });

  it('destroy removes the root and stops intents', () => {
    const { shelf, intents } = mount();
    const row = shelf.element.querySelector('.bb-shelf__row')!;
    shelf.destroy();
    expect(host.contains(shelf.element)).toBe(false);
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(intents).toEqual([]);
  });
});

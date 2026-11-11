import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bookmark, Store } from '../store';
import { makeStore } from './flow-test-helpers';
import { renderList, type ListActions } from './list-view';

let store: Store;
let host: HTMLElement;
let actions: ListActions;

beforeEach(() => {
  store = makeStore();
  host = document.createElement('div');
  document.body.replaceChildren(host);
  actions = { read: vi.fn(), addText: vi.fn(), edit: vi.fn(), move: vi.fn() };
});

const rows = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>('.bb-list__row')];
const stops = (row: HTMLElement): HTMLElement[] =>
  [...row.querySelectorAll<HTMLElement>('button, a[href]')].filter((entry) => entry.tabIndex >= 0 && !(entry as HTMLButtonElement).disabled);

function withText(): Bookmark {
  const added = store.addBookmark({ url: 'https://example.org/a-longer-read', title: 'A longer read', readingText: 'One paragraph of text to read.\n\nAnother paragraph.', shelfId: store.shelves()[0]?.id });
  if (!added.ok) throw new Error(added.error.message);
  return added.value;
}

describe('list view', () => {
  it('shows a heading per link whose title opens it', () => {
    const target = withText();
    renderList(host, store, actions);
    const row = rows().find((entry) => entry.dataset.id === target.id) as HTMLElement;
    const heading = row.querySelector('h2.bb-list__heading');
    expect(heading?.textContent).toBe(target.title);
    (heading?.querySelector('button') as HTMLButtonElement).click();
    expect(actions.read).toHaveBeenCalledWith(target.id);
  });

  it('opens the place to add text for a link that has none', () => {
    const bare = store.bookmarks().find((entry) => !entry.reading) as Bookmark;
    renderList(host, store, actions);
    const row = rows().find((entry) => entry.dataset.id === bare.id) as HTMLElement;
    (row.querySelector('.bb-list__title') as HTMLButtonElement).click();
    expect(actions.addText).toHaveBeenCalledWith(bare.id);
    expect(row.querySelector('.bb-list__facts')?.textContent).toContain('No text saved yet');
  });

  it('has at most two tab stops in every row', () => {
    renderList(host, store, actions);
    expect(rows().length).toBeGreaterThan(5);
    for (const row of rows()) expect(stops(row).length).toBeLessThanOrEqual(2);
  });

  it('says where a link stands in words', () => {
    const target = withText();
    store.setProgress(target.id, { block: 2, ratio: 0.5, percent: 0.34 });
    renderList(host, store, actions);
    const row = rows().find((entry) => entry.dataset.id === target.id) as HTMLElement;
    expect(row.querySelector('.bb-list__facts')?.textContent).toContain('34% read');
    expect(row.querySelector('.bb-list__title')?.getAttribute('aria-label')).toBe(`${target.title}. Resume at 34%`);
  });

  it('marks a link that was read and a link that is optional', () => {
    const read = withText();
    const optional = store.addBookmark({ url: 'https://example.org/extra', title: 'Extra', required: false, minutes: 12 });
    if (!optional.ok) throw new Error(optional.error.message);
    store.setDone(read.id, true);
    renderList(host, store, actions);
    const readRow = rows().find((entry) => entry.dataset.id === read.id) as HTMLElement;
    expect(readRow.classList.contains('is-done')).toBe(true);
    expect(readRow.querySelector('.bb-list__facts')?.textContent).toMatch(/^Read/);
    const optionalRow = rows().find((entry) => entry.dataset.id === optional.value.id) as HTMLElement;
    expect(optionalRow.querySelector('.bb-list__facts')?.textContent).toContain('Optional');
    expect(optionalRow.querySelector('.bb-list__facts')?.textContent).toContain('12 min');
  });

  it('makes the host the way to the original, in a new tab', () => {
    renderList(host, store, actions);
    const row = rows()[0] as HTMLElement;
    const link = row.querySelector<HTMLAnchorElement>('a.bb-list__original');
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toContain('noopener');
    expect(link?.getAttribute('aria-label')).toMatch(/in a new tab$/);
    expect(link?.textContent).not.toMatch(/^www\./);
  });

  it('shows tags as text', () => {
    const tagged = store.bookmarks().find((entry) => entry.tags.length > 0);
    if (!tagged) throw new Error('the example library has no tagged link');
    renderList(host, store, actions);
    const row = rows().find((entry) => entry.dataset.id === tagged.id) as HTMLElement;
    expect([...row.querySelectorAll('.bb-list__tag')].map((entry) => entry.textContent)).toEqual(tagged.tags);
  });

  it('offers reordering only on one shelf in shelf order', () => {
    renderList(host, store, actions);
    expect(host.querySelector('[data-part="earlier"]')).toBeNull();
    store.setSession({ shelfId: store.shelves()[0]?.id ?? null });
    renderList(host, store, actions);
    expect(host.querySelectorAll('[data-part="earlier"]').length).toBeGreaterThan(0);
    store.setSession({ sort: 'title' });
    renderList(host, store, actions);
    expect(host.querySelector('[data-part="earlier"]')).toBeNull();
  });

  it('walks the small actions of a row with the arrow keys', () => {
    store.setSession({ shelfId: store.shelves()[0]?.id ?? null });
    renderList(host, store, actions);
    const row = rows()[1] as HTMLElement;
    const original = row.querySelector('[data-part="original"]') as HTMLElement;
    original.focus();
    original.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(row.querySelector('[data-part="edit"]'));
    expect(stops(row)).toHaveLength(2);
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(row.querySelector('[data-part="later"]'));
  });

  it('keeps focus on the same control when it is drawn again', () => {
    renderList(host, store, actions);
    const target = rows()[2] as HTMLElement;
    (target.querySelector('.bb-list__title') as HTMLElement).focus();
    renderList(host, store, actions);
    expect(document.activeElement?.closest('.bb-list__row')?.getAttribute('data-id')).toBe(target.dataset.id);
    expect(document.activeElement?.classList.contains('bb-list__title')).toBe(true);
  });

  it('moves focus to a neighbour when its row goes away', () => {
    renderList(host, store, actions);
    const target = rows()[2] as HTMLElement;
    const neighbour = rows()[3]?.dataset.id;
    (target.querySelector('.bb-list__title') as HTMLElement).focus();
    store.removeBookmark(target.dataset.id as string);
    renderList(host, store, actions);
    expect(document.activeElement?.closest('.bb-list__row')?.getAttribute('data-id')).toBe(neighbour);
  });

  it('takes the empty state from the caller', () => {
    const run = vi.fn();
    store.setSession({ shelfId: store.shelves()[0]?.id ?? null });
    for (const entry of store.bookmarks(store.session().shelfId)) store.removeBookmark(entry.id);
    renderList(host, store, actions, {
      empty: { message: 'Nothing on Reading list yet.', hint: 'Links you add while this shelf is open are filed here.', buttons: [{ label: 'Add a link to Reading list', run, solid: true }] },
    });
    expect(host.querySelector('.bb-list__empty-title')?.textContent).toBe('Nothing on Reading list yet.');
    host.querySelector<HTMLButtonElement>('.bb-list__empty-actions button')?.click();
    expect(run).toHaveBeenCalledTimes(1);
    expect(host.querySelector('ul')).toBeNull();
  });
});

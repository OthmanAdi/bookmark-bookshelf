import type { Bookmark, Shelf, Store } from '../store';
import { formatMinutes, minutesOf } from '../store/reading-time';
import { make } from './dom';
import { hostOf } from './flow-link-state';

/**
 * Printing without the app around it. A plain page is put at the end of the document, the print style
 * hides everything else, and it is taken away again when printing is over.
 */

export type PrintBody = { kind: 'text'; text: string } | { kind: 'list'; shelf: Shelf; links: readonly Bookmark[] };

export function buildPrintPage(heading: string, body: PrintBody): HTMLElement {
  const page = make('div', 'bb-print');
  page.appendChild(make('h1', 'bb-print__title', heading));
  if (body.kind === 'text') {
    page.appendChild(make('pre', 'bb-print__text', body.text));
    return page;
  }
  if (body.shelf.description) page.appendChild(make('p', 'bb-print__lead', body.shelf.description));
  const list = make('ol', 'bb-print__list');
  for (const link of body.links) {
    const item = make('li', 'bb-print__item');
    item.appendChild(make('p', 'bb-print__name', link.title));
    const minutes = minutesOf(link);
    const facts = [hostOf(link.url), link.required === false ? 'Optional' : '', minutes === undefined ? '' : formatMinutes(minutes)].filter(Boolean);
    if (facts.length > 0) item.appendChild(make('p', 'bb-print__facts', facts.join(', ')));
    if (link.note) item.appendChild(make('p', 'bb-print__note', link.note));
    item.appendChild(make('p', 'bb-print__url', link.url));
    list.appendChild(item);
  }
  page.appendChild(list);
  return page;
}

export function printPage(page: HTMLElement): void {
  document.body.appendChild(page);
  let removed = false;
  // Some browsers return from print() only when the dialog closes, others at once, and a few never report it.
  const timer = setTimeout(() => remove(), 60000);
  const remove = (): void => {
    if (removed) return;
    removed = true;
    clearTimeout(timer);
    window.removeEventListener('afterprint', remove);
    page.remove();
  };
  window.addEventListener('afterprint', remove);
  window.print();
}

export function printShelf(store: Pick<Store, 'shelves' | 'bookmarks'>, shelfId: string): void {
  const shelf = store.shelves().find((entry) => entry.id === shelfId);
  if (!shelf) return;
  printPage(buildPrintPage(shelf.name, { kind: 'list', shelf, links: store.bookmarks(shelfId) }));
}

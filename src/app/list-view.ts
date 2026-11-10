import { resolveCloth } from '../shelf';
import type { Bookmark, Store } from '../store';
import { hostnameOf } from './bookshelf';
import { button, make } from './dom';

/**
 * Plain list of every volume on the active shelf. It is the accessible
 * fallback for the 3D row and the quickest way to manage a long shelf:
 * the same actions, ordinary elements, no motion.
 */
export interface ListActions {
  read(id: string): void;
  addText(id: string): void;
  edit(id: string): void;
  move(id: string, direction: -1 | 1): void;
}

export function renderList(host: HTMLElement, store: Store, actions: ListActions): void {
  const shelfId = store.session().shelfId;
  const bookmarks = store.bookmarks(shelfId);
  const shelfNames = new Map(store.shelves().map((shelf) => [shelf.id, shelf.name]));

  const list = make('ul', 'bb-list');
  list.setAttribute('role', 'list');
  list.setAttribute('aria-label', 'Volumes on this shelf');

  bookmarks.forEach((bookmark, index) => {
    list.appendChild(row(bookmark, index, bookmarks, store, shelfNames, shelfId !== null, actions));
  });

  const nodes: Node[] = [];
  if (bookmarks.length === 0) nodes.push(make('p', 'bb-list__empty', 'This shelf is empty. Add a link to start it.'));
  else nodes.push(list);
  host.replaceChildren(...nodes);
}

function row(
  bookmark: Bookmark,
  index: number,
  all: Bookmark[],
  store: Store,
  shelfNames: Map<string, string>,
  canReorder: boolean,
  actions: ListActions,
): HTMLLIElement {
  const item = make('li', 'bb-list__row');
  item.dataset.id = bookmark.id;

  const swatch = make('span', `bb-list__swatch bb-cloth--${resolveCloth(bookmark.cover.cloth)}`);
  swatch.setAttribute('aria-hidden', 'true');

  const main = make('div', 'bb-list__main');
  const title = button(bookmark.title, 'bb-list__title', () => actions.read(bookmark.id));
  const percent = Math.round((store.progress(bookmark.id)?.percent ?? 0) * 100);
  const facts = [hostnameOf(bookmark.url), shelfNames.get(bookmark.shelfId) ?? ''];
  facts.push(bookmark.reading ? (percent > 0 ? `${percent}% read` : 'Not started') : 'Link only');
  main.append(title, make('p', 'bb-list__facts bb-label', facts.filter(Boolean).join('  ·  ')));
  if (bookmark.note) main.appendChild(make('p', 'bb-list__note', bookmark.note));

  const tools = make('div', 'bb-list__tools');
  if (bookmark.reading) {
    tools.appendChild(button(percent > 0 ? 'Continue' : 'Read', 'bb-button', () => actions.read(bookmark.id)));
  } else {
    tools.appendChild(button('Add reading text', 'bb-button', () => actions.addText(bookmark.id)));
  }
  const original = make('a', 'bb-button', 'Open original');
  original.href = bookmark.url;
  original.target = '_blank';
  original.rel = 'noopener noreferrer';
  original.setAttribute('aria-label', `Open original of ${bookmark.title} in a new tab`);
  tools.appendChild(original);
  tools.appendChild(button('Edit', 'bb-button bb-button--quiet', () => actions.edit(bookmark.id)));

  if (canReorder) {
    const up = button('↑', 'bb-button bb-button--quiet bb-list__move', () => actions.move(bookmark.id, -1));
    up.setAttribute('aria-label', `Move ${bookmark.title} earlier`);
    up.disabled = index === 0;
    const down = button('↓', 'bb-button bb-button--quiet bb-list__move', () => actions.move(bookmark.id, 1));
    down.setAttribute('aria-label', `Move ${bookmark.title} later`);
    down.disabled = index === all.length - 1;
    tools.append(up, down);
  }

  item.append(swatch, main, tools);
  return item;
}

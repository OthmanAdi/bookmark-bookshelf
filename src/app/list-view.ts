import { resolveCloth } from '../shelf';
import type { Bookmark, Store } from '../store';
import { formatMinutes, minutesOf } from '../store/reading-time';
import { sortVolumes } from '../store/sort';
import { button, make } from './dom';
import { hostOf, linkState } from './flow-link-state';

/**
 * Plain list of every link on the active shelf. It is the full alternative to the 3D row and the
 * quickest way to manage a long shelf: ordinary elements, no motion. Each row has two tab stops, the
 * title, which opens the link, and one group of small actions that is walked with the arrow keys.
 */
export interface ListActions {
  read(id: string): void;
  addText(id: string): void;
  edit(id: string): void;
  move(id: string, direction: -1 | 1): void;
}

export interface ListOptions {
  /** What to show when there is nothing to list: a sentence, and the buttons that help. */
  empty?: {
    message: string;
    hint?: string;
    buttons?: Array<{ label: string; run: () => void; solid?: boolean }>;
  };
}

interface FocusKey {
  id: string;
  part: string;
  index: number;
}

const TITLE = 'title';

function focusKeyOf(host: HTMLElement): FocusKey | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !host.contains(active)) return null;
  const row = active.closest<HTMLElement>('.bb-list__row');
  if (!row?.dataset.id) return null;
  const rows = [...host.querySelectorAll<HTMLElement>('.bb-list__row')];
  return { id: row.dataset.id, part: active.dataset.part ?? TITLE, index: rows.indexOf(row) };
}

function restoreFocus(host: HTMLElement, key: FocusKey): void {
  const rows = [...host.querySelectorAll<HTMLElement>('.bb-list__row')];
  const same = rows.find((row) => row.dataset.id === key.id);
  const target = same ?? rows[Math.min(key.index, rows.length - 1)];
  if (target) {
    const wanted = same ? target.querySelector<HTMLElement>(`[data-part="${key.part}"]`) : null;
    (wanted ?? target.querySelector<HTMLElement>(`[data-part="${TITLE}"]`))?.focus({ preventScroll: true });
    return;
  }
  host.querySelector<HTMLElement>('button, a')?.focus({ preventScroll: true });
}

export function renderList(host: HTMLElement, store: Store, actions: ListActions, options: ListOptions = {}): void {
  const key = focusKeyOf(host);
  const session = store.session();
  const shelfId = session.shelfId;
  const mode = session.sort ?? 'manual';
  const stored = store.bookmarks(shelfId);
  const bookmarks = mode === 'manual' ? stored : sortVolumes(stored, mode, { percentOf: (id) => store.progress(id)?.percent ?? 0, isDone: (id) => store.isDone(id) });
  const shelfNames = new Map(store.shelves().map((shelf) => [shelf.id, shelf.name]));
  const canReorder = shelfId !== null && mode === 'manual';

  if (bookmarks.length === 0) {
    host.replaceChildren(empty(options.empty));
  } else {
    const list = make('ul', 'bb-list');
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', shelfId ? `Links on ${shelfNames.get(shelfId) ?? 'this shelf'}` : 'All links');
    bookmarks.forEach((bookmark, index) => {
      list.appendChild(row(bookmark, index, bookmarks, store, shelfNames, shelfId === null, canReorder, actions));
    });
    host.replaceChildren(list);
  }
  if (key) restoreFocus(host, key);
}

function empty(content: ListOptions['empty']): HTMLElement {
  const box = make('div', 'bb-list__empty');
  box.appendChild(make('p', 'bb-list__empty-title', content?.message ?? 'Nothing here yet.'));
  if (content?.hint) box.appendChild(make('p', 'bb-list__empty-hint', content.hint));
  if (content?.buttons?.length) {
    const buttons = make('div', 'bb-list__empty-actions');
    for (const entry of content.buttons) {
      buttons.appendChild(button(entry.label, entry.solid ? 'bb-button bb-button--solid' : 'bb-button', entry.run));
    }
    box.appendChild(buttons);
  }
  return box;
}

function factsOf(bookmark: Bookmark, state: string, minutes: number | undefined, shelfName: string | undefined): string {
  const parts = [state];
  if (bookmark.required === false) parts.push('Optional');
  if (minutes !== undefined) parts.push(formatMinutes(minutes));
  if (shelfName) parts.push(shelfName);
  return parts.join(', ');
}

function row(
  bookmark: Bookmark,
  index: number,
  all: Bookmark[],
  store: Store,
  shelfNames: Map<string, string>,
  showShelf: boolean,
  canReorder: boolean,
  actions: ListActions,
): HTMLLIElement {
  const item = make('li', 'bb-list__row');
  item.dataset.id = bookmark.id;
  const state = linkState(store, bookmark);
  if (state.done) item.classList.add('is-done');

  const swatch = make('span', `bb-list__swatch bb-cloth--${resolveCloth(bookmark.cover.cloth)}`);
  swatch.setAttribute('aria-hidden', 'true');

  const main = make('div', 'bb-list__main');
  const heading = make('h2', 'bb-list__heading');
  const open = button(bookmark.title, 'bb-list__title', () => (state.hasText ? actions.read(bookmark.id) : actions.addText(bookmark.id)));
  open.dataset.part = TITLE;
  open.setAttribute('aria-label', `${bookmark.title}. ${state.action}`);
  heading.appendChild(open);
  main.append(heading, make('p', 'bb-list__facts', factsOf(bookmark, state.state, minutesOf(bookmark), showShelf ? shelfNames.get(bookmark.shelfId) : undefined)));
  if (bookmark.note) main.appendChild(make('p', 'bb-list__note', bookmark.note));
  if (bookmark.tags.length > 0) {
    const tags = make('ul', 'bb-list__tags');
    tags.setAttribute('aria-label', 'Tags');
    for (const tag of bookmark.tags) tags.appendChild(make('li', 'bb-list__tag', tag));
    main.appendChild(tags);
  }

  const tools = make('div', 'bb-list__tools');
  tools.setAttribute('role', 'toolbar');
  tools.setAttribute('aria-label', `Actions for ${bookmark.title}`);

  const host = hostOf(bookmark.url);
  const original = make('a', 'bb-list__original', host);
  original.href = bookmark.url;
  original.target = '_blank';
  original.rel = 'noopener noreferrer';
  original.dataset.part = 'original';
  original.setAttribute('aria-label', `${host}, open the original of ${bookmark.title} in a new tab`);

  const edit = button('Edit', 'bb-button bb-button--quiet', () => actions.edit(bookmark.id));
  edit.dataset.part = 'edit';
  edit.setAttribute('aria-label', `Edit ${bookmark.title}`);
  tools.append(original, edit);

  if (canReorder) {
    const earlier = button('Earlier', 'bb-button bb-button--quiet', () => actions.move(bookmark.id, -1));
    earlier.dataset.part = 'earlier';
    earlier.setAttribute('aria-label', `Move ${bookmark.title} earlier`);
    earlier.disabled = index === 0;
    const later = button('Later', 'bb-button bb-button--quiet', () => actions.move(bookmark.id, 1));
    later.dataset.part = 'later';
    later.setAttribute('aria-label', `Move ${bookmark.title} later`);
    later.disabled = index === all.length - 1;
    tools.append(earlier, later);
  }
  roving(tools);

  item.append(swatch, main, tools);
  return item;
}

/** One tab stop for a group of small actions: the arrow keys, Home and End walk the rest. */
function roving(group: HTMLElement): void {
  const stops = (): HTMLElement[] => [...group.children].filter((entry): entry is HTMLElement => entry instanceof HTMLElement && !(entry as HTMLButtonElement).disabled);
  const settle = (current: HTMLElement): void => {
    for (const entry of group.children) if (entry instanceof HTMLElement) entry.tabIndex = entry === current ? 0 : -1;
  };
  const first = stops()[0];
  if (first) settle(first);
  group.addEventListener('focusin', (event) => {
    if (event.target instanceof HTMLElement && group.contains(event.target)) settle(event.target);
  });
  group.addEventListener('keydown', (event) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    const list = stops();
    const at = list.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : (at + (event.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length;
    list[next]?.focus();
  });
}

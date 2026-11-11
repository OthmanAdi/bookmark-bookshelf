import '../styles/base.css';
import './app.css';
import './flows.css';
import { sampleLibrary } from '../data/sample-library';
import { listVariants } from '../shelf';
import { createStore, type Bookmark } from '../store';
import { createBookshelf } from './bookshelf';
import { button, downloadText, make, must, option, toast } from './dom';
import { askText } from './editor';
import { createFlows } from './flows';
import { renderList } from './list-view';

/**
 * The app shell: page chrome around the composed bookshelf.
 * State lives in the store; this file turns clicks into store calls and redraws.
 */
const store = createStore({ seed: () => sampleLibrary() });

const shelfHost = must<HTMLElement>('#shelf');
const listHost = must<HTMLElement>('#list');
const tabs = must<HTMLElement>('#tabs');
const shelfTools = must<HTMLElement>('#shelf-tools');
const viewToggle = must<HTMLButtonElement>('#view');
const variantPicker = must<HTMLSelectElement>('#variant');

let lastOpenedId: string | null = null;

const bookshelf = createBookshelf({
  store,
  shelfHost,
  readerHost: must<HTMLElement>('#reader'),
  background: [must<HTMLElement>('#chrome')],
  label: 'Your shelf',
  onFocusChange: (bookmark) => {
    renderActions(bookmark);
    markCurrentShelf(bookmark);
  },
  onOpenChange: (bookmark) => {
    if (bookmark) {
      lastOpenedId = bookmark.id;
      return;
    }
    // In list view the row that opened the reader may have been redrawn while it was open. Find it again by id.
    if (store.session().view !== 'list' || document.activeElement !== document.body || !lastOpenedId) return;
    const rows = listHost.querySelectorAll<HTMLElement>('.bb-list__row');
    const row = [...rows].find((entry) => entry.dataset.id === lastOpenedId);
    row?.querySelector<HTMLElement>('.bb-list__title')?.focus({ preventScroll: true });
  },
});

const flows = createFlows({ store, bookshelf, refresh: () => renderAll() });

/* ---------- actions under the centred volume ---------- */

function move(id: string, direction: -1 | 1): void {
  const bookmark = store.get(id);
  if (!bookmark) return;
  const siblings = store.bookmarks(bookmark.shelfId);
  const index = siblings.findIndex((entry) => entry.id === id);
  const target = index + direction;
  if (target < 0 || target >= siblings.length) return;
  store.moveBookmark(id, { index: target });
  bookshelf.show(id, { immediate: true });
}

function renderActions(bookmark: Bookmark | undefined): void {
  const host = bookshelf.shelf.actions;
  if (!bookmark) {
    host.replaceChildren();
    return;
  }
  const percent = Math.round((store.progress(bookmark.id)?.percent ?? 0) * 100);
  const nodes: HTMLElement[] = [];

  if (bookmark.reading) {
    const label = percent > 0 && percent < 100 ? `Continue reading, ${percent}%` : 'Read';
    nodes.push(button(label, 'bb-button bb-button--solid', () => void bookshelf.open(bookmark.id)));
  } else {
    // A link without saved text: say so, and offer the two honest ways forward.
    nodes.push(
      button('Add reading text', 'bb-button bb-button--solid', () => void bookshelf.open(bookmark.id, { editCopy: true })),
    );
  }

  const original = make('a', 'bb-button', 'Open original');
  original.href = bookmark.url;
  original.target = '_blank';
  original.rel = 'noopener noreferrer';
  original.setAttribute('aria-label', `Open original of ${bookmark.title} in a new tab`);
  nodes.push(original);

  nodes.push(button('Edit', 'bb-button bb-button--quiet', () => flows.editLink(bookmark.id)));

  if (store.session().shelfId !== null) {
    const earlier = button('← Move', 'bb-button bb-button--quiet', () => move(bookmark.id, -1));
    earlier.setAttribute('aria-label', `Move ${bookmark.title} one place earlier`);
    const later = button('Move →', 'bb-button bb-button--quiet', () => move(bookmark.id, 1));
    later.setAttribute('aria-label', `Move ${bookmark.title} one place later`);
    nodes.push(earlier, later);
  }
  host.replaceChildren(...nodes);
}

/* ---------- shelves ---------- */

function shelfNameError(value: string, ownId?: string): string | null {
  const name = value.trim();
  if (name.length === 0) return 'Give the shelf a name.';
  if (name.length > 60) return 'Keep the name under 60 characters.';
  const taken = store.shelves().some((shelf) => shelf.id !== ownId && shelf.name.toLowerCase() === name.toLowerCase());
  return taken ? 'A shelf with that name already exists.' : null;
}

function renderTabs(): void {
  const active = store.session().shelfId;
  const entries: Array<{ id: string | null; name: string; count: number }> = [
    { id: null, name: 'All', count: store.bookmarks(null).length },
    ...store.shelves().map((shelf) => ({ id: shelf.id, name: shelf.name, count: store.bookmarks(shelf.id).length })),
  ];

  const nodes = entries.map((entry) => {
    const tab = button(entry.name, 'bb-tab', () => {
      bookshelf.setShelf(entry.id);
      renderAll();
    });
    tab.setAttribute('aria-pressed', String(entry.id === active));
    tab.dataset.shelf = entry.id ?? '';
    tab.appendChild(make('span', 'bb-tab__count', String(entry.count)));
    return tab;
  });

  nodes.push(
    button('New shelf', 'bb-tab bb-tab--new', async () => {
      const name = await askText('New shelf', 'Name', '', (value) => shelfNameError(value));
      if (name === null) return;
      const result = store.addShelf(name);
      if (!result.ok) return toast(result.error.message);
      bookshelf.setShelf(result.value.id);
      renderAll();
    }),
  );
  tabs.replaceChildren(...nodes);

  const tools: HTMLElement[] = [];
  const shelf = store.shelves().find((entry) => entry.id === active);
  if (shelf) {
    tools.push(
      button('Rename shelf', 'bb-button bb-button--quiet', async () => {
        const name = await askText('Rename shelf', 'Name', shelf.name, (value) => shelfNameError(value, shelf.id));
        if (name === null) return;
        const result = store.renameShelf(shelf.id, name);
        if (!result.ok) toast(result.error.message);
        renderAll();
      }),
    );
    if (store.shelves().length > 1) {
      tools.push(
        button('Remove shelf', 'bb-button bb-button--quiet', () => {
          const moved = store.bookmarks(shelf.id).length;
          const result = store.removeShelf(shelf.id);
          if (!result.ok) return toast(result.error.message);
          const home = store.shelves()[0]?.name ?? 'another shelf';
          toast(moved > 0 ? `Removed "${shelf.name}". Its ${moved} volumes moved to "${home}".` : `Removed "${shelf.name}".`);
          bookshelf.setShelf(null);
          renderAll();
        }),
      );
    }
  }
  shelfTools.replaceChildren(...tools);
  markCurrentShelf(bookshelf.current());
}

/** In the "All" view, mark which shelf the centred volume belongs to. */
function markCurrentShelf(bookmark: Bookmark | undefined): void {
  for (const tab of tabs.querySelectorAll<HTMLElement>('.bb-tab')) {
    tab.classList.toggle('is-here', bookmark !== undefined && tab.dataset.shelf === bookmark.shelfId);
  }
}

/* ---------- list view ---------- */

function renderListView(): void {
  renderList(listHost, store, {
    read: (id) => void bookshelf.open(id),
    addText: (id) => void bookshelf.open(id, { editCopy: true }),
    edit: (id) => flows.editLink(id),
    move,
  });
}

function applyView(): void {
  const list = store.session().view === 'list';
  shelfHost.hidden = list;
  listHost.hidden = !list;
  viewToggle.setAttribute('aria-pressed', String(list));
  viewToggle.textContent = list ? 'Shelf view' : 'List view';
  if (list) renderListView();
  else bookshelf.shelf.refresh();
}

function renderAll(): void {
  renderTabs();
  renderActions(bookshelf.current());
  if (store.session().view === 'list') renderListView();
}

/* ---------- wiring ---------- */

for (const variant of listVariants()) variantPicker.appendChild(option(variant.name, variant.label));
variantPicker.value = bookshelf.shelf.variant.name;
variantPicker.addEventListener('change', () => bookshelf.setVariant(variantPicker.value));

viewToggle.addEventListener('click', () => {
  store.setSession({ view: store.session().view === 'list' ? 'shelf' : 'list' });
  applyView();
});

must<HTMLButtonElement>('#add').addEventListener('click', () => flows.addLink());

must<HTMLButtonElement>('#export').addEventListener('click', () => {
  downloadText(`bookmark-bookshelf-${new Date().toISOString().slice(0, 10)}.json`, store.exportLibrary());
  toast('Library exported as a JSON file.');
});

const importFile = must<HTMLInputElement>('#import-file');
must<HTMLButtonElement>('#import').addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  importFile.value = '';
  if (!file) return;
  const result = store.importLibrary(await file.text(), 'merge');
  if (!result.ok) return toast(`Import failed: ${result.error.message}`);
  toast(`Imported: ${result.value.added} added, ${result.value.updated} updated.`);
  renderAll();
});

must<HTMLButtonElement>('#samples').addEventListener('click', () => {
  const result = store.importLibrary(sampleLibrary(), 'merge');
  if (!result.ok) return toast(result.error.message);
  toast(`Sample volumes: ${result.value.added} added, ${result.value.updated} already here.`);
  renderAll();
});

must<HTMLElement>('#persistence').textContent =
  store.persistence === 'local' ? 'Saved in this browser only' : 'Storage is blocked: changes last until you close this tab';

store.subscribe((event) => {
  if (event.reason === 'session') return;
  if (event.reason === 'progress') {
    if (!bookshelf.isOpen()) renderActions(bookshelf.current());
    return;
  }
  renderAll();
});

// Alt + arrows reorder the centred volume, matching the Move buttons.
shelfHost.addEventListener('keydown', (event) => {
  if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
  const bookmark = bookshelf.current();
  if (!bookmark || store.session().shelfId === null) return;
  event.preventDefault();
  move(bookmark.id, event.key === 'ArrowLeft' ? -1 : 1);
});

window.addEventListener('pagehide', () => store.flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') store.flush();
});

renderAll();
applyView();
flows.handleAddress();

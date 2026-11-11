import '../styles/base.css';
import './app.css';
import './flows.css';
import { sampleLibrary } from '../data/sample-library';
import { listVariants } from '../shelf';
import { createStore, type Bookmark, type Store } from '../store';
import { minutesOf } from '../store/reading-time';
import { createBookshelf } from './bookshelf';
import { button, downloadText, make, must, option, toast } from './dom';
import { askText } from './editor';
import { createFlows } from './flows';
import { renderList } from './list-view';
import { createStageCaption, type LinkView } from './shell-stage';

/**
 * The app shell: page chrome around the composed bookshelf.
 * State lives in the store; this file turns clicks into store calls and redraws.
 */
const store = createStore({ seed: () => sampleLibrary() });

const chrome = must<HTMLElement>('#chrome');
const shelfHost = must<HTMLElement>('#shelf');
const listHost = must<HTMLElement>('#list');
const tabs = must<HTMLElement>('#tabs');
const shelfTools = must<HTMLElement>('#shelf-tools');
const viewToggle = must<HTMLButtonElement>('#view');
const variantPicker = must<HTMLSelectElement>('#variant');

const captionHost = must<HTMLElement>('#caption');

let lastOpenedId: string | null = null;
/** The links of the row in row order, read again whenever the row is rebuilt. */
let row: Bookmark[] = [];
let shownId: string | null | undefined;
/** The bookshelf may report a change while it is still being built; the frame answers once it exists. */
let ready = false;

const bookshelf = createBookshelf({
  store,
  shelfHost,
  readerHost: must<HTMLElement>('#reader'),
  background: [chrome],
  label: 'Your shelf',
  caption: false,
  arrows: false,
  onFocusChange: (bookmark) => {
    if (!ready) return;
    // The row was rebuilt or retargeted: read its links again before describing the centre.
    row = store.bookmarks(store.session().shelfId);
    syncStage();
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

/* ---------- the caption and actions under the row ---------- */

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

function isDone(id: string): boolean {
  const probe = store as Store & { isDone?: (id: string) => boolean };
  return typeof probe.isDone === 'function' ? probe.isDone(id) : false;
}

/** Counting words of a long text is not free: keep the answer until the text is saved again. */
const minutesCache = new Map<string, { savedAt: string; minutes: number | undefined }>();

function minutesFor(bookmark: Bookmark): number | undefined {
  const savedAt = bookmark.reading?.savedAt ?? '';
  const cached = minutesCache.get(bookmark.id);
  if (cached && cached.savedAt === savedAt) return cached.minutes;
  const minutes = minutesOf(bookmark);
  minutesCache.set(bookmark.id, { savedAt, minutes });
  return minutes;
}

function linkView(bookmark: Bookmark): LinkView {
  return {
    id: bookmark.id,
    title: bookmark.title,
    url: bookmark.url,
    note: bookmark.note,
    addedAt: bookmark.addedAt,
    hasText: bookmark.reading !== undefined,
    percent: store.progress(bookmark.id)?.percent ?? 0,
    done: isDone(bookmark.id),
    minutes: minutesFor(bookmark),
  };
}

const stage = createStageCaption(
  {
    root: captionHost,
    title: must<HTMLElement>('#caption-title'),
    line: must<HTMLElement>('#caption-line'),
    previous: must<HTMLButtonElement>('#caption-prev'),
    next: must<HTMLButtonElement>('#caption-next'),
    primary: must<HTMLButtonElement>('#action-primary'),
    original: must<HTMLAnchorElement>('#action-original'),
    edit: must<HTMLButtonElement>('#action-edit'),
    earlier: must<HTMLButtonElement>('#action-earlier'),
    later: must<HTMLButtonElement>('#action-later'),
  },
  {
    step: (direction) => bookshelf.motion.step(direction),
    primary: (id, kind) => {
      if (kind === 'add-text') return void bookshelf.open(id, { editCopy: true });
      // Reading again starts from the top, not from the end where the last reading stopped.
      if (kind === 'again') store.clearProgress(id);
      void bookshelf.open(id);
    },
    edit: (id) => flows.editLink(id),
    move,
  },
  { reduced: () => bookshelf.motion.state.reduced },
);

/** Above this speed (links per millisecond) the caption holds still instead of flickering through titles. */
const FAST = 0.006;

/** The link visibly in the centre: the rounded position, not where the row is heading. */
function centredIndex(position: number): number {
  const count = row.length;
  if (count === 0) return -1;
  const nearest = Math.round(position);
  return bookshelf.shelf.loop ? ((nearest % count) + count) % count : Math.min(count - 1, Math.max(0, nearest));
}

function syncStage(force = false): void {
  const state = bookshelf.motion.state;
  const index = centredIndex(state.position);
  const bookmark = index >= 0 ? row[index] : undefined;
  const id = bookmark?.id ?? null;
  if (id !== shownId) {
    if (!force && !state.settled && Math.abs(state.velocity) > FAST) return;
    const first = shownId === undefined;
    shownId = id;
    stage.show(bookmark ? linkView(bookmark) : null, { swap: !force && !first });
  } else if (force) {
    stage.show(bookmark ? linkView(bookmark) : null);
  }
  if (!state.settled && !force) return;
  const single = store.session().shelfId !== null;
  stage.setPlace({
    atStart: !bookshelf.shelf.loop && index === 0,
    atEnd: !bookshelf.shelf.loop && index === row.length - 1,
    canMove: single && row.length > 1,
    first: index === 0,
    last: index === row.length - 1,
  });
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
  chrome.dataset.view = list ? 'list' : 'shelf';
  shelfHost.hidden = list;
  captionHost.hidden = list;
  listHost.hidden = !list;
  viewToggle.setAttribute('aria-pressed', String(list));
  viewToggle.textContent = list ? 'Shelf view' : 'List view';
  if (list) renderListView();
  else bookshelf.shelf.refresh();
}

function renderAll(): void {
  row = store.bookmarks(store.session().shelfId);
  renderTabs();
  syncStage(true);
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
    if (!bookshelf.isOpen()) syncStage(true);
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

ready = true;
renderAll();
bookshelf.motion.subscribe(() => syncStage());
applyView();
flows.handleAddress();

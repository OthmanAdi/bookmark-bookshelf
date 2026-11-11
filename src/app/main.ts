import '../styles/base.css';
import './app.css';
import './flows.css';
import { sampleLibrary } from '../data/sample-library';
import { listVariants } from '../shelf';
import { createStore, type Bookmark, type Store } from '../store';
import { minutesOf } from '../store/reading-time';
import type { StatsVolume } from '../store/stats';
import { createBookshelf } from './bookshelf';
import { downloadText, must, toast } from './dom';
import { askText } from './editor';
import { createFlows } from './flows';
import { renderList } from './list-view';
import { createMenu } from './menu';
import { createSearch, findLinks } from './search';
import { createPhoneLayout, PHONE_QUERY } from './shell-phone';
import { createStageCaption, type LinkView } from './shell-stage';
import { firstToRead, renderStatus, statusLine } from './status';
import { createShelfTabs } from './shell-tabs';
import { renderViewMenu, type ViewMode } from './shell-view-menu';

/**
 * The app shell: page chrome around the composed bookshelf.
 * State lives in the store; this file turns clicks into store calls and redraws.
 */
const store = createStore({ seed: () => sampleLibrary() });

const chrome = must<HTMLElement>('#chrome');
const shelfHost = must<HTMLElement>('#shelf');
const listHost = must<HTMLElement>('#list');
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
  onFocusChange: () => {
    if (!ready) return;
    // The row was rebuilt or retargeted: read its links again before describing the centre.
    row = store.bookmarks(store.session().shelfId);
    syncStage();
  },
  onOpenChange: (bookmark) => {
    if (bookmark) {
      lastOpenedId = bookmark.id;
      return;
    }
    // Reading moved the place and maybe the status of the shelf.
    if (ready) renderShelfStatus();
    // In list view the row that opened the reader may have been redrawn while it was open. Find it again by id.
    if (store.session().view !== 'list' || document.activeElement !== document.body || !lastOpenedId) return;
    const rows = listHost.querySelectorAll<HTMLElement>('.bb-list__row');
    const entry = [...rows].find((item) => item.dataset.id === lastOpenedId);
    entry?.querySelector<HTMLElement>('.bb-list__title')?.focus({ preventScroll: true });
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
  const savedAt = `${bookmark.minutes ?? ''}|${bookmark.reading?.savedAt ?? ''}`;
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

const statusContext = {
  percentOf: (id: string) => store.progress(id)?.percent ?? 0,
  isDone,
};

/** What the status line needs about each link, with lengths taken from the cache rather than counted again. */
function statsVolumes(links: readonly Bookmark[]): StatsVolume[] {
  return links.map((link) => ({ id: link.id, title: link.title, required: link.required, minutes: minutesFor(link) }));
}

/** Opens a shelf where its work is: on the first link still to read. */
function openShelf(id: string | null): void {
  if (store.session().shelfId === id) return;
  bookshelf.setShelf(id);
  if (id !== null) {
    const next = firstToRead(statsVolumes(store.bookmarks(id)), statusContext);
    if (next) bookshelf.show(next, { immediate: true });
  }
  renderAll();
}

const statusArea = must<HTMLElement>('#status-area');
const shelfStatus = must<HTMLElement>('#shelf-status');

function renderShelfStatus(): void {
  const id = openShelfId();
  const links = id ? store.bookmarks(id) : [];
  renderStatus(shelfStatus, links.length > 0 ? statusLine(statsVolumes(links), statusContext) : null, bringToCentre);
  statusArea.hidden = shelfStatus.hidden;
}

const shelfTabs = createShelfTabs(must<HTMLElement>('#tabs'), openShelf, { reduced: () => bookshelf.motion.state.reduced });
const shelfMenuWrap = must<HTMLElement>('#shelf-menu-wrap');
const shelfMenuPanel = must<HTMLElement>('#shelf-menu');
const removeShelfItem = must<HTMLButtonElement>('#shelf-remove');

function openShelfId(): string | null {
  const id = store.session().shelfId;
  return id !== null && store.shelves().some((shelf) => shelf.id === id) ? id : null;
}

function renderTabs(): void {
  const active = store.session().shelfId;
  shelfTabs.render(
    [
      { id: null, name: 'All', count: store.bookmarks(null).length },
      ...store.shelves().map((shelf) => ({ id: shelf.id, name: shelf.name, count: store.bookmarks(shelf.id).length })),
    ],
    active,
  );

  const shelf = store.shelves().find((entry) => entry.id === active);
  const hide = shelf === undefined;
  if (hide && shelfMenuWrap.contains(document.activeElement)) {
    // The open shelf went away with focus on its menu: the tab that is now active takes it.
    must<HTMLElement>('#tabs').querySelector<HTMLElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
  }
  shelfMenuWrap.hidden = hide;
  if (shelf) shelfMenuPanel.setAttribute('aria-label', shelf.name);
}

must<HTMLButtonElement>('#new-shelf').addEventListener('click', async () => {
  const name = await askText('New shelf', 'Name', '', (value) => shelfNameError(value));
  if (name === null) return;
  const result = store.addShelf(name);
  if (!result.ok) return toast(result.error.message);
  openShelf(result.value.id);
});

createMenu({
  button: must<HTMLButtonElement>('#shelf-button'),
  panel: shelfMenuPanel,
  onOpen: () => {
    removeShelfItem.hidden = store.shelves().length < 2;
  },
});

/** Runs a Shelf menu action on the open shelf, if one is still open by the time it is chosen. */
const onShelf = (selector: string, action: (id: string) => void): void => {
  must<HTMLButtonElement>(selector).addEventListener('click', () => {
    const id = openShelfId();
    if (id) action(id);
  });
};

onShelf('#shelf-rename', async (id) => {
  const shelf = store.shelves().find((entry) => entry.id === id);
  if (!shelf) return;
  const name = await askText('Rename shelf', 'Name', shelf.name, (value) => shelfNameError(value, shelf.id));
  if (name === null) return;
  const result = store.renameShelf(shelf.id, name);
  if (!result.ok) toast(result.error.message);
  renderAll();
});
onShelf('#shelf-describe', (id) => flows.describeShelf(id));
onShelf('#shelf-share', (id) => flows.shareShelf(id));
onShelf('#shelf-hand-in', (id) => flows.handIn(id));
onShelf('#shelf-remove', (id) => flows.removeShelf(id));

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
  if (list) renderListView();
  else bookshelf.shelf.refresh();
}

function renderAll(): void {
  row = store.bookmarks(store.session().shelfId);
  renderTabs();
  renderShelfStatus();
  syncStage(true);
  if (store.session().view === 'list') renderListView();
}

/* ---------- wiring ---------- */

/** Half of the look change: the row fades out, the look changes while nothing is visible, and the row fades back. */
const LOOK_FADE_MS = 110;

function changeLook(name: string): void {
  if (name === bookshelf.shelf.variant.name) return;
  if (bookshelf.motion.state.reduced || store.session().view === 'list') {
    bookshelf.setVariant(name);
    return;
  }
  shelfHost.classList.add('is-changing');
  window.setTimeout(() => {
    bookshelf.setVariant(name);
    shelfHost.classList.remove('is-changing');
  }, LOOK_FADE_MS);
}

function setView(view: ViewMode): void {
  if (store.session().view === view) return;
  store.setSession({ view });
  applyView();
}

const viewMenu = renderViewMenu({ panel: must<HTMLElement>('#view-menu'), looks: listVariants(), onView: setView, onLook: changeLook });
createMenu({
  button: must<HTMLButtonElement>('#view-button'),
  panel: must<HTMLElement>('#view-menu'),
  onOpen: () => viewMenu.update({ view: store.session().view, look: bookshelf.shelf.variant.name }),
});

must<HTMLButtonElement>('#add').addEventListener('click', () => flows.addLink());

/* ---------- search ---------- */

/** Brings a link to the centre of the row, or to its place in the list, opening its shelf when another one is open. */
function bringToCentre(id: string): void {
  const bookmark = store.get(id);
  if (!bookmark) return;
  const open = store.session().shelfId;
  if (open !== null && open !== bookmark.shelfId) openShelf(bookmark.shelfId);
  if (store.session().view === 'list') {
    const entry = [...listHost.querySelectorAll<HTMLElement>('.bb-list__row')].find((item) => item.dataset.id === id);
    entry?.scrollIntoView({ block: 'center', behavior: bookshelf.motion.state.reduced ? 'auto' : 'smooth' });
    entry?.querySelector<HTMLElement>('.bb-list__title')?.focus({ preventScroll: true });
    return;
  }
  // Focus rides along with the centre as the row travels, so it ends on the link that was asked for.
  bookshelf.shelf.focusCurrent();
  bookshelf.show(id);
}

const searchInput = must<HTMLInputElement>('#search');
const phone = createPhoneLayout(
  {
    tools: must<HTMLElement>('.bb-app__tools'),
    viewAnchor: must<HTMLElement>('#library-menu-wrap'),
    view: must<HTMLElement>('#view-menu-wrap'),
    viewPanel: must<HTMLElement>('#view-menu'),
    add: must<HTMLElement>('#add'),
    dock: must<HTMLElement>('#dock'),
    searchBox: must<HTMLElement>('#search-box'),
    searchToggle: must<HTMLButtonElement>('#search-open'),
    searchInput,
  },
  window.matchMedia(PHONE_QUERY),
);
let searchOrigin: HTMLElement | null = null;
searchInput.addEventListener('focus', (event) => {
  searchOrigin = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
});

createSearch(
  {
    input: searchInput,
    popup: must<HTMLElement>('#search-popup'),
    list: must<HTMLElement>('#search-results'),
    empty: must<HTMLElement>('#search-empty'),
    status: must<HTMLElement>('#search-status'),
  },
  {
    find: (query) => findLinks(store.bookmarks(null), new Map(store.shelves().map((shelf) => [shelf.id, shelf.name])), query),
    choose: bringToCentre,
    leave: () => {
      if (phone.isPhone()) return phone.closeSearch(true);
      const origin = searchOrigin;
      if (origin && origin.isConnected && origin.getClientRects().length > 0) origin.focus({ preventScroll: true });
      else bookshelf.shelf.focusCurrent();
    },
  },
);

/* ---------- the Library menu ---------- */

/** The example links are the ones the bundled library brings; any of them still here counts. */
const exampleIds = new Set(sampleLibrary().bookmarks.map((bookmark) => bookmark.id));

function examplesLeft(): number {
  return store.bookmarks(null).filter((bookmark) => exampleIds.has(bookmark.id)).length;
}

const saving = store.persistence === 'local';
must<HTMLElement>('#storage-warning').hidden = saving;
if (!saving) must<HTMLElement>('#library-note').textContent = 'This browser is not saving. Changes last until you close this tab.';

const removeExamplesItem = must<HTMLButtonElement>('#library-examples');
createMenu({
  button: must<HTMLButtonElement>('#library-button'),
  panel: must<HTMLElement>('#library-menu'),
  onOpen: () => {
    removeExamplesItem.hidden = examplesLeft() === 0;
  },
});
must<HTMLButtonElement>('#library-bring').addEventListener('click', () => flows.bringLinksIn());
must<HTMLButtonElement>('#library-export').addEventListener('click', () => {
  downloadText(`bookmark-bookshelf-${new Date().toISOString().slice(0, 10)}.json`, store.exportLibrary());
});
must<HTMLButtonElement>('#library-send').addEventListener('click', () => flows.sendPageHere());
removeExamplesItem.addEventListener('click', () => flows.removeExamples());

store.subscribe((event) => {
  if (event.reason === 'session') return;
  if (event.reason === 'progress') {
    if (bookshelf.isOpen()) return;
    syncStage(true);
    renderShelfStatus();
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

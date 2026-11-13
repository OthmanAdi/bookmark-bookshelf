import '../styles/base.css';
import './app.css';
import './flows.css';
import { isExampleId, sampleLibrary } from '../data/sample-library';
import { listVariants } from '../shelf';
import { createStore, DEFAULT_STORAGE_KEY, type Bookmark, type SortMode } from '../store';
import { isPaint, type Paint } from '../studio/types';
import { minutesOf } from '../store/reading-time';
import { SORT_MODES } from '../store/sort';
import type { StatsVolume } from '../store/stats';
import { createBookshelf } from './bookshelf';
import { must, toast } from './dom';
import { askText } from './editor';
import { carriesAddress } from './flow-address';
import { createFlows } from './flows';
import { renderList } from './list-view';
import { createMenu } from './menu';
import { canUseStudio, FORCED_COLORS_QUERY, forcedColors, PAINT_CHOICES, setPaintControl, STUDIO_PREPARING, studioUnavailable } from './paint-support';
import { createSearch, findLinks } from './search';
import { attachDrop } from './shell-drop';
import { emptyState, READING_NOTE } from './shell-empty';
import { createReaderHistory, pageTitle, type ReaderHistory } from './shell-history';
import { createPhoneLayout, PHONE_QUERY } from './shell-phone';
import { createStageCaption, type LinkView } from './shell-stage';
import { createAnnouncer, examplesSentence, firstToRead, positionSentence, renderStatus, statusLine } from './status';
import { createShelfTabs } from './shell-tabs';
import { createShowcaseView } from './showcase-view';
import { renderChoices, renderViewMenu, type ViewMode } from './shell-view-menu';

/**
 * The app shell: page chrome around the composed bookshelf.
 * State lives in the store; this file turns clicks into store calls and redraws.
 */
/**
 * True when this browser has stored nothing yet, so the look painted before load was chosen for a first
 * visit. The look lives beside the library under a key of its own, and a person may have chosen one
 * before they changed any link.
 */
function firstVisit(): boolean {
  try {
    const storage = window.localStorage;
    return storage.getItem(DEFAULT_STORAGE_KEY) === null && storage.getItem(`${DEFAULT_STORAGE_KEY}:session`) === null;
  } catch {
    return false;
  }
}

const fresh = firstVisit();
// A shelf or a link arriving in the address into a fresh browser starts a library of its own, not the examples.
const store = createStore(carriesAddress(window.location) ? {} : { seed: () => sampleLibrary() });

// The page was painted in a look before this script ran (Night when the system is dark). On a first
// visit the new library takes that look, so nothing changes colour once the shelf appears.
const painted = document.documentElement.dataset.variant;
if (fresh && painted && listVariants().some((look) => look.name === painted) && painted !== store.session().variant) {
  store.setSession({ variant: painted });
}

const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

/** The browser's own bar takes the ground colour of the look. */
function syncThemeColor(): void {
  const ground = getComputedStyle(document.documentElement).getPropertyValue('--bb-paper').trim();
  if (themeColor && ground) themeColor.content = ground;
}

const chrome = must<HTMLElement>('#chrome');
const shelfHost = must<HTMLElement>('#shelf');
const listHost = must<HTMLElement>('#list');
const showcaseHost = must<HTMLElement>('#showcase');
const captionHost = must<HTMLElement>('#caption');

let lastOpenedId: string | null = null;
/** The links of the row in row order, read again whenever the row is rebuilt. */
let row: Bookmark[] = [];
let shownId: string | null | undefined;
/** The bookshelf may report a change while it is still being built; the frame answers once it exists. */
let ready = false;
let readerHistory: ReaderHistory | null = null;

const bookshelf = createBookshelf({
  store,
  shelfHost,
  readerHost: must<HTMLElement>('#reader'),
  background: [chrome],
  label: 'Your shelf',
  caption: false,
  arrows: false,
  isExample: isExampleId,
  onFocusChange: () => {
    if (!ready) return;
    // The row was rebuilt or retargeted: read its links again before describing the centre.
    row = store.bookmarks(store.session().shelfId);
    syncStage();
  },
  onOpenChange: (bookmark) => {
    if (bookmark) {
      lastOpenedId = bookmark.id;
      readerHistory?.opened(bookmark.id);
      if (ready) updateTitle();
      return;
    }
    readerHistory?.closed();
    // Reading moved the place and maybe the status of the shelf, so the action under the row has new words too.
    if (ready) {
      renderShelfStatus();
      updateTitle();
      syncStage(true);
      showcase.render();
    }
    // In list view the row that opened the reader may have been redrawn while it was open. Find it again by id.
    if (store.session().view !== 'list' || document.activeElement !== document.body || !lastOpenedId) return;
    const rows = listHost.querySelectorAll<HTMLElement>('.bb-list__row');
    const entry = [...rows].find((item) => item.dataset.id === lastOpenedId);
    entry?.querySelector<HTMLElement>('.bb-list__title')?.focus({ preventScroll: true });
  },
});

// A link can ask for a drawing, so a Studio shelf can be shared as it looks: `app.html?paint=studio`.
const askedPaint = new URLSearchParams(location.search).get('paint');
// Forced colours win over the address: Studio paints its own colours over the ones the system asked for.
if (askedPaint === 'classic' || (askedPaint === 'studio' && !forcedColors())) bookshelf.setPaint(askedPaint);

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

const isDone = (id: string): boolean => store.isDone(id);

const sortMode = (): SortMode => store.session().sort ?? 'manual';

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
    step: (direction) => {
      // Against the end of a row with two ends nothing moves, so say why.
      const count = row.length;
      const slot = rowSlot(bookshelf.motion.state.position);
      if (!bookshelf.shelf.loop && count > 0 && slot === (direction < 0 ? 0 : count - 1)) {
        say(direction < 0 ? 'This is the first link.' : 'This is the last link.');
      }
      bookshelf.motion.step(direction);
    },
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

const say = createAnnouncer(must<HTMLElement>('#announcer'));
/** The link last announced; unset until the row first comes to rest, which is not announced. */
let announcedId: string | null | undefined;

/** Where in the row the centre is, counted as the person sees the row: 0 is the first link. */
function rowSlot(position: number): number {
  const count = row.length;
  if (count === 0) return -1;
  const nearest = Math.round(position);
  return bookshelf.shelf.loop ? ((nearest % count) + count) % count : Math.min(count - 1, Math.max(0, nearest));
}

/**
 * Once the row rests on another link, a screen reader hears its title and place. When focus is in the
 * row it is not needed: focus moving to the volume already says it.
 */
function announceRest(bookmark: Bookmark | undefined, slot: number): void {
  if (bookshelf.isOpen()) return;
  const id = bookmark?.id ?? null;
  if (announcedId === undefined || id === announcedId) {
    announcedId = id;
    return;
  }
  announcedId = id;
  if (bookmark && !bookshelf.shelf.element.contains(document.activeElement)) {
    say(positionSentence(bookmark.title, slot, row.length));
  }
}

/** Describes the link visibly in the centre (not where the row is heading) and what can be done with it. */
function syncStage(force = false): void {
  const state = bookshelf.motion.state;
  const centred = bookshelf.current();
  const bookmark = centred ? (store.get(centred.id) ?? centred) : undefined;
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
  // The ends of a row with two ends are found by position, so they hold whatever order the row is in.
  const count = row.length;
  const slot = rowSlot(state.position);
  if (state.settled) announceRest(bookmark, slot);
  // Moving changes the stored order, which is the order shown only on a single shelf in its own order.
  const own = id ? row.findIndex((entry) => entry.id === id) : -1;
  stage.setPlace({
    atStart: !bookshelf.shelf.loop && count > 0 && slot === 0,
    atEnd: !bookshelf.shelf.loop && count > 0 && slot === count - 1,
    canMove: store.session().shelfId !== null && sortMode() === 'manual' && count > 1,
    first: own === 0,
    last: own === count - 1,
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
const examplesLine = must<HTMLElement>('#examples-line');

/** The example links are the ones the bundled library brings; any of them still here counts. */
function examplesLeft(): number {
  return store.bookmarks(null).filter((bookmark) => isExampleId(bookmark.id)).length;
}

function renderShelfStatus(): void {
  const id = openShelfId();
  const links = id ? store.bookmarks(id) : [];
  renderStatus(shelfStatus, links.length > 0 ? statusLine(statsVolumes(links), statusContext) : null, bringToCentre);

  const examples = examplesLeft();
  if (examples === 0 && examplesLine.contains(document.activeElement)) {
    // The examples were removed from this line: the active tab, which stays, takes focus.
    must<HTMLElement>('#tabs').querySelector<HTMLElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
  }
  // The line speaks about the whole library, so it shows with every shelf at once; an open shelf has its own status.
  examplesLine.hidden = examples === 0 || id !== null;
  if (examples > 0) must<HTMLElement>('#examples-text').textContent = examplesSentence(examples);
  statusArea.hidden = shelfStatus.hidden && examplesLine.hidden;
}

must<HTMLButtonElement>('#examples-remove').addEventListener('click', () => flows.removeExamples());

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
  const shelf = store.shelves().find((entry) => entry.id === active);
  const hide = shelf === undefined;
  const menuHadFocus = hide && shelfMenuWrap.contains(document.activeElement);
  // The Shelf menu takes its room first, so the strip brings the active tab into the width it really has.
  shelfMenuWrap.hidden = hide;
  if (shelf) shelfMenuPanel.setAttribute('aria-label', shelf.name);

  shelfTabs.render(
    [
      { id: null, name: 'All', count: store.bookmarks(null).length },
      ...store.shelves().map((entry) => ({ id: entry.id, name: entry.name, count: store.bookmarks(entry.id).length })),
    ],
    active,
  );

  // The open shelf went away with focus on its menu: the tab that is now active takes it.
  if (menuHadFocus) must<HTMLElement>('#tabs').querySelector<HTMLElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
}

must<HTMLButtonElement>('#new-shelf').addEventListener('click', async () => {
  const name = await askText('New shelf', 'Name', '', (value) => shelfNameError(value));
  if (name === null) return;
  const result = store.addShelf(name);
  if (!result.ok) return toast(result.error.message);
  openShelf(result.value.id);
});

/** Sorting changes how the row and the list are ordered, never the stored order; the centred link stays. */
function setSort(mode: SortMode): void {
  if (sortMode() === mode) return;
  store.setSession({ sort: mode });
  bookshelf.refresh();
  renderAll();
}

const markSort = renderChoices(
  must<HTMLElement>('#shelf-sort'),
  'Sort by',
  SORT_MODES.map((entry) => ({ value: entry.mode, label: entry.label })),
  setSort,
);

createMenu({
  button: must<HTMLButtonElement>('#shelf-button'),
  panel: shelfMenuPanel,
  onOpen: () => {
    removeShelfItem.hidden = store.shelves().length < 2;
    markSort(sortMode());
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
onShelf('#shelf-print', (id) => flows.printShelf(id));
onShelf('#shelf-remove', (id) => flows.removeShelf(id));

/* ---------- list view ---------- */

/* ---------- empty shelves ---------- */

const mainHost = must<HTMLElement>('#main');
const emptyHost = must<HTMLElement>('#empty');
const emptyAdd = must<HTMLButtonElement>('#empty-add');
must<HTMLElement>('#empty-note').textContent = READING_NOTE;

function openShelfName(): string | null {
  const id = openShelfId();
  return id ? (store.shelves().find((shelf) => shelf.id === id)?.name ?? null) : null;
}

/** Adds a link to the open shelf, or lets the person choose one when every shelf is shown. */
function addHere(): void {
  const id = openShelfId();
  flows.addLink(id ? { shelfId: id } : undefined);
}

emptyAdd.addEventListener('click', addHere);
must<HTMLButtonElement>('#empty-bring').addEventListener('click', () => flows.bringLinksIn());

/** Shows the stage, the list, the showcase or the empty shelf, whichever applies, and keeps focus on the page. */
function renderStage(): void {
  const view = store.session().view;
  const list = view === 'list';
  const empty = row.length === 0;
  const showEmpty = empty && !list;
  if (showEmpty) {
    const state = emptyState(openShelfName());
    must<HTMLElement>('#empty-title').textContent = state.message;
    must<HTMLElement>('#empty-hint').textContent = state.hint;
    emptyAdd.textContent = state.buttons.find((entry) => entry.action === 'add')?.label ?? 'Add a link';
  }
  const focusWasInCaption = captionHost.contains(document.activeElement);
  shelfHost.hidden = view !== 'shelf' || empty;
  captionHost.hidden = view !== 'shelf' || empty;
  showcaseHost.hidden = view !== 'showcase' || empty;
  emptyHost.hidden = !showEmpty;
  mainHost.dataset.empty = showEmpty ? '1' : '0';
  // The last link went away under the caption's buttons: the way forward takes focus.
  if (showEmpty && focusWasInCaption) emptyAdd.focus({ preventScroll: true });
}

function renderListView(): void {
  const state = emptyState(openShelfName());
  renderList(
    listHost,
    store,
    {
      read: (id) => void bookshelf.open(id),
      addText: (id) => void bookshelf.open(id, { editCopy: true }),
      edit: (id) => flows.editLink(id),
      move,
    },
    {
      empty: {
        message: state.message,
        hint: state.hint,
        buttons: state.buttons.map((entry) => ({
          label: entry.label,
          solid: entry.solid,
          run: entry.action === 'add' ? addHere : () => flows.bringLinksIn(),
        })),
      },
    },
  );
}

/** The showcase: one link at a time, wired to the same flows as the caption under the row. */
const showcase = createShowcaseView({
  host: showcaseHost,
  store,
  bookshelf,
  edit: (id) => flows.editLink(id),
  say: (text) => say(text),
});

function applyView(): void {
  const view = store.session().view;
  const list = view === 'list';
  chrome.dataset.view = view;
  listHost.hidden = !list;
  renderStage();
  if (list) renderListView();
  else if (view === 'showcase') showcase.render();
  else bookshelf.shelf.refresh();
}

const pageHeading = must<HTMLElement>('#page-heading');

/** The page title names the open link, or else the open shelf; the page's heading names the shelf. */
function updateTitle(): void {
  const openId = bookshelf.isOpen() ? store.session().openId : null;
  const link = openId ? store.get(openId)?.title : undefined;
  const shelf = openShelfName();
  document.title = pageTitle(link ? { link } : { shelf });
  const heading = shelf ?? 'All links';
  if (pageHeading.textContent !== heading) pageHeading.textContent = heading;
}

function renderAll(): void {
  row = store.bookmarks(store.session().shelfId);
  updateTitle();
  renderTabs();
  renderShelfStatus();
  renderStage();
  syncStage(true);
  if (store.session().view === 'list') renderListView();
  showcase.render();
}

/*
 * A dialog gives focus back to whatever opened it. When that control has gone in the meantime (the
 * last link was removed, the shelf changed), focus would fall to the page; it goes to the control that
 * now stands in the same place instead.
 */
function rescueFocus(): void {
  if (document.activeElement && document.activeElement !== document.body) return;
  if (bookshelf.isOpen()) return;
  if (store.session().view === 'list' && lastListFocus) {
    // The row is the same link if it is still there, otherwise the one that moved into its place.
    const rows = [...listHost.querySelectorAll<HTMLElement>('.bb-list__row')];
    const same = rows.find((row) => row.dataset.id === lastListFocus?.id);
    const row = same ?? rows[Math.min(lastListFocus.index, rows.length - 1)];
    const part = same ? row?.querySelector<HTMLElement>(`[data-part="${lastListFocus.part}"]`) : null;
    const target = part ?? row?.querySelector<HTMLElement>('.bb-list__title');
    if (target) {
      target.focus({ preventScroll: true });
      return;
    }
  }
  const candidates = [
    must<HTMLElement>('#action-primary'),
    showcaseHost.querySelector<HTMLElement>('[data-part="primary"]'),
    emptyAdd,
    must<HTMLElement>('#tabs').querySelector<HTMLElement>('[aria-pressed="true"]'),
  ];
  candidates.find((element) => element !== null && element.getClientRects().length > 0)?.focus({ preventScroll: true });
}

// Where focus last stood in the list, so a dialog opened from a row can give it back to that place.
let lastListFocus: { id: string; part: string; index: number } | null = null;
listHost.addEventListener('focusin', (event) => {
  const active = event.target instanceof HTMLElement ? event.target : null;
  const row = active?.closest<HTMLElement>('.bb-list__row');
  if (!active || !row?.dataset.id) return;
  const rows = [...listHost.querySelectorAll<HTMLElement>('.bb-list__row')];
  lastListFocus = { id: row.dataset.id, part: active.dataset.part ?? 'title', index: rows.indexOf(row) };
});

// `close` does not bubble, but a listener in the capture phase hears it from every dialog.
document.addEventListener('close', () => window.setTimeout(rescueFocus, 0), true);

/* ---------- wiring ---------- */

/** Half of the look change: the row fades out, the look changes while nothing is visible, and the row fades back. */
const LOOK_FADE_MS = 110;

function changeLook(name: string): void {
  if (name === bookshelf.shelf.variant.name) return;
  if (bookshelf.motion.state.reduced || store.session().view !== 'shelf') {
    bookshelf.setVariant(name);
    syncThemeColor();
    return;
  }
  shelfHost.classList.add('is-changing');
  // The bar, the tabs and the search field take the new look's colours over the same time as the page ground.
  document.documentElement.classList.add('bb-look-changing');
  window.setTimeout(() => {
    bookshelf.setVariant(name);
    syncThemeColor();
    shelfHost.classList.remove('is-changing');
    window.setTimeout(() => document.documentElement.classList.remove('bb-look-changing'), LOOK_FADE_MS * 2);
  }, LOOK_FADE_MS);
}

function setView(view: ViewMode): void {
  if (store.session().view === view) return;
  store.setSession({ view });
  applyView();
  if (view === 'showcase') showcase.announce();
}

/**
 * How the shelf is drawn right now, as the bookshelf draws it: a link may have asked for a drawing, and a
 * Studio that could not start has gone back to Classic.
 */
function currentPaint(): Paint {
  return bookshelf.paint;
}

function setPaint(name: string): void {
  if (!isPaint(name)) return;
  if (name === 'studio' && !canUseStudio()) return;
  if (name !== currentPaint()) {
    if (name === 'studio') studioAskedAt = Date.now();
    bookshelf.setPaint(name);
  }
  if (store.session().paint !== name) store.setSession({ paint: name });
  refreshViewMenu();
}

/** When Studio was last asked for. It loads lazily, so the menu says it is on its way until the shelf is drawn with it. */
let studioAskedAt = Date.now();
const STUDIO_WAIT_MS = 20000;
const STUDIO_POLL_MS = 120;
let studioWatch: number | undefined;

/**
 * True from the moment Studio is asked for until its canvas has drawn a frame. The bookshelf reports no
 * such moment, so the page is asked. A hidden shelf draws nothing: after a while the menu stops waiting.
 */
function studioPreparing(): boolean {
  if (currentPaint() !== 'studio' || store.session().view !== 'shelf') return false;
  if (Date.now() - studioAskedAt > STUDIO_WAIT_MS) return false;
  return document.querySelector('canvas.bb-studio[data-drawn]') === null;
}

function refreshViewMenu(): void {
  const reason = studioUnavailable();
  const preparing = studioPreparing();
  viewMenu.update({
    view: store.session().view,
    look: bookshelf.shelf.variant.name,
    paint: currentPaint(),
    unavailable: reason ? { studio: reason } : undefined,
    preparing: preparing ? { studio: STUDIO_PREPARING } : undefined,
  });
  if (!preparing || studioWatch !== undefined) return;
  studioWatch = window.setInterval(() => {
    if (studioPreparing()) return;
    window.clearInterval(studioWatch);
    studioWatch = undefined;
    refreshViewMenu();
  }, STUDIO_POLL_MS);
}

const viewMenu = renderViewMenu({
  panel: must<HTMLElement>('#view-menu'),
  looks: listVariants(),
  onView: setView,
  onLook: changeLook,
  paints: PAINT_CHOICES,
  onPaint: setPaint,
});
createMenu({
  button: must<HTMLButtonElement>('#view-button'),
  panel: must<HTMLElement>('#view-menu'),
  onOpen: refreshViewMenu,
});
setPaintControl({ current: currentPaint, choose: setPaint });

// Forced colours can be turned on while the page is open: Studio leaves at once and comes back with them off.
window.matchMedia(FORCED_COLORS_QUERY).addEventListener('change', (event) => {
  if (event.matches) {
    if (currentPaint() === 'studio') bookshelf.setPaint('classic');
  } else if (store.session().paint === 'studio' && canUseStudio() && currentPaint() !== 'studio') {
    studioAskedAt = Date.now();
    bookshelf.setPaint('studio');
  }
  refreshViewMenu();
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
  if (store.session().view === 'showcase') return showcase.bring(id);
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

/* ---------- dropping links and files on the page ---------- */

attachDrop({
  hint: must<HTMLElement>('#drop-hint'),
  hintText: must<HTMLElement>('#drop-text'),
  accepting: () => !bookshelf.isOpen() && document.querySelector('dialog[open]') === null,
  onFiles: (files) => flows.bringLinksIn(files),
  onLink: (link) => flows.addLink(link),
});

/* ---------- the Library menu ---------- */

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
must<HTMLButtonElement>('#library-out').addEventListener('click', () => flows.takeLinksOut());
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

// Alt + arrows reorder the centred link, matching the Move buttons, and only where those are offered.
shelfHost.addEventListener('keydown', (event) => {
  if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
  const bookmark = bookshelf.current();
  if (!bookmark || store.session().shelfId === null || sortMode() !== 'manual') return;
  event.preventDefault();
  move(bookmark.id, event.key === 'ArrowLeft' ? -1 : 1);
});

window.addEventListener('pagehide', () => store.flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') store.flush();
});

ready = true;
syncThemeColor();
// The bookshelf starts in Classic, so only a stored Studio needs the WebGL2 check before anything is drawn.
// A drawing named in the address wins over the stored one for this visit, without being stored.
if (askedPaint !== 'studio' && askedPaint !== 'classic' && store.session().paint === 'studio' && canUseStudio()) {
  bookshelf.setPaint('studio');
}
readerHistory = createReaderHistory({
  isOpen: () => bookshelf.isOpen(),
  open: (id) => void bookshelf.open(id),
  close: () => void bookshelf.close(),
});
// A reader resumed from the last visit gets its entry too, so Back closes it rather than leaving.
const resumedId = bookshelf.isOpen() ? store.session().openId : null;
if (resumedId) readerHistory.opened(resumedId);
renderAll();
bookshelf.motion.subscribe(() => syncStage());
applyView();
flows.handleAddress();
// A shelf link pasted into a tab where the app is already open changes only the fragment, which loads nothing.
window.addEventListener('hashchange', () => flows.handleAddress());

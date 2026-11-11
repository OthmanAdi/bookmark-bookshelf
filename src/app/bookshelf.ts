import './bookshelf.css';
import { createShelfMotion, prefersReducedMotion, type ShelfMotion } from '../motion';
import { mountReader, type ReaderDoc, type ReaderHandle } from '../reader';
import { createCover, mountShelf, type Box, type ShelfHandle, type ShelfItem } from '../shelf';
import type { Bookmark, Store } from '../store';

/**
 * Full composition: store + shelf + motion + reader.
 * This file is the only place where the four modules meet. Each of them can be
 * used without the others; see `examples/` for the smaller combinations.
 */
export interface BookshelfOptions {
  store: Store;
  shelfHost: HTMLElement;
  readerHost: HTMLElement;
  /** Elements made inert while the reader is open (page chrome, list view). */
  background?: HTMLElement[];
  /** Mirror the variant onto <html> so page colours follow. Default true. */
  themePage?: boolean;
  label?: string;
  /** False when the host draws its own caption under the row. Default true. */
  caption?: boolean;
  /** False when the host draws its own previous and next buttons. Default true. */
  arrows?: boolean;
  onFocusChange?: (bookmark: Bookmark | undefined) => void;
  onOpenChange?: (bookmark: Bookmark | undefined) => void;
}

export interface Bookshelf {
  readonly shelf: ShelfHandle;
  readonly motion: ShelfMotion;
  current(): Bookmark | undefined;
  isOpen(): boolean;
  /** Brings a volume to the centre. */
  show(id: string, options?: { immediate?: boolean }): void;
  open(id: string, options?: { immediate?: boolean; editCopy?: boolean }): Promise<void>;
  close(options?: { immediate?: boolean }): Promise<void>;
  setShelf(shelfId: string | null): void;
  setVariant(name: string): void;
  /** Rebuilds the row from the store, keeping the centred volume when it still exists. */
  refresh(): void;
  destroy(): void;
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function toShelfItem(bookmark: Bookmark, percent: number): ShelfItem {
  return {
    id: bookmark.id,
    title: bookmark.title,
    source: hostnameOf(bookmark.url),
    author: bookmark.author,
    cloth: bookmark.cover.cloth,
    pattern: bookmark.cover.pattern,
    seed: bookmark.cover.seed,
    progress: percent,
  };
}

function toReaderDoc(bookmark: Bookmark): ReaderDoc {
  return {
    id: bookmark.id,
    title: bookmark.title,
    url: bookmark.url,
    author: bookmark.author,
    addedAt: bookmark.addedAt,
    note: bookmark.note,
    tags: bookmark.tags,
    text: bookmark.reading?.text,
  };
}

const KNOWN_VARIANT_FALLBACK = 'paper';

export function createBookshelf(options: BookshelfOptions): Bookshelf {
  const { store } = options;
  const themePage = options.themePage ?? true;
  let bookmarks: Bookmark[] = [];
  let reader: ReaderHandle | null = null;
  let readerId: string | null = null;
  let flightFrom: Box | null = null;
  let lastFocusId: string | null = null;
  let savedFocusId: string | null = store.session().focusId;
  let savingFromReader = false;
  let opener: HTMLElement | null = null;
  let destroyed = false;

  const listItems = (): ShelfItem[] => {
    bookmarks = store.bookmarks(store.session().shelfId);
    return bookmarks.map((bookmark) => toShelfItem(bookmark, store.progress(bookmark.id)?.percent ?? 0));
  };

  const initialVariant = store.session().variant || KNOWN_VARIANT_FALLBACK;
  const shelf = mountShelf(options.shelfHost, {
    items: listItems(),
    variant: initialVariant,
    label: options.label ?? 'Bookshelf',
    caption: options.caption,
    arrows: options.arrows,
  });
  if (themePage) document.documentElement.dataset.variant = shelf.variant.name;

  const startIndex = Math.max(
    0,
    bookmarks.findIndex((bookmark) => bookmark.id === store.session().focusId),
  );

  const motion = createShelfMotion({
    count: bookmarks.length,
    loop: shelf.loop,
    initial: startIndex,
    reducedMotion: prefersReducedMotion,
    timing: shelf.variant.motion,
  });

  const current = (): Bookmark | undefined => bookmarks[motion.state.focus];
  // Set before subscribing so construction does not fire a focus change at a half-built host.
  lastFocusId = current()?.id ?? null;

  const detachGesture = motion.attach(shelf.surface, {
    pxPerItem: () => shelf.pitch(),
    enabled: () => reader === null,
  });

  const stopMotion = motion.subscribe((state) => {
    shelf.setPose({ position: state.position, open: state.open, reduced: state.reduced });
    reader?.setReveal(state.open, state.reduced ? null : flightFrom);
    shelf.element.dataset.settled = state.settled ? '1' : '0';
    // Tell the host as soon as another volume reaches the centre, so its actions never describe the previous one.
    const focused = current();
    const focusedId = focused?.id ?? null;
    if (focusedId !== lastFocusId) {
      lastFocusId = focusedId;
      options.onFocusChange?.(focused);
    }
    // Remember it only once the row has come to rest.
    if (state.settled && focusedId !== savedFocusId) {
      savedFocusId = focusedId;
      store.setSession({ focusId: focusedId });
    }
  });

  const stopIntents = shelf.on((intent) => {
    if (intent.type === 'focus') motion.goTo(intent.slot);
    else if (intent.type === 'step') motion.step(intent.direction);
    else if (intent.type === 'jump') motion.goTo(intent.to === 'first' ? 0 : bookmarks.length - 1);
    else void open(intent.id);
  });

  function setBackgroundInert(inert: boolean): void {
    for (const element of options.background ?? []) element.inert = inert;
    document.documentElement.classList.toggle('bb-reading', inert);
  }

  function show(id: string, showOptions: { immediate?: boolean } = {}): void {
    const index = bookmarks.findIndex((bookmark) => bookmark.id === id);
    if (index < 0) return;
    // Travel the short way round a looping row.
    let target = index;
    if (shelf.loop && bookmarks.length > 0) {
      const count = bookmarks.length;
      const here = motion.state.target;
      target = here + ((((index - here) % count) + count + Math.floor(count / 2)) % count) - Math.floor(count / 2);
    }
    motion.goTo(target, showOptions);
  }

  async function open(id: string, openOptions: { immediate?: boolean; editCopy?: boolean } = {}): Promise<void> {
    if (reader || destroyed) return;
    const bookmark = store.get(id);
    if (!bookmark) return;
    // Whatever had focus opened the reader (a volume, a list row, a button). Closing gives focus back to it.
    opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    if (!bookmarks.some((entry) => entry.id === id)) {
      // The volume lives on another shelf: switch to it first.
      store.setSession({ shelfId: bookmark.shelfId });
      refresh();
    }
    show(id, { immediate: true });

    const item = toShelfItem(bookmark, 0);
    const geometry = shelf.variant.geometry;
    // Same catalogue mark as the volume on the shelf, so the hand-off after the flight changes nothing.
    const cover = createCover(item, String(bookmarks.findIndex((entry) => entry.id === id) + 1).padStart(2, '0'));
    readerId = id;
    reader = mountReader(options.readerHost, {
      doc: toReaderDoc(bookmark),
      progress: store.progress(id),
      cover,
      coverAspect: geometry.coverWidth / geometry.bookHeight,
      onProgress: (position) => store.setProgress(id, position),
      onClose: () => void close(),
      onSaveText: (text) => {
        // The reader has already redrawn itself with the new text.
        savingFromReader = true;
        store.updateBookmark(id, { readingText: text });
        savingFromReader = false;
      },
    });

    const immediate = openOptions.immediate === true;
    const flying = !immediate && !motion.state.reduced;
    flightFrom = flying ? shelf.coverBox() : null;
    const slot = reader.coverSlotRect();
    // Tell the reader's cover how much larger it is than a cover on the shelf: its shadow, corners and
    // hairlines then match the flying volume exactly and the swap at the end of the flight is invisible.
    const shelfCover = shelf.coverSize();
    if (slot && shelfCover.width > 0) cover.style.setProperty('--bb-cover-k', String(slot.width / shelfCover.width));
    shelf.setStage(flying ? slot : null);
    // While the book is in the air the reader's own cover stays hidden; they swap when it lands.
    reader.setCoverVisible(!flying);
    setBackgroundInert(true);
    store.setSession({ openId: id, focusId: id });
    options.onOpenChange?.(bookmark);

    await motion.setOpen(true, { immediate });
    if (!reader || readerId !== id) return;
    reader.setReveal(1);
    reader.setCoverVisible(true);
    // The stored percent may come from another screen size. Replace it with what this layout actually shows.
    if (store.progress(id)) store.setProgress(id, reader.progress());
    if (openOptions.editCopy) {
      // An item without text already shows the paste field; one with text needs the edit button pressed.
      const field = reader.element.querySelector<HTMLTextAreaElement>('.bb-reader__paste-field');
      if (field) field.focus();
      else reader.element.querySelector<HTMLButtonElement>('.bb-reader__edit')?.click();
    } else {
      reader.focus();
    }
  }

  async function close(closeOptions: { immediate?: boolean } = {}): Promise<void> {
    const active = reader;
    if (!active) return;
    store.flush();
    const immediate = closeOptions.immediate === true;
    const flying = !immediate && !motion.state.reduced;
    if (flying) {
      // Fly back from wherever the cover is now: the reader may have been scrolled.
      const slot = active.coverSlotRect();
      const visible = slot !== null && slot.y + slot.height > 0 && slot.y < window.innerHeight;
      shelf.setStage(visible ? slot : null);
      flightFrom = flightFrom ?? shelf.coverBox();
      active.setCoverVisible(!visible);
    }
    store.setSession({ openId: null });
    await motion.setOpen(false, { immediate });
    if (reader !== active) return;
    active.destroy();
    reader = null;
    readerId = null;
    flightFrom = null;
    shelf.setStage(null);
    setBackgroundInert(false);
    refresh();
    const origin = opener;
    opener = null;
    const originUsable = origin !== null && origin.isConnected && origin.getClientRects().length > 0 && !shelf.element.contains(origin);
    if (originUsable) origin.focus({ preventScroll: true });
    else shelf.focusCurrent();
    options.onOpenChange?.(undefined);
  }

  function refresh(): void {
    const keepId = current()?.id ?? store.session().focusId;
    const items = listItems();
    const index = Math.max(
      0,
      bookmarks.findIndex((bookmark) => bookmark.id === keepId),
    );
    shelf.setItems(items);
    motion.setCount(items.length, index);
    lastFocusId = null;
    shelf.setPose({ position: motion.state.position, open: motion.state.open, reduced: motion.state.reduced });
    const focused = current();
    lastFocusId = focused?.id ?? null;
    options.onFocusChange?.(focused);
  }

  const stopStore = store.subscribe((event) => {
    if (event.reason === 'progress' || event.reason === 'session') return;
    if (savingFromReader) return;
    if (reader) {
      const bookmark = readerId ? store.get(readerId) : undefined;
      if (bookmark) reader.update(toReaderDoc(bookmark));
      else void close({ immediate: true });
      return;
    }
    refresh();
  });

  // Pick up where the person left off: same volume, and the reader if it was open.
  const resumeId = store.session().openId;
  if (resumeId && store.get(resumeId)) void open(resumeId, { immediate: true });

  return {
    shelf,
    motion,
    current,
    isOpen: () => reader !== null,
    show,
    open,
    close,
    setShelf(shelfId) {
      store.setSession({ shelfId });
      refresh();
      motion.goTo(0, { immediate: true });
    },
    setVariant(name) {
      shelf.setVariant(name);
      motion.setLoop(shelf.loop);
      motion.setTiming(shelf.variant.motion);
      store.setSession({ variant: shelf.variant.name });
      if (themePage) document.documentElement.dataset.variant = shelf.variant.name;
      refresh();
    },
    refresh,
    destroy() {
      destroyed = true;
      stopMotion();
      stopIntents();
      stopStore();
      detachGesture();
      reader?.destroy();
      motion.destroy();
      shelf.destroy();
      setBackgroundInert(false);
    },
  };
}

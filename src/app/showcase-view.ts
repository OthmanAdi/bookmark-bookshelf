import { mountShowcase, type ShowcaseHandle, type ShowcaseItem, type ShowcaseLook } from '../showcase';
import { type Bookmark, sortVolumes, type Store } from '../store';
import { formatMinutes, minutesOf } from '../store/reading-time';
import { type Bookshelf, toShelfItem } from './bookshelf';
import { linkState } from './flow-link-state';
import { primaryAction, savedOn } from './shell-stage';

/**
 * The showcase as a view of the app: the open shelf's links in the order the shelf and the list show
 * them, one at a time. This file turns links into what the showcase draws and its requests into the same
 * flows the caption under the row uses. The showcase is mounted the first time it is shown.
 */
export interface ShowcaseViewOptions {
  host: HTMLElement;
  store: Store;
  bookshelf: Bookshelf;
  edit(id: string): void;
  /** Says a sentence to a screen reader. */
  say(text: string): void;
}

export interface ShowcaseView {
  /** Reads the links again and redraws. Does nothing while the host is hidden. */
  render(): void;
  /** Brings a link into view and moves focus to it. */
  bring(id: string): void;
  /** Says which book is shown, for a person who cannot see that the view changed. */
  announce(): void;
  focus(): void;
  destroy(): void;
}

/** "3 of 15: title", as a screen reader hears which book is shown. */
export function shownSentence(title: string, index: number, count: number): string {
  return `${index + 1} of ${count}: ${title}`;
}

export function createShowcaseView(options: ShowcaseViewOptions): ShowcaseView {
  const { host, store, bookshelf } = options;
  let handle: ShowcaseHandle | null = null;
  let links: Bookmark[] = [];

  /** Forced colours take the classic drawing: the lit one would paint over the colours the person chose. */
  const forced = typeof matchMedia === 'function' ? matchMedia('(forced-colors: active)') : null;
  const paintOf = (): 'classic' | 'studio' => (forced?.matches ? 'classic' : bookshelf.paint);

  const lookOf = (): ShowcaseLook => {
    const { name, geometry } = bookshelf.shelf.variant;
    return { variant: name, aspect: geometry.coverWidth / geometry.bookHeight };
  };

  function read(): ShowcaseItem[] {
    const session = store.session();
    const stored = store.bookmarks(session.shelfId);
    const mode = session.sort ?? 'manual';
    links = mode === 'manual' ? stored : sortVolumes(stored, mode, { percentOf: (id) => store.progress(id)?.percent ?? 0, isDone: (id) => store.isDone(id) });
    // Catalogue marks by date added across the whole library, as the shelf prints them.
    const all = store
      .bookmarks(null)
      .slice()
      .sort((one, other) => one.addedAt.localeCompare(other.addedAt) || one.id.localeCompare(other.id));
    const width = all.length > 99 ? 3 : 2;
    const marks = new Map(all.map((bookmark, index) => [bookmark.id, String(index + 1).padStart(width, '0')]));
    const shelves = new Map(store.shelves().map((shelf) => [shelf.id, shelf]));
    const now = new Date();
    return links.map((bookmark) => {
      const state = linkState(store, bookmark);
      const minutes = minutesOf(bookmark);
      const saved = savedOn(bookmark.addedAt, now);
      return {
        book: toShelfItem(bookmark, store.progress(bookmark.id)?.percent ?? 0, {
          mark: marks.get(bookmark.id),
          done: state.done,
          lang: shelves.get(bookmark.shelfId)?.lang,
        }),
        url: bookmark.url,
        tags: bookmark.tags,
        action: state.action,
        state: state.state,
        minutes: minutes !== undefined ? formatMinutes(minutes) : undefined,
        saved: saved ? `Saved ${saved}` : undefined,
        shelf: session.shelfId === null ? shelves.get(bookmark.shelfId)?.name : undefined,
      };
    });
  }

  function open(id: string): void {
    const bookmark = store.get(id);
    if (!bookmark) return;
    const action = primaryAction({
      hasText: bookmark.reading !== undefined,
      percent: store.progress(id)?.percent ?? 0,
      done: store.isDone(id),
    });
    if (action.kind === 'add-text') return void bookshelf.open(id, { editCopy: true });
    // Reading again starts from the top, not from the end where the last reading stopped.
    if (action.kind === 'again') store.clearProgress(id);
    void bookshelf.open(id);
  }

  function render(): void {
    if (host.hidden) return;
    const items = read();
    const focus = store.session().focusId;
    const found = links.findIndex((bookmark) => bookmark.id === focus);
    if (!handle) {
      handle = mountShowcase(host, {
        items,
        index: Math.max(0, found),
        look: lookOf(),
        paint: paintOf(),
        label: 'Showcase',
        onRead: open,
        onEdit: options.edit,
        onIndex: (index, item) => {
          // The row follows, so the shelf and the reader open on the same link.
          bookshelf.show(item.book.id, { immediate: true });
          options.say(shownSentence(item.book.title, index, links.length));
        },
        onEnd: (end) => options.say(end === 'first' ? 'This is the first link.' : 'This is the last link.'),
        reduced: () => bookshelf.motion.state.reduced,
      });
      return;
    }
    handle.setLook(lookOf());
    handle.setPaint(paintOf());
    handle.setItems(items, found >= 0 ? found : handle.index);
    handle.refresh();
  }

  // The look and the drawing change without the links changing: follow both where they are written.
  const observer = new MutationObserver(() => render());
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-variant'] });
  observer.observe(bookshelf.shelf.element, { attributes: true, attributeFilter: ['data-paint'] });

  // Reading moves the progress; the words beside the book follow once the reader is closed.
  const stopStore = store.subscribe((event) => {
    if (event.reason !== 'progress' || bookshelf.isOpen()) return;
    render();
  });

  return {
    render,
    bring(id) {
      render();
      const index = links.findIndex((bookmark) => bookmark.id === id);
      if (index >= 0) handle?.show(index);
      handle?.focus();
    },
    focus() {
      handle?.focus();
    },
    announce() {
      const bookmark = handle ? links[handle.index] : undefined;
      if (bookmark && handle) options.say(`Showcase. ${shownSentence(bookmark.title, handle.index, links.length)}`);
    },
    destroy() {
      observer.disconnect();
      stopStore();
      handle?.destroy();
      handle = null;
    },
  };
}

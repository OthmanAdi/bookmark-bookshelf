/**
 * The browser's Back and Forward for the reader, and the page title. Opening the reader adds one entry
 * to the history, so Back (a button, a key or a swipe) closes it instead of leaving the app, and
 * Forward opens it again. The address itself does not change.
 */

const APP = 'Bookmark Bookshelf';

/** The specific part first, so a tab or a screen reader says what is open before whose page it is. */
export function pageTitle(open: { link?: string; shelf?: string | null }): string {
  const lead = open.link ?? open.shelf ?? 'All links';
  return `${lead} | ${APP}`;
}

export interface ReaderHistoryOptions {
  isOpen(): boolean;
  open(id: string): void;
  close(): void;
  history?: Pick<History, 'pushState' | 'replaceState' | 'back' | 'state'>;
  target?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

export interface ReaderHistory {
  /** Call when the reader has opened on a link. */
  opened(id: string): void;
  /** Call when the reader has closed. */
  closed(): void;
  destroy(): void;
}

interface ReaderState {
  bbReader: string;
}

function readerId(state: unknown): string | null {
  if (state && typeof state === 'object' && typeof (state as ReaderState).bbReader === 'string') return (state as ReaderState).bbReader;
  return null;
}

export function createReaderHistory(options: ReaderHistoryOptions): ReaderHistory {
  const history = options.history ?? window.history;
  const target = options.target ?? window;
  let closingFromHistory = false;

  const onPopState = (event: PopStateEvent): void => {
    const id = readerId(event.state);
    if (options.isOpen() && id === null) {
      closingFromHistory = true;
      options.close();
    } else if (!options.isOpen() && id !== null) {
      options.open(id);
    }
  };
  target.addEventListener('popstate', onPopState as EventListener);

  return {
    opened(id) {
      // Forward, or a reload while reading, already stands on this entry.
      const standing = readerId(history.state);
      if (standing === id) return;
      const state = { bbReader: id } satisfies ReaderState;
      // The reader has one entry. Going on to another link rewrites it, so one Back still closes the reader.
      if (standing !== null) history.replaceState(state, '');
      else history.pushState(state, '');
    },
    closed() {
      if (closingFromHistory) {
        closingFromHistory = false;
        return;
      }
      // Closed in the page (Escape, the close button): take back the entry the opening added.
      if (readerId(history.state) !== null) history.back();
    },
    destroy() {
      target.removeEventListener('popstate', onPopState as EventListener);
    },
  };
}

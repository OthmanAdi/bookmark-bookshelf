import { describe, expect, it, vi } from 'vitest';
import { createReaderHistory, pageTitle } from './shell-history';

function fakeHistory() {
  const entries: unknown[] = [null];
  let index = 0;
  const target = new EventTarget();
  const history = {
    get state() {
      return entries[index];
    },
    pushState(state: unknown) {
      entries.splice(index + 1, entries.length, state);
      index += 1;
    },
    replaceState(state: unknown) {
      entries[index] = state;
    },
    back() {
      if (index === 0) return;
      index -= 1;
      target.dispatchEvent(Object.assign(new Event('popstate'), { state: entries[index] }));
    },
    forward() {
      if (index >= entries.length - 1) return;
      index += 1;
      target.dispatchEvent(Object.assign(new Event('popstate'), { state: entries[index] }));
    },
    get length() {
      return entries.length;
    },
  };
  return { history, target };
}

function setup() {
  const { history, target } = fakeHistory();
  let open: string | null = null;
  const options = {
    isOpen: () => open !== null,
    open: vi.fn((id: string) => {
      open = id;
      reader.opened(id);
    }),
    close: vi.fn(() => {
      open = null;
      reader.closed();
    }),
    history: history as unknown as History,
    target: target as unknown as Window,
  };
  const reader = createReaderHistory(options);
  return {
    history,
    options,
    openInPage(id: string) {
      open = id;
      reader.opened(id);
    },
    closeInPage() {
      open = null;
      reader.closed();
    },
    isOpen: () => open,
  };
}

describe('createReaderHistory', () => {
  it('adds one entry on opening, and Back closes the reader without leaving', () => {
    const app = setup();
    app.openInPage('a');
    expect(app.history.length).toBe(2);
    app.history.back();
    expect(app.options.close).toHaveBeenCalledOnce();
    expect(app.isOpen()).toBeNull();
    expect(app.history.length).toBe(2);
  });

  it('takes the entry back when the reader is closed in the page', () => {
    const app = setup();
    app.openInPage('a');
    app.closeInPage();
    expect(app.history.state).toBeNull();
    expect(app.options.close).not.toHaveBeenCalled();
  });

  it('opens the same link again on Forward without adding another entry', () => {
    const app = setup();
    app.openInPage('a');
    app.history.back();
    app.history.forward();
    expect(app.options.open).toHaveBeenCalledWith('a');
    expect(app.isOpen()).toBe('a');
    expect(app.history.length).toBe(2);
  });

  it('rewrites its one entry when the reader goes on to another link', () => {
    const app = setup();
    app.openInPage('a');
    app.openInPage('b');
    expect(app.history.length).toBe(2);
    expect(app.history.state).toEqual({ bbReader: 'b' });
    app.history.back();
    expect(app.options.close).toHaveBeenCalledOnce();
    expect(app.isOpen()).toBeNull();
  });
});

describe('pageTitle', () => {
  it('names what is open first', () => {
    expect(pageTitle({ link: 'What is a URL?' })).toBe('What is a URL? | Bookmark Bookshelf');
    expect(pageTitle({ shelf: 'Reading list' })).toBe('Reading list | Bookmark Bookshelf');
    expect(pageTitle({ shelf: null })).toBe('All links | Bookmark Bookshelf');
  });
});

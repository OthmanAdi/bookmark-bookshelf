import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Store } from '../store';
import type { Bookshelf } from './bookshelf';
import { makeStore, mountPage } from './flow-test-helpers';
import { createFlows, type Flows } from './flows';

let store: Store;
let flows: Flows;
const shelf = { show: vi.fn(), open: vi.fn(async () => undefined), setShelf: vi.fn() };
const refresh = vi.fn();

function setAddress(path: string): void {
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(`http://localhost${path}`);
}

beforeEach(() => {
  mountPage();
  store = makeStore();
  shelf.show.mockClear();
  shelf.open.mockClear();
  shelf.setShelf.mockClear();
  refresh.mockClear();
  flows = createFlows({ store, bookshelf: shelf as unknown as Bookshelf, refresh });
  setAddress('/app.html');
});

const dialog = (): HTMLDialogElement => document.getElementById('editor') as HTMLDialogElement;
const value = (name: string): string => (document.querySelector(`#editor [name="${name}"]`) as HTMLInputElement).value;

describe('an address that adds a link', () => {
  it('opens the add dialog filled in, saves nothing, and clears the address', () => {
    const before = store.bookmarks().length;
    setAddress(`/app.html#add=${encodeURIComponent('https://example.org/essay')}&title=${encodeURIComponent('An essay')}&text=${encodeURIComponent('Selected words.')}`);
    flows.handleAddress();
    expect(dialog().open).toBe(true);
    expect(value('url')).toBe('https://example.org/essay');
    expect(value('title')).toBe('An essay');
    expect(value('readingText')).toBe('Selected words.');
    expect(store.bookmarks()).toHaveLength(before);
    expect(window.location.hash).toBe('');
  });

  it('takes the same keys from the query string', () => {
    setAddress(`/app.html?add=${encodeURIComponent('https://example.org/q')}`);
    flows.handleAddress();
    expect(value('url')).toBe('https://example.org/q');
    expect(window.location.search).toBe('');
  });

  it('ignores an address that is not meant for the app', () => {
    setAddress('/app.html#something');
    flows.handleAddress();
    expect(dialog().open).toBe(false);
    expect(window.location.hash).toBe('#something');
  });
});

describe('an address that opens a link', () => {
  it('brings the link to the centre and opens it', () => {
    const target = store.bookmarks()[3];
    setAddress(`/app.html#link=${target?.id}`);
    flows.handleAddress();
    expect(shelf.show).toHaveBeenCalledWith(target?.id, { immediate: true });
    expect(shelf.open).toHaveBeenCalledWith(target?.id);
    expect(window.location.hash).toBe('');
  });

  it('switches to the shelf the link is on', () => {
    const target = store.bookmarks()[0];
    const other = store.shelves().find((entry) => entry.id !== target?.shelfId);
    store.setSession({ shelfId: other?.id ?? null });
    setAddress(`/app.html#link=${target?.id}`);
    flows.handleAddress();
    expect(shelf.setShelf).toHaveBeenCalledWith(target?.shelfId);
    expect(refresh).toHaveBeenCalled();
  });

  it('says so when the link is not in this library', () => {
    setAddress('/app.html#link=no-such-link');
    flows.handleAddress();
    expect(shelf.open).not.toHaveBeenCalled();
    expect(document.getElementById('toasts')?.textContent).toContain('That link is not in this library.');
  });
});

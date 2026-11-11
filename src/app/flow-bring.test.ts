import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage, createStore, type Store } from '../store';
import { toNetscapeBookmarks } from '../store/export-formats';
import type { Bookshelf } from './bookshelf';
import { bringLinksInFlow, resultLine } from './flow-bring';
import { sniffText } from './flow-intake';
import { makeStore, mountPage } from './flow-test-helpers';
import type { FlowContext } from './flows';

let store: Store;
let context: FlowContext;
const shelf = { setShelf: vi.fn(), show: vi.fn() };
const refresh = vi.fn();

beforeEach(() => {
  mountPage();
  store = makeStore();
  shelf.setShelf.mockClear();
  shelf.show.mockClear();
  refresh.mockClear();
  context = { store, bookshelf: shelf as unknown as Bookshelf, refresh };
});

const dialog = (): HTMLDialogElement => document.querySelector('dialog[open]') as HTMLDialogElement;
const press = (label: string): void => {
  const found = [...dialog().querySelectorAll<HTMLButtonElement>('button')].find((entry) => entry.textContent === label);
  if (!found) throw new Error(`no button called ${label}`);
  found.click();
};
const confirm = (): HTMLButtonElement => dialog().querySelector('.bb-dialog__actions .bb-button--solid') as HTMLButtonElement;
const previewText = (): string => dialog().querySelector('.bb-intake__preview')?.textContent ?? '';
const file = (text: string, name = 'links.txt'): File => new File([text], name);
const toasts = (): string => document.getElementById('toasts')?.textContent ?? '';

function type(text: string): void {
  const field = dialog().querySelector('textarea[name="list"]') as HTMLTextAreaElement;
  field.value = text;
  field.dispatchEvent(new Event('input'));
}

describe('the three ways in', () => {
  it('opens on browser bookmarks with the three ways as tabs, and nothing to confirm yet', () => {
    bringLinksInFlow(context);
    const tabs = [...dialog().querySelectorAll('[role="tab"]')].map((entry) => entry.textContent);
    expect(tabs).toEqual(['Browser bookmarks', 'Pasted list', 'Library or shelf file']);
    expect(dialog().querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Browser bookmarks');
    expect(confirm().disabled).toBe(true);
  });

  it('moves between the ways with the arrow keys', () => {
    bringLinksInFlow(context);
    const first = dialog().querySelector('[role="tab"]') as HTMLElement;
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement?.textContent).toBe('Pasted list');
    expect((document.getElementById('bring-panel-list') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById('bring-panel-bookmarks') as HTMLElement).hidden).toBe(true);
  });
});

describe('a pasted list', () => {
  const lines = ['1. [First](https://example.org/one) - the first', 'Second | https://example.org/two | a note | ~12 min (optional)', 'not a link at all', 'https://example.org/three'].join('\n');

  async function openList(): Promise<void> {
    bringLinksInFlow(context);
    press('Pasted list');
    type(lines);
    await vi.waitFor(() => expect(previewText()).toContain('3 links found'));
  }

  it('shows what was read and what could not be, and saves nothing yet', async () => {
    const before = store.bookmarks().length;
    await openList();
    expect(previewText()).toContain('1 line could not be read');
    expect(previewText()).toContain('Line 3: not a link at all');
    expect(confirm().textContent).toBe('Add 3 links');
    expect(store.bookmarks()).toHaveLength(before);
  });

  it('adds them to the chosen shelf, switches to it and says what happened', async () => {
    await openList();
    const target = store.shelves()[1];
    (dialog().querySelector('select[name="shelf"]') as HTMLSelectElement).value = target?.id as string;
    const before = store.bookmarks(target?.id).length;
    confirm().click();
    await vi.waitFor(() => expect(toasts()).toContain('Added 3 links.'));
    expect(store.bookmarks(target?.id)).toHaveLength(before + 3);
    const second = store.findByUrl('https://example.org/two');
    expect(second).toMatchObject({ title: 'Second', note: 'a note', minutes: 12, required: false });
    expect(shelf.setShelf).toHaveBeenCalledWith(target?.id);
    expect(shelf.show).toHaveBeenCalledWith(store.findByUrl('https://example.org/one')?.id, { immediate: true });
    expect(document.querySelector('dialog[open]')).toBeNull();
  });

  it('can put them on a new shelf', async () => {
    await openList();
    const select = dialog().querySelector('select[name="shelf"]') as HTMLSelectElement;
    select.value = '__new__';
    select.dispatchEvent(new Event('change'));
    (dialog().querySelector('input[name="shelf-name"]') as HTMLInputElement).value = 'Week 4';
    confirm().click();
    await vi.waitFor(() => expect(store.shelves().some((entry) => entry.name === 'Week 4')).toBe(true));
    const created = store.shelves().find((entry) => entry.name === 'Week 4');
    expect(store.bookmarks(created?.id)).toHaveLength(3);
  });

  it('asks for a name when the new shelf has none', async () => {
    await openList();
    const select = dialog().querySelector('select[name="shelf"]') as HTMLSelectElement;
    select.value = '__new__';
    select.dispatchEvent(new Event('change'));
    confirm().click();
    expect(dialog().open).toBe(true);
    expect(document.getElementById('error-shelf-name')?.textContent).not.toBe('');
    expect(store.bookmarks().some((entry) => entry.url === 'https://example.org/one')).toBe(false);
  });

  it('counts links that are already saved and leaves them alone', async () => {
    const existing = store.bookmarks()[0];
    bringLinksInFlow(context);
    press('Pasted list');
    type(`${existing?.url}\nhttps://example.org/new-one`);
    await vi.waitFor(() => expect(previewText()).toContain('1 already saved'));
    expect(confirm().textContent).toBe('Add 1 link');
    const before = store.bookmarks().length;
    confirm().click();
    await vi.waitFor(() => expect(toasts()).toContain('already saved'));
    expect(store.bookmarks()).toHaveLength(before + 1);
  });
});

describe('a bookmarks file from a browser', () => {
  function bookmarksFile(): File {
    const html = toNetscapeBookmarks({
      shelves: [
        { id: 'a', name: 'Cooking' },
        { id: 'b', name: 'Travel' },
      ],
      bookmarks: [
        { shelfId: 'a', url: 'https://example.com/soup', title: 'Soup' },
        { shelfId: 'a', url: 'https://example.com/bread', title: 'Bread' },
        { shelfId: 'b', url: 'https://example.com/rome', title: 'Rome' },
        { shelfId: 'b', url: 'javascript:alert(1)', title: 'Bad one' },
      ],
    });
    return file(html, 'bookmarks.html');
  }

  it('is recognised by what is in it, previewed with shelves and skips, then added', async () => {
    bringLinksInFlow(context, [bookmarksFile()]);
    await vi.waitFor(() => expect(previewText()).toContain('3 links in 2 shelves'));
    expect(previewText()).toContain('Cooking, 2 links');
    expect(previewText()).toContain('Travel, 1 link');
    expect(previewText()).toContain('1 entry cannot be used');
    expect(confirm().textContent).toBe('Add 3 links');
    expect(store.findByUrl('https://example.com/soup')).toBeUndefined();

    confirm().click();
    await vi.waitFor(() => expect(toasts()).toContain('Added 3 links on 2 new shelves.'));
    expect(toasts()).toContain('1 entry could not be used.');
    expect(store.shelves().map((entry) => entry.name)).toEqual(expect.arrayContaining(['Cooking', 'Travel']));
    const cooking = store.shelves().find((entry) => entry.name === 'Cooking');
    expect(shelf.setShelf).toHaveBeenCalledWith(cooking?.id);
  });

  it('says how many are saved already', async () => {
    store.addBookmark({ url: 'https://example.com/soup' });
    bringLinksInFlow(context, [bookmarksFile()]);
    await vi.waitFor(() => expect(previewText()).toContain('1 is already saved'));
    expect(confirm().textContent).toBe('Add 2 links');
  });
});

describe('a file that is dropped on the page', () => {
  it('turns a text file into the pasted list', async () => {
    bringLinksInFlow(context, [file('https://example.org/a\nhttps://example.org/b')]);
    await vi.waitFor(() => expect(previewText()).toContain('2 links found'));
    expect(dialog().querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Pasted list');
  });

  it('refuses a file this app did not make, in words', async () => {
    bringLinksInFlow(context, [file('{"hello": "world"}', 'x.json')]);
    await vi.waitFor(() => expect(previewText()).toContain('not made by this app'));
    expect(confirm().disabled).toBe(true);
  });

  it('refuses an empty file and a damaged one', async () => {
    bringLinksInFlow(context, [file('   ')]);
    await vi.waitFor(() => expect(previewText()).toContain('That file is empty.'));
    dialog().querySelector<HTMLButtonElement>('.bb-dialog__actions .bb-button')?.click();
    bringLinksInFlow(context, [file('{"format": "bookmark-bookshelf", ', 'x.json')]);
    await vi.waitFor(() => expect(previewText()).toContain('cannot be read'));
  });

  it('opens the arrival preview for a shelf file instead of adding it straight away', async () => {
    const sender = makeStore();
    const written = sender.exportShelf(sender.shelves()[0]?.id as string, { includeTexts: false });
    if (!written.ok) throw new Error(written.error.message);
    const before = store.shelves().length;
    bringLinksInFlow(context, [file(JSON.stringify(written.value), 'x.shelf.json')]);
    await vi.waitFor(() => expect(document.querySelector('dialog[open]')?.textContent).toContain('A shelf has arrived'));
    expect(store.shelves()).toHaveLength(before);
  });

  it('adds only the new links of a library file, and never replaces without asking', async () => {
    const other = createStore({ storage: createMemoryStorage(), syncTabs: false });
    other.addBookmark({ url: 'https://example.org/from-backup', title: 'From backup' });
    other.addBookmark({ url: store.bookmarks()[0]?.url as string, title: 'Same address' });
    const backup = file(other.exportLibrary(), 'backup.json');
    bringLinksInFlow(context, [backup]);
    await vi.waitFor(() => expect(previewText()).toContain('A library file with 2 links'));
    expect(confirm().textContent).toBe('Add the new links');
    const mine = store.bookmarks().length;
    confirm().click();
    await vi.waitFor(() => expect(toasts()).toContain('Added 1 link.'));
    expect(store.bookmarks()).toHaveLength(mine + 1);
    expect(store.findByUrl('https://example.org/from-backup')?.title).toBe('From backup');
    expect(store.get(store.bookmarks()[0]?.id as string)?.title).not.toBe('Same address');
  });

  it('asks again before it replaces the library', async () => {
    const other = createStore({ storage: createMemoryStorage(), syncTabs: false });
    other.addBookmark({ url: 'https://example.org/only', title: 'Only' });
    bringLinksInFlow(context, [file(other.exportLibrary(), 'backup.json')]);
    await vi.waitFor(() => expect(previewText()).toContain('A library file'));
    (dialog().querySelector('input[value="replace"]') as HTMLInputElement).click();
    (dialog().querySelector('input[value="replace"]') as HTMLInputElement).dispatchEvent(new Event('change'));
    expect(confirm().textContent).toBe('Replace my library');
    const mine = store.bookmarks().length;
    confirm().click();
    await vi.waitFor(() => expect(document.querySelectorAll('dialog[open]')).toHaveLength(2));
    [...document.querySelectorAll<HTMLButtonElement>('dialog[open] button')].find((entry) => entry.textContent === 'Keep my library')?.click();
    await Promise.resolve();
    expect(store.bookmarks()).toHaveLength(mine);
  });
});

describe('what is said afterwards', () => {
  it('writes one plain sentence', () => {
    expect(resultLine({ added: 42, unchanged: 3, shelvesAdded: 5, skipped: [] })).toBe('Added 42 links on 5 new shelves. 3 were already saved and left as they were.');
    expect(resultLine({ added: 1, unchanged: 1, shelvesAdded: 0, skipped: [1, 2] })).toBe('Added 1 link. 1 was already saved and left as it was. 2 entries could not be used.');
  });
});

describe('sniffing', () => {
  it('tells the kinds of text apart', () => {
    expect(sniffText('<!DOCTYPE NETSCAPE-Bookmark-file-1><DL></DL>').kind).toBe('bookmarks');
    expect(sniffText('{"format":"bookmark-bookshelf-shelf"}').kind).toBe('refused');
    expect(sniffText('https://example.org').kind).toBe('list');
    expect(sniffText('').kind).toBe('refused');
  });
});

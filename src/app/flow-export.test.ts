import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Store } from '../store';
import { parseLinkList } from '../store/link-list';
import { parseNetscapeBookmarks } from '../store/netscape';
import { backupFile, bookmarksFile, markdownFile, takeLinksOutFlow } from './flow-export';
import { makeStore, mountPage } from './flow-test-helpers';

let store: Store;

beforeEach(() => {
  mountPage();
  store = makeStore();
});

describe('files to take out', () => {
  it('names the backup after the day and keeps the whole library', () => {
    const file = backupFile(store, new Date('2027-02-03T10:00:00Z'));
    expect(file.name).toBe('bookmark-bookshelf-2027-02-03.json');
    expect(JSON.parse(file.text).bookmarks).toHaveLength(store.bookmarks().length);
  });

  it('writes a bookmarks file with one folder per shelf that a browser file reader gets back', () => {
    const file = bookmarksFile(store, null);
    const read = parseNetscapeBookmarks(file.text);
    expect(read.folders.map((folder) => folder.name)).toEqual(store.shelves().map((shelf) => shelf.name));
    expect(read.folders.flatMap((folder) => folder.links)).toHaveLength(store.bookmarks().length);
  });

  it('can limit the bookmarks file and the list to one shelf', () => {
    const shelf = store.shelves()[1];
    const links = store.bookmarks(shelf?.id);
    const html = bookmarksFile(store, shelf?.id ?? null);
    expect(html.name).toBe(`bookmarks-${shelf?.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`);
    expect(parseNetscapeBookmarks(html.text).folders.flatMap((folder) => folder.links)).toHaveLength(links.length);
    const list = markdownFile(store, shelf?.id ?? null);
    expect(list.name.endsWith('.md')).toBe(true);
    expect(parseLinkList(list.text).entries).toHaveLength(links.length);
  });
});

describe('the dialog', () => {
  const dialog = (): HTMLDialogElement => document.querySelector('dialog[open]') as HTMLDialogElement;

  it('starts on the open shelf and saves what is pressed', () => {
    const shelf = store.shelves()[2];
    store.setSession({ shelfId: shelf?.id ?? null });
    const create = vi.fn(() => 'blob:x');
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = create;
    takeLinksOutFlow(store);
    expect((dialog().querySelector('select') as HTMLSelectElement).value).toBe(shelf?.id);
    [...dialog().querySelectorAll('button')].find((entry) => entry.textContent === 'Save list')?.click();
    expect(create).toHaveBeenCalledTimes(1);
    expect(dialog().querySelector('.bb-dialog__status')?.textContent).toMatch(/^Saved .*\.md\.$/);
  });

  it('offers the three ways out, with a sentence for each', () => {
    takeLinksOutFlow(store);
    expect([...dialog().querySelectorAll('.bb-takeout__title')].map((entry) => entry.textContent)).toEqual([
      'Backup of everything',
      'Bookmarks file for a browser',
      'List for a document',
    ]);
    expect(dialog().querySelectorAll('.bb-takeout__about')).toHaveLength(3);
  });
});

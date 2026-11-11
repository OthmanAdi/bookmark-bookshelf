import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage, createStore, type Store } from '../store';
import { encodeShelfLink } from '../store/shelf-link';
import type { Bookshelf } from './bookshelf';
import { countsLine, hostsLine, linkProblem, receiveFromLink } from './flow-arrive';
import { makeStore, mountPage, tick } from './flow-test-helpers';
import type { FlowContext } from './flows';

let sender: Store;
let mine: Store;
let context: FlowContext;
const shelf = { setShelf: vi.fn(), show: vi.fn() };
const refresh = vi.fn();

beforeEach(() => {
  mountPage();
  sender = makeStore();
  mine = createStore({ storage: createMemoryStorage(), syncTabs: false });
  shelf.setShelf.mockClear();
  shelf.show.mockClear();
  refresh.mockClear();
  context = { store: mine, bookshelf: shelf as unknown as Bookshelf, refresh };
});

const dialog = (): HTMLDialogElement | null => document.querySelector('dialog[open]');
const press = (label: string): void => {
  [...(dialog()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((entry) => entry.textContent === label)?.click();
};

async function fragmentOf(store: Store, shelfId: string): Promise<string> {
  const file = store.exportShelf(shelfId, { includeTexts: true });
  if (!file.ok) throw new Error(file.error.message);
  return (await encodeShelfLink(file.value)).fragment;
}

describe('a shelf that arrives as a link', () => {
  it('shows who sent it, what it holds and where the links go, and adds nothing yet', async () => {
    const homework = sender.shelves()[0];
    const fragment = await fragmentOf(sender, homework?.id as string);
    const done = receiveFromLink(context, fragment);
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    const text = dialog()?.textContent ?? '';
    expect(text).toContain(homework?.name);
    expect(text).toContain('as written in the file. This is not verified.');
    expect(text).toMatch(/\d+ links/);
    expect(text).toContain('developer.mozilla.org');
    expect(dialog()?.querySelectorAll('.bb-arrive__titles li')).toHaveLength(3);
    expect(mine.shelves().some((entry) => entry.name === homework?.name)).toBe(false);
    press('Cancel');
    await done;
    expect(mine.bookmarks()).toHaveLength(0);
    expect(shelf.setShelf).not.toHaveBeenCalled();
  });

  it('adds it as a new shelf, switches to it and brings the first link to read to the centre', async () => {
    const homework = sender.shelves()[0];
    const fragment = await fragmentOf(sender, homework?.id as string);
    const before = mine.shelves().length;
    const done = receiveFromLink(context, fragment);
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    press('Add as a new shelf');
    await done;
    expect(mine.shelves()).toHaveLength(before + 1);
    const arrived = mine.shelves().find((entry) => entry.name === homework?.name);
    expect(arrived).toBeDefined();
    expect(shelf.setShelf).toHaveBeenCalledWith(arrived?.id);
    expect(shelf.show).toHaveBeenCalledWith(mine.bookmarks(arrived?.id)[0]?.id, { immediate: true });
    expect(refresh).toHaveBeenCalled();
    expect(document.getElementById('toasts')?.textContent).toContain('Added as a new shelf. Nothing of yours was changed.');
  });

  it('shows what a stranger wrote as text, never as markup', async () => {
    const hostile = sender.addShelf('Hostile');
    if (!hostile.ok) throw new Error('no shelf');
    sender.updateShelf(hostile.value.id, { description: '<img src=x onerror=alert(1)>', author: '<b>Mallory</b>' });
    sender.addBookmark({ url: 'https://example.org/a', title: '<script>alert(1)</script>', shelfId: hostile.value.id });
    const done = receiveFromLink(context, await fragmentOf(sender, hostile.value.id));
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    expect(dialog()?.querySelector('img, script, b')).toBeNull();
    expect(dialog()?.textContent).toContain('<script>alert(1)</script>');
    press('Cancel');
    await done;
  });

  it('says in words that a damaged link cannot be opened', async () => {
    const done = receiveFromLink(context, 'shelf=1.d.not-a-real-payload');
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    expect(dialog()?.textContent).toContain('This shelf link cannot be opened');
    expect(dialog()?.textContent).toContain('This link is damaged or incomplete.');
    press('OK');
    await done;
    expect(mine.bookmarks()).toHaveLength(0);
  });

  it('says plainly when the browser cannot open compressed links', async () => {
    const fragment = await fragmentOf(sender, sender.shelves()[0]?.id as string);
    vi.stubGlobal('DecompressionStream', undefined);
    try {
      const done = receiveFromLink(context, fragment);
      await vi.waitFor(() => expect(dialog()).not.toBeNull());
      expect(dialog()?.textContent).toContain('This browser cannot open shelf links. Ask for the shelf file.');
      press('OK');
      await done;
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not leave a dialog behind after cancelling', async () => {
    const done = receiveFromLink(context, await fragmentOf(sender, sender.shelves()[0]?.id as string));
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    press('Cancel');
    await done;
    await tick();
    expect(dialog()).toBeNull();
  });
});

describe('the lines of the preview', () => {
  it('counts links, required ones, minutes and the due date', () => {
    expect(countsLine({ name: 'x', volumes: 6, required: 4, minutes: 50, minutesKnownFor: 6, hosts: [], firstTitles: [], due: '2026-11-20' }, 'en-GB')).toBe('6 links, 4 required, about 50 min, due 20 Nov 2026');
    expect(countsLine({ name: 'x', volumes: 1, required: 1, minutesKnownFor: 0, hosts: [], firstTitles: [] })).toBe('1 link');
  });

  it('lists a few hosts and counts the rest', () => {
    expect(hostsLine(['a.org', 'b.org'])).toBe('a.org, b.org');
    expect(hostsLine(Array.from({ length: 11 }, (_, index) => `h${index}.org`))).toBe('h0.org, h1.org, h2.org, h3.org, h4.org, h5.org, h6.org, h7.org, and 3 more');
  });

  it('gives the plain sentence for an unsupported browser and the store sentence otherwise', () => {
    expect(linkProblem({ code: 'link-unsupported', message: 'x' })).toBe('This browser cannot open shelf links. Ask for the shelf file.');
    expect(linkProblem({ code: 'link-damaged', message: 'Damaged.' })).toBe('Damaged.');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Store } from '../store';
import { makeStore, mountPage, tick } from './flow-test-helpers';
import { removeShelfFlow } from './flow-shelf';
import type { FlowContext } from './flows';

let store: Store;
let setShelf: ReturnType<typeof vi.fn>;
let refresh: ReturnType<typeof vi.fn>;
let context: FlowContext;

beforeEach(() => {
  mountPage();
  store = makeStore();
  setShelf = vi.fn();
  refresh = vi.fn();
  context = { store, bookshelf: { setShelf } as unknown as FlowContext['bookshelf'], refresh };
});

const open = (): HTMLDialogElement | null => document.querySelector('dialog[open].bb-dialog--small');
const press = (label: string): void => {
  const found = [...(open()?.querySelectorAll('button') ?? [])].find((entry) => entry.textContent === label);
  if (!found) throw new Error(`no button called ${label}`);
  found.click();
};

describe('removing a shelf', () => {
  it('says where the links will go and removes nothing until the person agrees', async () => {
    const [first, second, third] = store.shelves();
    const count = store.bookmarks(first?.id).length;
    const before = store.shelves().length;
    const done = removeShelfFlow(context, first?.id as string);
    await tick();
    expect(open()?.textContent).toContain(`Remove ${first?.name}?`);
    expect(open()?.textContent).toContain(`${count} link`);
    expect(open()?.querySelector('select')?.value).toBe(second?.id);
    expect([...(open()?.querySelectorAll('option') ?? [])].map((entry) => entry.textContent)).toEqual([second?.name, third?.name]);
    expect(store.shelves()).toHaveLength(before);
    press('Keep shelf');
    await done;
    expect(store.shelves()).toHaveLength(before);
  });

  it('moves the links to the chosen shelf and offers undo', async () => {
    const [first, second, third] = store.shelves();
    const ids = store.bookmarks(first?.id).map((bookmark) => bookmark.id);
    const done = removeShelfFlow(context, first?.id as string);
    await tick();
    const select = open()?.querySelector('select') as HTMLSelectElement;
    select.value = third?.id as string;
    press('Remove shelf');
    await done;
    expect(store.shelves().some((shelf) => shelf.id === first?.id)).toBe(false);
    expect(ids.every((id) => store.get(id)?.shelfId === third?.id)).toBe(true);
    expect(document.querySelector('#toasts')?.textContent).toContain(`Removed ${first?.name}.`);
    expect(document.querySelector('#toasts')?.textContent).toContain(`moved to ${third?.name}`);
    expect(refresh).toHaveBeenCalled();

    document.querySelector<HTMLButtonElement>('#toasts .bb-toast__action')?.click();
    expect(store.shelves().map((shelf) => shelf.id)).toEqual([first?.id, second?.id, third?.id]);
    expect(store.bookmarks(first?.id).map((bookmark) => bookmark.id)).toEqual(ids);
  });

  it('brings the shelf back at the end when something else changed in the meantime', async () => {
    const [first] = store.shelves();
    const ids = store.bookmarks(first?.id).map((bookmark) => bookmark.id);
    const done = removeShelfFlow(context, first?.id as string);
    await tick();
    press('Remove shelf');
    await done;
    store.addShelf('Another one');
    document.querySelector<HTMLButtonElement>('#toasts .bb-toast__action')?.click();
    expect(store.shelves().some((shelf) => shelf.id === first?.id)).toBe(true);
    expect(store.shelves().some((shelf) => shelf.name === 'Another one')).toBe(true);
    expect(store.bookmarks(first?.id).map((bookmark) => bookmark.id)).toEqual(ids);
  });

  it('lets the frame know when the open shelf is the one that went', async () => {
    const [first] = store.shelves();
    store.setSession({ shelfId: first?.id ?? null });
    const done = removeShelfFlow(context, first?.id as string);
    await tick();
    press('Remove shelf');
    await done;
    expect(setShelf).toHaveBeenCalledWith(null);
  });

  it('does not remove the last shelf', async () => {
    const only = store.shelves()[0];
    for (const shelf of store.shelves().slice(1)) store.removeShelf(shelf.id);
    await removeShelfFlow(context, only?.id as string);
    expect(open()).toBeNull();
    expect(store.shelves()).toHaveLength(1);
    expect(document.querySelector('#toasts')?.textContent).toContain('The last shelf cannot be removed.');
  });

  it('says so when the shelf is empty', async () => {
    const empty = store.addShelf('Empty one');
    if (!empty.ok) throw new Error(empty.error.message);
    const done = removeShelfFlow(context, empty.value.id);
    await tick();
    expect(open()?.textContent).toContain('This shelf has no links.');
    press('Remove shelf');
    await done;
    expect(store.shelves().some((shelf) => shelf.id === empty.value.id)).toBe(false);
  });
});

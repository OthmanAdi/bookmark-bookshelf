import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Store } from '../store';
import { decodeShelfLink } from '../store/shelf-link';
import { LINK_FITS, shareAddress, shareShelfFlow } from './flow-share';
import { makeStore, mountPage } from './flow-test-helpers';

let store: Store;
let shelfId: string;

beforeEach(() => {
  mountPage();
  store = makeStore();
  shelfId = store.shelves()[0]?.id as string;
});

const dialog = (): HTMLDialogElement => document.querySelector('dialog[open]') as HTMLDialogElement;
const readout = (): string => dialog().querySelector('.bb-share__readout')?.textContent ?? '';
const link = (): HTMLInputElement => dialog().querySelector('.bb-share__link') as HTMLInputElement;
const press = (label: string): void => {
  [...dialog().querySelectorAll<HTMLButtonElement>('button')].find((entry) => entry.textContent === label)?.click();
};

function addLongText(): void {
  const text = Array.from({ length: 4000 }, (_, index) => `Sentence number ${index} about links and shelves, with its own odd words ${index * 7919}.`).join(' ');
  store.addBookmark({ url: 'https://example.org/long', title: 'A very long text', readingText: text, shelfId });
}

describe('sharing a shelf', () => {
  it('offers a file and a link, and says what is never included', () => {
    shareShelfFlow(store, shelfId);
    expect(dialog().textContent).toContain('Save the shelf file');
    expect(dialog().textContent).toContain('Your reading places, read marks and notes are never included.');
    expect(document.activeElement?.textContent).toBe('Save the shelf file');
  });

  it('shows the length of the link and what it fits', async () => {
    shareShelfFlow(store, shelfId);
    await vi.waitFor(() => expect(link().value).not.toBe(''));
    expect(link().value.startsWith(shareAddress('shelf=1.'))).toBe(true);
    expect(readout()).toMatch(/^[\d,.\s]+ characters\. /);
    expect(readout()).toContain(Object.values(LINK_FITS).find((sentence) => readout().endsWith(sentence)) ?? 'no fit sentence');
  });

  it('opens the same shelf again from the link, with no personal state in it', async () => {
    const first = store.bookmarks(shelfId)[0];
    store.setDone(first?.id as string, true);
    store.setNote(first?.id as string, 'A private note.');
    shareShelfFlow(store, shelfId);
    await vi.waitFor(() => expect(link().value).not.toBe(''));
    const fragment = link().value.slice(link().value.indexOf('#') + 1);
    const read = await decodeShelfLink(fragment);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.file.volumes.map((volume) => volume.title)).toEqual(store.bookmarks(shelfId).map((entry) => entry.title));
    expect(JSON.stringify(read.value.file)).not.toContain('A private note.');
  });

  it('offers only the file when the link would be too long, and a shorter link without the texts', async () => {
    addLongText();
    shareShelfFlow(store, shelfId);
    await vi.waitFor(() => expect(readout()).toContain(LINK_FITS['file-only']));
    expect((dialog().querySelector('.bb-share__row[hidden]') as HTMLElement | null)?.hidden).toBe(true);
    expect(link().value).toBe('');

    const leaveOut = dialog().querySelector('input[type="checkbox"]') as HTMLInputElement;
    leaveOut.checked = true;
    leaveOut.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(link().value).not.toBe(''));
    expect(readout()).not.toContain(LINK_FITS['file-only']);
  });

  it('shows the checkbox only when some link on the shelf has text', () => {
    shareShelfFlow(store, shelfId);
    const has = Boolean(store.bookmarks(shelfId).some((entry) => entry.reading));
    expect(Boolean(dialog().querySelector('input[type="checkbox"]'))).toBe(has);
  });

  it('saves the shelf file under a name made from the shelf', () => {
    const create = vi.fn((blob: Blob) => {
      void blob;
      return 'blob:x';
    });
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = create;
    shareShelfFlow(store, shelfId);
    press('Save the shelf file');
    expect(create).toHaveBeenCalledTimes(1);
    expect(dialog().querySelector('.bb-dialog__status')?.textContent).toMatch(/^Saved .*\.shelf\.json\.$/);
  });

  it('copies the link, or selects it when copying is refused', async () => {
    const write = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    shareShelfFlow(store, shelfId);
    await vi.waitFor(() => expect(link().value).not.toBe(''));
    press('Copy link');
    await vi.waitFor(() => expect(write).toHaveBeenCalledWith(link().value));

    write.mockRejectedValueOnce(new Error('refused'));
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    press('Copy link');
    await vi.waitFor(() => expect(dialog().querySelector('.bb-dialog__status')?.textContent).toContain('Copying was refused'));
  });
});

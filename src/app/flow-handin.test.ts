import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Store } from '../store';
import { handInFlow, summaryFileName, summaryOf } from './flow-handin';
import { buildPrintPage, printShelf } from './flow-print';
import { makeStore, mountPage, tick } from './flow-test-helpers';

let store: Store;
let shelfId: string;

beforeEach(() => {
  mountPage();
  store = makeStore();
  shelfId = store.shelves()[0]?.id as string;
});

const dialog = (): HTMLDialogElement => document.querySelector('dialog[open]') as HTMLDialogElement;
const press = (label: string): void => {
  [...dialog().querySelectorAll('button')].find((entry) => entry.textContent === label)?.click();
};

describe('the hand-in summary', () => {
  it('lists what was read and carries the private notes', () => {
    const [first, second] = store.bookmarks(shelfId);
    store.setDone(first?.id as string, true);
    store.setNote(second?.id as string, 'Check the second part.');
    const text = summaryOf(store, shelfId, new Date('2027-01-05T10:00:00Z'));
    expect(text).toContain(`[x] ${first?.title}`);
    expect(text).toContain(`[ ] ${second?.title}`);
    expect(text).toContain('    Check the second part.');
    expect(text.trim().endsWith('This list is self-reported.')).toBe(true);
  });

  it('opens as a text field that can be edited, and says nothing is sent', () => {
    handInFlow(store, shelfId);
    const field = dialog().querySelector('textarea') as HTMLTextAreaElement;
    expect(field.readOnly).toBe(false);
    expect(field.value).toContain('Reading summary:');
    expect(field.value.trim().endsWith('This list is self-reported.')).toBe(true);
    expect(dialog().textContent).toContain('Nothing is sent anywhere.');
    expect(document.activeElement).toBe(field);
  });

  it('copies what is in the field, edits included', async () => {
    const write = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    handInFlow(store, shelfId);
    const field = dialog().querySelector('textarea') as HTMLTextAreaElement;
    field.value = `Name: Sam Example\n${field.value}`;
    press('Copy');
    await tick();
    expect(write).toHaveBeenCalledWith(field.value);
    expect(dialog().querySelector('.bb-dialog__status')?.textContent).toBe('Copied.');
  });

  it('selects the text when copying is refused', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => Promise.reject(new Error('no')) }, configurable: true });
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    handInFlow(store, shelfId);
    press('Copy');
    await tick();
    expect(dialog().querySelector('.bb-dialog__status')?.textContent).toContain('Copying was refused');
  });

  it('saves a text file named after the shelf', () => {
    const create = vi.fn(() => 'blob:x');
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = create;
    handInFlow(store, shelfId);
    press('Save as a text file');
    expect(create).toHaveBeenCalledTimes(1);
    expect(document.getElementById('toasts')?.textContent).toContain('Saved as a text file.');
  });

  it('names the file from the shelf', () => {
    expect(summaryFileName('Week 3: Reading & notes')).toBe('week-3-reading-notes-summary.txt');
    expect(summaryFileName('Übung')).toBe('ubung-summary.txt');
    expect(summaryFileName('???')).toBe('shelf-summary.txt');
  });
});

describe('printing', () => {
  it('builds a plain numbered list of a shelf with the full addresses', () => {
    const shelf = store.shelves()[0];
    const links = store.bookmarks(shelfId);
    const page = buildPrintPage(shelf?.name ?? '', { kind: 'list', shelf: shelf as never, links });
    expect(page.querySelector('h1')?.textContent).toBe(shelf?.name);
    expect(page.querySelectorAll('ol > li')).toHaveLength(links.length);
    expect(page.querySelector('.bb-print__url')?.textContent).toBe(links[0]?.url);
  });

  it('puts the page in the document for printing and takes it away afterwards', () => {
    const print = vi.fn();
    window.print = print;
    printShelf(store, shelfId);
    expect(print).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.bb-print')).not.toBeNull();
    window.dispatchEvent(new Event('afterprint'));
    expect(document.querySelector('.bb-print')).toBeNull();
  });

  it('prints the summary text as it stands in the field', () => {
    const print = vi.fn();
    window.print = print;
    handInFlow(store, shelfId);
    (dialog().querySelector('textarea') as HTMLTextAreaElement).value = 'Edited text';
    press('Print');
    expect(document.querySelector('.bb-print__text')?.textContent).toBe('Edited text');
    window.dispatchEvent(new Event('afterprint'));
  });
});

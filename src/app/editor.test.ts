import { beforeEach, describe, expect, it } from 'vitest';
import type { Bookmark, Store } from '../store';
import { createEditor } from './editor';
import { makeStore, mountPage, tick } from './flow-test-helpers';

let store: Store;
let saved: Array<{ bookmark: Bookmark; created: boolean }>;

const input = (name: string): HTMLInputElement => document.querySelector(`#editor [name="${name}"]`) as HTMLInputElement;
const dialog = (): HTMLDialogElement => document.getElementById('editor') as HTMLDialogElement;

beforeEach(() => {
  mountPage();
  store = makeStore();
  saved = [];
});

function editor() {
  return createEditor(store, (bookmark, created) => saved.push({ bookmark, created }));
}

describe('add', () => {
  it('opens with focus on the link field', () => {
    editor().add();
    expect(dialog().open).toBe(true);
    expect(document.activeElement).toBe(input('url'));
    expect(document.getElementById('editor-title')?.textContent).toBe('Add a link');
    expect((document.getElementById('editor-delete') as HTMLElement).hidden).toBe(true);
  });

  it('fills the form from a preset', () => {
    const shelf = store.shelves()[1];
    editor().add({ url: 'https://example.org/a', title: 'A page', text: 'Some text.', shelfId: shelf?.id });
    expect(input('url').value).toBe('https://example.org/a');
    expect(input('title').value).toBe('A page');
    expect(input('readingText').value).toBe('Some text.');
    expect(input('shelfId').value).toBe(shelf?.id);
  });

  it('never saves by itself', () => {
    const before = store.bookmarks().length;
    editor().add({ url: 'https://example.org/a' });
    expect(store.bookmarks()).toHaveLength(before);
    expect(saved).toHaveLength(0);
  });

  it('shows an empty link as an error on that field and keeps the dialog open', () => {
    editor().add();
    (document.getElementById('editor-save') as HTMLButtonElement).click();
    expect(dialog().open).toBe(true);
    expect(input('url').getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById('error-url')?.textContent).toBe('Enter a web address.');
    expect(saved).toHaveLength(0);
  });

  it('clears the error once the person types', () => {
    editor().add();
    (document.getElementById('editor-save') as HTMLButtonElement).click();
    input('url').value = 'example.org/x';
    input('url').dispatchEvent(new Event('input'));
    expect(input('url').hasAttribute('aria-invalid')).toBe(false);
  });

  it('saves and closes', () => {
    editor().add();
    input('url').value = 'https://example.org/essay';
    (document.getElementById('editor-save') as HTMLButtonElement).click();
    expect(dialog().open).toBe(false);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.created).toBe(true);
  });

  it('names a link without a title after the end of its address', () => {
    editor().add();
    input('url').value = 'https://example.org/essays/why-we-keep-tabs-open.html';
    input('url').dispatchEvent(new Event('input'));
    expect(document.getElementById('hint-title')?.textContent).toContain('Why we keep tabs open');
    (document.getElementById('editor-save') as HTMLButtonElement).click();
    expect(saved[0]?.bookmark.title).toBe('Why we keep tabs open');
  });

  it('keeps a title the person typed', () => {
    editor().add();
    input('url').value = 'https://example.org/essays/why-we-keep-tabs-open.html';
    input('title').value = 'My own title';
    (document.getElementById('editor-save') as HTMLButtonElement).click();
    expect(saved[0]?.bookmark.title).toBe('My own title');
  });

  it('saves and stays open for the next link', () => {
    editor().add();
    input('url').value = 'https://example.org/one';
    (document.getElementById('editor-save-more') as HTMLButtonElement).click();
    expect(dialog().open).toBe(true);
    expect(saved).toHaveLength(1);
    expect(input('url').value).toBe('');
    expect(document.activeElement).toBe(input('url'));
    expect(document.querySelector('#editor .bb-dialog__status')?.textContent).toBe('Saved. Add the next link.');
    input('url').value = 'https://example.org/two';
    (document.getElementById('editor-save') as HTMLButtonElement).click();
    expect(dialog().open).toBe(false);
    expect(saved).toHaveLength(2);
  });
});

describe('words', () => {
  it('calls the saved text text and the saved item a link', () => {
    editor().add();
    expect(input('readingText').closest('label')?.textContent).toContain('Text to read (optional)');
    expect(document.getElementById('editor-delete')?.textContent).toBe('Remove link');
    const words = (document.getElementById('editor') as HTMLElement).textContent ?? '';
    expect(words).not.toMatch(/volume|reading copy|sample/i);
  });
});

describe('edit', () => {
  it('says Edit link, offers removal and hides Save and add another', () => {
    const target = store.bookmarks()[0] as Bookmark;
    editor().edit(target.id);
    expect(document.getElementById('editor-title')?.textContent).toBe('Edit link');
    expect((document.getElementById('editor-delete') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById('editor-save-more') as HTMLElement).hidden).toBe(true);
    expect(input('url').value).toBe(target.url);
  });

  it('removes a link with an undo that puts it back', () => {
    const target = store.bookmarks()[0] as Bookmark;
    const count = store.bookmarks().length;
    editor().edit(target.id);
    (document.getElementById('editor-delete') as HTMLButtonElement).click();
    expect(store.bookmarks()).toHaveLength(count - 1);
    const undo = document.querySelector<HTMLButtonElement>('#toasts .bb-toast__action');
    expect(document.querySelector('#toasts')?.textContent).toContain(`Removed ${target.title}.`);
    undo?.click();
    expect(store.bookmarks()).toHaveLength(count);
  });
});

describe('closing', () => {
  function pressBackdrop(): void {
    const d = dialog();
    d.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    d.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  it('closes at once on a backdrop click when nothing was typed', () => {
    editor().add();
    pressBackdrop();
    expect(dialog().open).toBe(false);
  });

  it('asks before discarding typed text, and keeps the dialog when told to', async () => {
    editor().add();
    input('readingText').value = 'A long pasted text.';
    pressBackdrop();
    await tick();
    const ask = document.querySelector<HTMLDialogElement>('dialog[open].bb-dialog--small');
    expect(ask?.open).toBe(true);
    expect(ask?.textContent).toContain('Discard what you typed?');
    const keep = [...(ask?.querySelectorAll('button') ?? [])].find((entry) => entry.textContent === 'Keep editing');
    keep?.click();
    await tick();
    expect(dialog().open).toBe(true);
    expect(input('readingText').value).toBe('A long pasted text.');
  });

  it('closes after the person agrees to discard', async () => {
    editor().add();
    input('note').value = 'Typed.';
    pressBackdrop();
    await tick();
    const discard = [...document.querySelectorAll('dialog[open].bb-dialog--small button')].find((entry) => entry.textContent === 'Discard') as HTMLButtonElement;
    discard.click();
    await tick();
    expect(dialog().open).toBe(false);
  });

  it('gives focus back to the control that opened it', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    editor().add();
    (document.getElementById('editor-cancel') as HTMLButtonElement).click();
    expect(document.activeElement).toBe(opener);
  });
});


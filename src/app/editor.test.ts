import { beforeEach, describe, expect, it } from 'vitest';
import type { Bookmark, Store } from '../store';
import { BINDING_LABELS, BINDINGS, STAMP_LABELS, STAMPS } from '../studio/types';
import { createEditor } from './editor';
import { makeStore, mountPage, tick } from './flow-test-helpers';

let store: Store;
let saved: Array<{ bookmark: Bookmark; created: boolean }>;
let shown: Bookmark[];

const input = (name: string): HTMLInputElement => document.querySelector(`#editor [name="${name}"]`) as HTMLInputElement;
const dialog = (): HTMLDialogElement => document.getElementById('editor') as HTMLDialogElement;

beforeEach(() => {
  mountPage();
  store = makeStore();
  saved = [];
  shown = [];
});

function editor() {
  return createEditor(
    store,
    (bookmark, created) => saved.push({ bookmark, created }),
    (bookmark) => shown.push(bookmark),
  );
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

describe('a link that is already saved', () => {
  const typeAddress = (value: string): void => {
    input('url').value = value;
    input('url').dispatchEvent(new Event('input'));
  };
  const note = (): HTMLElement => document.getElementById('note-url') as HTMLElement;

  it('says where it is, and offers to show it', () => {
    const existing = store.bookmarks()[0] as Bookmark;
    const shelf = store.shelves().find((entry) => entry.id === existing.shelfId);
    editor().add();
    typeAddress(existing.url);
    expect(note().hidden).toBe(false);
    expect(note().textContent).toContain(`Already on ${shelf?.name}.`);
    expect(input('url').hasAttribute('aria-invalid')).toBe(false);
  });

  it('recognises the same address written a little differently', () => {
    const existing = store.bookmarks()[0] as Bookmark;
    editor().add();
    typeAddress(`${existing.url.replace('https://', 'HTTPS://')}#top`);
    expect(note().hidden).toBe(false);
  });

  it('stays quiet for an address that is new, and when editing the link itself', () => {
    const existing = store.bookmarks()[0] as Bookmark;
    const ed = editor();
    ed.add();
    typeAddress('https://example.org/brand-new');
    expect(note().hidden).toBe(true);
    ed.edit(existing.id);
    expect(note().hidden).toBe(true);
  });

  it('closes and shows the link when asked', () => {
    const existing = store.bookmarks()[2] as Bookmark;
    editor().add();
    typeAddress(existing.url);
    (note().querySelector('button') as HTMLButtonElement).click();
    expect(dialog().open).toBe(false);
    expect(shown.map((entry) => entry.id)).toEqual([existing.id]);
  });

  it('still lets the person save it again', () => {
    const existing = store.bookmarks()[0] as Bookmark;
    const count = store.bookmarks().length;
    editor().add();
    typeAddress(existing.url);
    (document.getElementById('editor-save') as HTMLButtonElement).click();
    expect(store.bookmarks()).toHaveLength(count + 1);
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

describe('binding and title stamp', () => {
  const radios = (name: string): HTMLInputElement[] => [...document.querySelectorAll<HTMLInputElement>(`#editor input[type="radio"][name="${name}"]`)];
  const radio = (name: string, value: string): HTMLInputElement => {
    const found = radios(name).find((entry) => entry.value === value);
    if (!found) throw new Error(`no ${name} radio for ${value}`);
    return found;
  };
  const choose = (name: string, value: string): void => {
    radio(name, value).click();
  };
  const save = (): void => (document.getElementById('editor-save') as HTMLButtonElement).click();

  it('offers Automatic and every binding, each named by its visible label, in a group named Binding', () => {
    editor().add();
    const group = radio('binding', '').closest('fieldset');
    expect(group?.querySelector('legend')?.textContent).toBe('Binding');
    expect(radios('binding').map((entry) => entry.value)).toEqual(['', ...BINDINGS]);
    const names = radios('binding').map((entry) => entry.closest('label')?.textContent?.trim());
    expect(names).toEqual(['Automatic', ...BINDINGS.map((value) => BINDING_LABELS[value])]);
    for (const entry of radios('binding')) {
      expect(entry.closest('label')?.querySelector('.bb-swatch__chip')?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('offers Automatic and every stamp in a group named Title stamp', () => {
    editor().add();
    expect(radio('stamp', '').closest('fieldset')?.querySelector('legend')?.textContent).toBe('Title stamp');
    expect(radios('stamp').map((entry) => entry.value)).toEqual(['', ...STAMPS]);
    const names = radios('stamp').map((entry) => entry.closest('label')?.textContent?.trim());
    expect(names).toEqual(['Automatic', ...STAMPS.map((value) => STAMP_LABELS[value])]);
  });

  it('says where the choice shows', () => {
    editor().add();
    const group = radio('binding', '').closest('fieldset') as HTMLElement;
    const hint = document.getElementById(group.getAttribute('aria-describedby') ?? '');
    expect(hint?.textContent).toContain('Studio');
  });

  it('starts a new link on Automatic and saves no choice', () => {
    editor().add();
    expect(radio('binding', '').checked).toBe(true);
    expect(radio('stamp', '').checked).toBe(true);
    input('url').value = 'https://example.org/plain';
    save();
    expect(saved[0]?.bookmark.cover).not.toHaveProperty('binding');
    expect(saved[0]?.bookmark.cover).not.toHaveProperty('stamp');
  });

  it('saves the binding and stamp chosen for a new link', () => {
    editor().add();
    input('url').value = 'https://example.org/bound';
    choose('binding', 'leather');
    choose('stamp', 'gold');
    save();
    expect(saved[0]?.bookmark.cover).toMatchObject({ binding: 'leather', stamp: 'gold' });
  });

  it('opens a link with its choices checked, and Automatic removes them', () => {
    const target = store.bookmarks()[0] as Bookmark;
    store.updateBookmark(target.id, { cover: { binding: 'velvet', stamp: 'copper' } });
    editor().edit(target.id);
    expect(radio('binding', 'velvet').checked).toBe(true);
    expect(radio('stamp', 'copper').checked).toBe(true);
    choose('binding', '');
    save();
    expect(store.get(target.id)?.cover).not.toHaveProperty('binding');
    expect(store.get(target.id)?.cover.stamp).toBe('copper');
  });

  it('keeps a name this version does not offer when the person leaves it alone', () => {
    const target = store.bookmarks()[0] as Bookmark;
    store.updateBookmark(target.id, { cover: { binding: 'marble' } });
    editor().edit(target.id);
    expect(radios('binding').some((entry) => entry.checked)).toBe(false);
    input('title').value = 'Renamed';
    save();
    expect(store.get(target.id)?.cover.binding).toBe('marble');
  });

  it('counts a changed choice as something to keep when the backdrop is pressed', async () => {
    editor().add();
    choose('stamp', 'blind');
    dialog().dispatchEvent(new Event('pointerdown', { bubbles: true }));
    dialog().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    expect(document.querySelector('dialog[open].bb-dialog--small')).not.toBeNull();
  });
});

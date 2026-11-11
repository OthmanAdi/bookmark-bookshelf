import type { Store } from '../store';
import { handInSummary } from '../store/hand-in';
import { minutesOf } from '../store/reading-time';
import { button, copyText, downloadText, make, toast } from './dom';
import { createDialog } from './flow-dialog';
import { buildPrintPage, printPage } from './flow-print';

/**
 * The hand-in summary: a plain text list of what was read on one shelf, for pasting into a message or a
 * form. It is built from what the person marked, and it can be edited before it is copied.
 */

export function summaryOf(store: Store, shelfId: string, date: Date = new Date()): string {
  const shelf = store.shelves().find((entry) => entry.id === shelfId);
  if (!shelf) return '';
  return handInSummary({
    shelfName: shelf.name,
    volumes: store.bookmarks(shelfId),
    isDone: (id) => store.isDone(id),
    noteOf: (id) => store.note(id) || undefined,
    minutesOf,
    date,
    lang: shelf.lang,
  });
}

/** A file name made of the shelf name: lower case, words joined with hyphens. */
export function summaryFileName(shelfName: string): string {
  const slug = shelfName
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return `${slug || 'shelf'}-summary.txt`;
}

export function handInFlow(store: Store, shelfId: string): void {
  const shelf = store.shelves().find((entry) => entry.id === shelfId);
  if (!shelf) return;

  const shell = createDialog({ title: 'Hand-in summary', size: 'medium' });
  const field = make('textarea', 'bb-summary');
  field.rows = 12;
  field.value = summaryOf(store, shelfId);
  field.spellcheck = false;
  field.setAttribute('aria-label', `Summary for ${shelf.name}`);
  const note = make('p', 'bb-dialog__status');
  note.setAttribute('role', 'status');

  shell.body.append(
    make('p', 'bb-dialog__text', 'Nothing is sent anywhere. This is built from what you marked as read and from your notes, so it is self-reported. You can edit it before you copy it.'),
    field,
    note,
  );

  const copy = button('Copy', 'bb-button', async () => {
    if (await copyText(field.value)) {
      note.textContent = 'Copied.';
      return;
    }
    field.focus();
    field.select();
    note.textContent = 'Copying was refused. The text is selected: copy it with the keyboard.';
  });
  const save = button('Save as a text file', 'bb-button', () => {
    downloadText(summaryFileName(shelf.name), `${field.value}\n`, 'text/plain;charset=utf-8');
    toast('Saved as a text file.');
  });
  const print = button('Print', 'bb-button', () => printPage(buildPrintPage(`Reading summary: ${shelf.name}`, { kind: 'text', text: field.value })));
  const done = button('Done', 'bb-button bb-button--solid', () => shell.close());
  shell.actions.append(copy, save, print, done);
  shell.open(field);
  field.setSelectionRange(0, 0);
  field.scrollTop = 0;
}

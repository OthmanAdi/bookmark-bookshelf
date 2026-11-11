import { bookmarkletSource } from '../store/add-request';
import { button, copyText, make, toast } from './dom';
import { createDialog } from './flow-dialog';

/**
 * Sending the page a person is reading to the app. The browser keeps a small bookmark that opens the app
 * with the page's address, title and selected text; the app shows its add dialog filled in and saves
 * nothing until the person presses Save.
 */
export function sendPageHereFlow(appAddress: string = `${window.location.origin}${window.location.pathname}`): void {
  const code = bookmarkletSource(appAddress);
  const shell = createDialog({ title: 'Send the current page here', size: 'medium' });

  shell.body.append(
    make('p', 'bb-dialog__text', 'Drag this link to your bookmarks bar. On any page, click it to send that page’s address, its title and any text you selected.'),
    make('p', 'bb-dialog__text', 'The app opens its add dialog filled in. Nothing is saved until you press Save.'),
  );

  const link = make('a', 'bb-bookmarklet', 'Add to Bookmark Bookshelf');
  link.href = code;
  link.draggable = true;
  const note = make('p', 'bb-dialog__status');
  note.setAttribute('role', 'status');
  // The script would be blocked on this page anyway; say what to do instead of doing nothing.
  link.addEventListener('click', (event) => {
    event.preventDefault();
    note.textContent = 'Drag this link to your bookmarks bar. Clicking it here does nothing.';
  });

  const field = make('textarea', 'bb-bookmarklet__code');
  field.readOnly = true;
  field.rows = 3;
  field.value = code;
  field.hidden = true;
  field.setAttribute('aria-label', 'The bookmark address, to paste into a new bookmark');
  field.addEventListener('focus', () => field.select());

  const copy = button('Copy the address instead', 'bb-button', async () => {
    if (await copyText(code)) {
      toast('Copied. Paste it as the address of a new bookmark.');
      return;
    }
    field.hidden = false;
    field.focus();
    note.textContent = 'Select the address below and copy it, then paste it as the address of a new bookmark.';
  });

  const close = button('Done', 'bb-button bb-button--solid', () => shell.close());
  const row = make('p', 'bb-bookmarklet__row');
  row.appendChild(link);
  shell.body.append(row, note, field);
  shell.actions.append(copy, close);
  shell.open(link);
}

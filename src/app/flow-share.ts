import type { Store } from '../store';
import { shelfFileName, type ShelfFile } from '../store/shelf-file';
import { encodeShelfLink, linkFit, type LinkFit } from '../store/shelf-link';
import { button, copyText, downloadText, make, toast } from './dom';
import { createDialog } from './flow-dialog';

/**
 * Handing one shelf to someone: as a file, or as a link that carries the whole shelf. Only what can be
 * handed over goes into either: never reading places, read marks or private notes.
 */

export const LINK_FITS: Record<LinkFit, string> = {
  chat: 'Short enough to send in a chat message.',
  browser: 'Works in a browser. Some chat apps cut long links, so send the file there.',
  'file-only': 'Too long for a link. Send the file instead, or leave out the texts.',
};

/** The address that opens a shelf in this app. */
export function shareAddress(fragment: string, base: string = `${window.location.origin}${window.location.pathname}`): string {
  return `${base}#${fragment}`;
}

export async function shareLinkFor(file: ShelfFile, base?: string): Promise<{ link: string; length: number; fit: LinkFit }> {
  const encoded = await encodeShelfLink(file);
  const link = shareAddress(encoded.fragment, base);
  return { link, length: link.length, fit: linkFit(link.length) };
}

export function shareShelfFlow(store: Store, shelfId: string): void {
  const shelf = store.shelves().find((entry) => entry.id === shelfId);
  if (!shelf) return;
  const hasTexts = store.bookmarks(shelfId).some((link) => link.reading);

  const shell = createDialog({ title: `Share ${shelf.name}`, size: 'medium' });
  const status = make('p', 'bb-dialog__status');
  status.setAttribute('role', 'status');

  const leaveOut = make('input');
  leaveOut.type = 'checkbox';
  leaveOut.id = 'share-leave-out';
  const leaveOutRow = make('label', 'bb-check');
  leaveOutRow.append(leaveOut, make('span', '', 'Leave out the texts'));
  const leaveOutHint = make('p', 'bb-field__hint', 'The links, titles and notes still go. A shorter file, and a shorter link.');

  const fileHeading = make('h3', 'bb-share__heading', 'As a file');
  const fileAbout = make('p', 'bb-dialog__text', 'Anyone can open it with Bring links in, in any browser, with no account.');
  const saveFile = button('Save the shelf file', 'bb-button bb-button--solid', () => {
    const file = store.exportShelf(shelfId, { includeTexts: !leaveOut.checked });
    if (!file.ok) {
      status.textContent = file.error.message;
      return;
    }
    const name = shelfFileName(shelf.name);
    downloadText(name, `${JSON.stringify(file.value, null, 2)}\n`, 'application/json');
    status.textContent = `Saved ${name}.`;
  });

  const linkHeading = make('h3', 'bb-share__heading', 'As a link');
  const linkField = make('input', 'bb-share__link');
  linkField.type = 'text';
  linkField.readOnly = true;
  linkField.setAttribute('aria-label', 'The link to this shelf');
  linkField.addEventListener('focus', () => linkField.select());
  const readout = make('p', 'bb-share__readout');
  readout.setAttribute('role', 'status');
  const copy = button('Copy link', 'bb-button', async () => {
    if (await copyText(linkField.value)) {
      toast('Link copied.');
      return;
    }
    linkField.focus();
    linkField.select();
    status.textContent = 'Copying was refused. The link is selected: copy it with the keyboard.';
  });
  const linkRow = make('div', 'bb-share__row');
  linkRow.append(linkField, copy);

  const privacy = make('p', 'bb-field__hint', 'Whoever opens it sees a preview first and decides whether to add it. Your reading places, read marks and notes are never included.');

  let latest = 0;
  async function refreshLink(): Promise<void> {
    const turn = ++latest;
    const file = store.exportShelf(shelfId, { includeTexts: !leaveOut.checked });
    if (!file.ok) {
      readout.textContent = file.error.message;
      linkRow.hidden = true;
      return;
    }
    const result = await shareLinkFor(file.value);
    if (turn !== latest) return;
    const usable = result.fit !== 'file-only';
    linkRow.hidden = !usable;
    linkField.value = usable ? result.link : '';
    readout.textContent = `${result.length.toLocaleString()} characters. ${LINK_FITS[result.fit]}`;
  }
  leaveOut.addEventListener('change', () => void refreshLink());

  const fileRow = make('div', 'bb-share__row');
  fileRow.appendChild(saveFile);
  if (hasTexts) shell.body.append(leaveOutRow, leaveOutHint);
  shell.body.append(fileHeading, fileAbout, fileRow, linkHeading, readout, linkRow, privacy, status);

  const done = button('Done', 'bb-button', () => shell.close());
  shell.actions.append(done);
  shell.open(saveFile);
  void refreshLink();
}

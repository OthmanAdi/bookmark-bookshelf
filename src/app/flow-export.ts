import type { Store } from '../store';
import { toMarkdownList, toNetscapeBookmarks } from '../store/export-formats';
import { button, downloadText, make, option } from './dom';
import { createDialog } from './flow-dialog';
import { fileSlug } from './flow-files';

/**
 * Ways to take links out of the app. A backup keeps everything, including reading places and notes. A
 * bookmarks file and a Markdown list carry only the links, the titles and the notes, so they can go into a
 * browser or a document.
 */

export interface ExportFile {
  name: string;
  text: string;
  type: string;
}

export function backupFile(store: Store, date: Date = new Date()): ExportFile {
  return { name: `bookmark-bookshelf-${date.toISOString().slice(0, 10)}.json`, text: store.exportLibrary(), type: 'application/json' };
}

/** `shelfId` null means every shelf. */
export function bookmarksFile(store: Store, shelfId: string | null): ExportFile {
  const library = store.snapshot();
  const shelves = shelfId === null ? library.shelves : library.shelves.filter((shelf) => shelf.id === shelfId);
  const links = library.bookmarks.filter((link) => shelves.some((shelf) => shelf.id === link.shelfId));
  const label = shelfId === null ? 'all-shelves' : fileSlug(shelves[0]?.name ?? '');
  return { name: `bookmarks-${label}.html`, text: toNetscapeBookmarks({ shelves, bookmarks: links }), type: 'text/html;charset=utf-8' };
}

export function markdownFile(store: Store, shelfId: string | null): ExportFile {
  const shelves = store.shelves().filter((shelf) => shelfId === null || shelf.id === shelfId);
  const text = shelves.map((shelf) => toMarkdownList({ shelfName: shelf.name, volumes: store.bookmarks(shelf.id) })).join('\n');
  const label = shelfId === null ? 'all-shelves' : fileSlug(shelves[0]?.name ?? '');
  return { name: `${label}.md`, text, type: 'text/markdown;charset=utf-8' };
}

export function takeLinksOutFlow(store: Store): void {
  const shell = createDialog({ title: 'Take links out', size: 'medium' });
  const status = make('p', 'bb-dialog__status');
  status.setAttribute('role', 'status');

  const choice = make('select');
  choice.appendChild(option('', 'All shelves'));
  choice.append(...store.shelves().map((shelf) => option(shelf.id, shelf.name)));
  choice.value = store.session().shelfId ?? '';
  const picker = make('label', 'bb-field');
  picker.append(make('span', 'bb-label', 'Which shelves'), choice);

  const save = (file: ExportFile): void => {
    downloadText(file.name, file.text, file.type);
    status.textContent = `Saved ${file.name}.`;
  };
  const scope = (): string | null => choice.value || null;

  const rows: Array<{ title: string; about: string; label: string; run: () => void }> = [
    {
      title: 'Backup of everything',
      about: 'Every shelf with your reading places, read marks and notes. Keep it safe, and bring it back with Bring links in.',
      label: 'Save backup',
      run: () => save(backupFile(store)),
    },
    {
      title: 'Bookmarks file for a browser',
      about: 'Links, titles and notes, one folder per shelf. Chrome, Firefox, Edge and Safari can all import it.',
      label: 'Save bookmarks file',
      run: () => save(bookmarksFile(store, scope())),
    },
    {
      title: 'List for a document',
      about: 'A numbered Markdown list of titles and addresses, to paste into notes or a web page.',
      label: 'Save list',
      run: () => save(markdownFile(store, scope())),
    },
  ];

  shell.body.append(picker, make('p', 'bb-field__hint', 'This applies to the bookmarks file and the list. The backup always holds everything.'));
  for (const row of rows) {
    const item = make('div', 'bb-takeout');
    const text = make('div', 'bb-takeout__text');
    text.append(make('p', 'bb-takeout__title', row.title), make('p', 'bb-takeout__about', row.about));
    item.append(text, button(row.label, 'bb-button', row.run));
    shell.body.appendChild(item);
  }
  shell.body.appendChild(status);

  const done = button('Done', 'bb-button bb-button--solid', () => shell.close());
  shell.actions.append(done);
  shell.open(choice);
}

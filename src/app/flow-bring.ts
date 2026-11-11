import type { ImportSummary, Result, Store } from '../store';
import { parseLinkList } from '../store/link-list';
import { button, make, option, toast } from './dom';
import { askConfirm, createDialog } from './flow-dialog';
import { buildField, setFieldError } from './flow-fields';
import { countKnown, readIntakeFile, type Intake } from './flow-intake';
import { receiveShelf } from './flow-arrive';
import type { FlowContext } from './flows';

/**
 * Bringing many links in at once. One dialog with three ways in (a bookmarks file from a browser, a pasted
 * list, a library or shelf file). Whatever is chosen is read and described first, with what will be added,
 * what is already saved and what will be skipped and why, and nothing is saved until the person confirms.
 */

type Way = 'bookmarks' | 'list' | 'file';

const WAYS: ReadonlyArray<{ id: Way; label: string }> = [
  { id: 'bookmarks', label: 'Browser bookmarks' },
  { id: 'list', label: 'Pasted list' },
  { id: 'file', label: 'Library or shelf file' },
];

const SHOWN_SHELVES = 6;
const SHOWN_PROBLEMS = 5;

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count.toLocaleString()} ${many}`;
}

function listOf(items: string[]): HTMLElement {
  const list = make('ul', 'bb-intake__list');
  for (const item of items) list.appendChild(make('li', '', item));
  return list;
}

/** What an import did, in one sentence for the person. */
export function resultLine(summary: Pick<ImportSummary, 'added' | 'unchanged' | 'shelvesAdded'> & { skipped?: unknown[] }): string {
  const parts = [`Added ${plural(summary.added, 'link', 'links')}`];
  if (summary.shelvesAdded > 0) parts[0] += ` on ${plural(summary.shelvesAdded, 'new shelf', 'new shelves')}`;
  let line = `${parts[0]}.`;
  if (summary.unchanged > 0) line += ` ${summary.unchanged.toLocaleString()} ${summary.unchanged === 1 ? 'was' : 'were'} already saved and left as ${summary.unchanged === 1 ? 'it was' : 'they were'}.`;
  const skipped = summary.skipped?.length ?? 0;
  if (skipped > 0) line += ` ${plural(skipped, 'entry', 'entries')} could not be used.`;
  return line;
}

export function bringLinksInFlow(context: FlowContext, files: File[] = []): void {
  const { store } = context;
  const shell = createDialog({ title: 'Bring links in', size: 'wide', isDirty: () => paste.value.trim() !== '' });
  const status = make('p', 'bb-dialog__status');
  status.setAttribute('role', 'status');

  /* ---------- the preview and the one confirm ---------- */

  const preview = make('div', 'bb-intake__preview');
  preview.setAttribute('aria-live', 'polite');
  let pending: (() => Promise<void> | void) | null = null;
  const cancel = button('Cancel', 'bb-button', () => shell.close());
  const confirm = button('Add', 'bb-button bb-button--solid', () => void run());
  confirm.disabled = true;
  shell.actions.append(cancel, confirm);

  function showPreview(nodes: Node[], label: string | null, action?: () => Promise<void> | void): void {
    preview.replaceChildren(...nodes);
    pending = label && action ? action : null;
    confirm.disabled = pending === null || store.readOnly;
    confirm.textContent = label ?? 'Add';
    if (store.readOnly && pending) status.textContent = 'This library was made by a newer version of the app and is open read-only, so nothing can be added.';
    else if (pending) status.textContent = '';
  }

  async function run(): Promise<void> {
    const action = pending;
    if (!action) return;
    confirm.disabled = true;
    try {
      await action();
    } finally {
      confirm.disabled = pending === null || store.readOnly;
    }
  }

  function landOn(shelfId: string | null, firstUrl?: string): void {
    context.bookshelf.setShelf(shelfId);
    context.refresh();
    const first = (firstUrl ? store.findByUrl(firstUrl)?.id : undefined) ?? store.bookmarks(shelfId)[0]?.id;
    if (first) context.bookshelf.show(first, { immediate: true });
  }

  function done(result: Result<ImportSummary>, landing: () => void): void {
    if (!result.ok) {
      status.textContent = result.error.message;
      return;
    }
    shell.close();
    landing();
    toast(resultLine(result.value), undefined, 8000);
  }

  /* ---------- way 1: a bookmarks file from a browser ---------- */

  const bookmarksFile = make('input');
  bookmarksFile.type = 'file';
  bookmarksFile.accept = '.html,.htm,text/html';
  const bookmarksPanel = panel('bookmarks', [
    make('p', 'bb-dialog__text', 'In your browser’s bookmarks manager, export your bookmarks as an HTML file. Then choose that file here. Each folder becomes a shelf.'),
    buildField(bookmarksFile, { label: 'Bookmarks file', name: 'bookmarks-file' }),
  ]);
  bookmarksFile.addEventListener('change', () => void takeFile(bookmarksFile));

  /* ---------- way 2: a pasted list ---------- */

  const paste = make('textarea');
  paste.rows = 7;
  paste.spellcheck = false;
  const target = make('select');
  const NEW = '__new__';
  const rebuildTargets = (): void => {
    target.replaceChildren(...store.shelves().map((shelf) => option(shelf.id, shelf.name)), option(NEW, 'A new shelf'));
    target.value = store.session().shelfId ?? store.shelves()[0]?.id ?? NEW;
  };
  rebuildTargets();
  const newName = make('input');
  newName.type = 'text';
  newName.maxLength = 60;
  const newNameField = buildField(newName, { label: 'Name of the new shelf', name: 'shelf-name' });
  const syncNewName = (): void => {
    newNameField.hidden = target.value !== NEW;
  };
  syncNewName();
  const listPanel = panel('list', [
    buildField(paste, {
      label: 'Your list, one link on each line',
      name: 'list',
      hint: 'Each line can be [Title](address), Title | address | note, Title - address, address Title, or just an address. Add (optional) to mark a link as optional and ~12 min for its reading time.',
    }),
    buildField(target, { label: 'Add them to', name: 'shelf' }),
    newNameField,
  ]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const readList = (): void => {
    const text = paste.value;
    if (text.trim() === '') {
      showPreview([], null);
      return;
    }
    const { entries, unreadable } = parseLinkList(text);
    const known = countKnown(store, entries.map((entry) => entry.url));
    const nodes: Node[] = [];
    const fresh = entries.length;
    nodes.push(make('p', 'bb-intake__count', fresh === 0 ? 'No links found.' : `${plural(fresh, 'link', 'links')} found${known > 0 ? `, ${known.toLocaleString()} already saved` : ''}.`));
    if (known > 0) nodes.push(make('p', 'bb-intake__hint', 'A link that is already saved is left as it is.'));
    if (unreadable.length > 0) {
      nodes.push(make('p', 'bb-intake__problem', `${plural(unreadable.length, 'line', 'lines')} could not be read and will be left out:`));
      nodes.push(listOf(unreadable.slice(0, SHOWN_PROBLEMS).map((line) => `Line ${line.line}: ${line.text.length > 80 ? `${line.text.slice(0, 79)}…` : line.text}`)));
      if (unreadable.length > SHOWN_PROBLEMS) nodes.push(make('p', 'bb-intake__hint', `And ${unreadable.length - SHOWN_PROBLEMS} more.`));
    }
    showPreview(nodes, fresh === 0 ? null : `Add ${plural(fresh - known, 'link', 'links')}`, () => addList(entries));
  };
  paste.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(readList, 200);
  });
  target.addEventListener('change', syncNewName);

  function addList(entries: ReturnType<typeof parseLinkList>['entries']): void {
    setFieldError(newName, null);
    let shelfId = target.value;
    if (shelfId === NEW) {
      const created = store.addShelf(newName.value);
      if (!created.ok) {
        setFieldError(newName, created.error.message);
        newName.focus();
        return;
      }
      shelfId = created.value.id;
    }
    const result = store.importLinks(entries, shelfId);
    done(result, () => landOn(shelfId, entries[0]?.url));
  }

  /* ---------- way 3: a library file or a shelf file ---------- */

  const anyFile = make('input');
  anyFile.type = 'file';
  anyFile.accept = '.json,.txt,.md,application/json,text/plain';
  const filePanel = panel('file', [
    make('p', 'bb-dialog__text', 'A backup you saved with Take links out, or a shelf file someone sent you. A shelf file is shown to you first and added as one new shelf.'),
    buildField(anyFile, { label: 'File', name: 'any-file' }),
  ]);
  anyFile.addEventListener('change', () => void takeFile(anyFile));

  /* ---------- tabs ---------- */

  const tabs = make('div', 'bb-intake__tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Ways to bring links in');
  const panels: Record<Way, HTMLElement> = { bookmarks: bookmarksPanel, list: listPanel, file: filePanel };
  const buttons = new Map<Way, HTMLButtonElement>();
  let way: Way = 'bookmarks';

  function choose(next: Way, focus = false): void {
    way = next;
    for (const [id, tab] of buttons) {
      const on = id === next;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[id].hidden = !on;
    }
    if (next === 'list') readList();
    else showPreview([], null);
    status.textContent = '';
    if (focus) buttons.get(next)?.focus();
  }
  for (const entry of WAYS) {
    const tab = make('button', 'bb-intake__tab', entry.label);
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.id = `bring-tab-${entry.id}`;
    tab.setAttribute('aria-controls', `bring-panel-${entry.id}`);
    tab.addEventListener('click', () => choose(entry.id));
    tab.addEventListener('keydown', (event) => {
      const at = WAYS.findIndex((item) => item.id === way);
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (step === 0 && event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? WAYS.length - 1 : (at + step + WAYS.length) % WAYS.length;
      choose(WAYS[index]?.id ?? 'bookmarks', true);
    });
    buttons.set(entry.id, tab);
    tabs.appendChild(tab);
  }
  shell.body.append(tabs, bookmarksPanel, listPanel, filePanel, preview, status);

  function panel(id: Way, children: Node[]): HTMLElement {
    const box = make('div', 'bb-intake__panel');
    box.id = `bring-panel-${id}`;
    box.setAttribute('role', 'tabpanel');
    box.setAttribute('aria-labelledby', `bring-tab-${id}`);
    box.append(...children);
    return box;
  }

  /* ---------- reading what was chosen ---------- */

  async function takeFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    if (file) await takeIntake(await readIntakeFile(file));
  }

  async function takeIntake(intake: Intake): Promise<void> {
    // Focus follows the way that was chosen when it was on the tabs, so it never rests on a tab that is no longer selected.
    const onTabs = tabs.contains(document.activeElement);
    if (intake.kind === 'refused') {
      showPreview([make('p', 'bb-intake__problem', intake.message)], null);
      return;
    }
    if (intake.kind === 'list') {
      choose('list', onTabs);
      paste.value = intake.text;
      readList();
      return;
    }
    if (intake.kind === 'shelf') {
      shell.close();
      await shell.closed;
      await receiveShelf(context, intake.read);
      return;
    }
    if (intake.kind === 'bookmarks') {
      choose('bookmarks', onTabs);
      previewBookmarks(intake.read);
      return;
    }
    choose('file', onTabs);
    previewLibrary(intake);
  }

  function previewBookmarks(read: Extract<Intake, { kind: 'bookmarks' }>['read']): void {
    const links = read.folders.flatMap((folder) => folder.links);
    const known = countKnown(store, links.map((link) => link.url));
    const nodes: Node[] = [];
    nodes.push(make('p', 'bb-intake__count', links.length === 0 ? 'No links found in that file.' : `${plural(links.length, 'link', 'links')} in ${plural(read.folders.length, 'shelf', 'shelves')}.`));
    if (read.folders.length > 0) {
      const names = read.folders.slice(0, SHOWN_SHELVES).map((folder) => `${folder.name}, ${plural(folder.links.length, 'link', 'links')}`);
      if (read.folders.length > SHOWN_SHELVES) names.push(`and ${read.folders.length - SHOWN_SHELVES} more`);
      nodes.push(listOf(names));
    }
    if (known > 0) nodes.push(make('p', 'bb-intake__hint', `${known.toLocaleString()} ${known === 1 ? 'is' : 'are'} already saved and will be left as ${known === 1 ? 'it is' : 'they are'}.`));
    if (read.skipped.length > 0) {
      nodes.push(make('p', 'bb-intake__problem', `${plural(read.skipped.length, 'entry', 'entries')} cannot be used and will be skipped:`));
      nodes.push(listOf(read.skipped.slice(0, SHOWN_PROBLEMS).map((entry) => `${entry.title || entry.url}: ${entry.reason}`)));
      if (read.skipped.length > SHOWN_PROBLEMS) nodes.push(make('p', 'bb-intake__hint', `And ${read.skipped.length - SHOWN_PROBLEMS} more.`));
    }
    showPreview(nodes, links.length === 0 ? null : `Add ${plural(Math.max(links.length - known, 0), 'link', 'links')}`, () => {
      const before = new Set(store.shelves().map((shelf) => shelf.id));
      const result = store.importFolders(read.folders, { skipped: read.skipped });
      done(result, () => {
        const landing = store.shelves().find((shelf) => !before.has(shelf.id)) ?? store.shelves().find((shelf) => shelf.name.toLowerCase() === read.folders[0]?.name.toLowerCase());
        landOn(landing?.id ?? null, read.folders[0]?.links[0]?.url);
      });
    });
  }

  function previewLibrary(intake: Extract<Intake, { kind: 'library' }>): void {
    const nodes: Node[] = [make('p', 'bb-intake__count', `A library file with ${plural(intake.links, 'link', 'links')} on ${plural(intake.shelves, 'shelf', 'shelves')}.`)];
    const choice = make('fieldset', 'bb-intake__choice');
    choice.appendChild(make('legend', 'bb-label', 'What to do with it'));
    const merge = radio('merge', 'Add the links I do not have yet. Everything of mine stays as it is.', true);
    const replace = radio('replace', 'Replace my whole library with this file, including reading places and notes.', false);
    choice.append(merge.row, replace.row);
    nodes.push(choice);
    showPreview(nodes, 'Add the new links', async () => {
      if (replace.input.checked) {
        const sure = await askConfirm({
          title: 'Replace your library?',
          message: 'Your current shelves, links, reading places and notes will be replaced by what is in the file. Take links out first if you want a copy.',
          confirm: 'Replace my library',
          cancel: 'Keep my library',
        });
        if (!sure) return;
        const result = store.importLibrary(intake.text, 'replace');
        done(result, () => landOn(null));
        return;
      }
      const before = new Set(store.shelves().map((shelf) => shelf.id));
      const result = store.importLibrary(intake.text, 'merge');
      done(result, () => landOn(store.shelves().find((shelf) => !before.has(shelf.id))?.id ?? null));
    });
    const relabel = (): void => {
      confirm.textContent = replace.input.checked ? 'Replace my library' : 'Add the new links';
    };
    merge.input.addEventListener('change', relabel);
    replace.input.addEventListener('change', relabel);
  }

  function radio(value: string, label: string, checked: boolean): { row: HTMLElement; input: HTMLInputElement } {
    const row = make('label', 'bb-check');
    const input = make('input');
    input.type = 'radio';
    input.name = 'library-mode';
    input.value = value;
    input.checked = checked;
    row.append(input, make('span', '', label));
    return { row, input };
  }

  /* ---------- open ---------- */

  choose('bookmarks');
  shell.open(buttons.get('bookmarks'));
  const [dropped] = files;
  if (dropped) void readIntakeFile(dropped).then(takeIntake);
}

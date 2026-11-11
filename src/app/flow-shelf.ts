import type { Shelf } from '../store';
import { button, make, option, toast } from './dom';
import { createDialog } from './flow-dialog';
import { buildField, setFieldError } from './flow-fields';
import { undoerFor } from './flow-undo';
import type { FlowContext } from './flows';

/** What the app does to a shelf as a whole: removing it, and describing it. */

function linkCount(count: number): string {
  return count === 1 ? '1 link' : `${count} links`;
}

/** Asks where the links of a shelf should go. Resolves with the chosen shelf, or null when the person cancels. */
function askDestination(shelf: Shelf, others: Shelf[], count: number): Promise<string | null> {
  const shell = createDialog({ title: `Remove ${shelf.name}?`, size: 'small' });
  let answer: string | null = null;
  let choice: HTMLSelectElement | null = null;

  if (count === 0) {
    shell.body.appendChild(make('p', 'bb-dialog__text', 'This shelf has no links.'));
  } else if (others.length === 1) {
    shell.body.appendChild(make('p', 'bb-dialog__text', `Its ${linkCount(count)} will move to ${others[0]?.name}.`));
  } else {
    shell.body.appendChild(make('p', 'bb-dialog__text', `Its ${linkCount(count)} will move to the shelf you choose. Nothing is deleted.`));
    const label = make('label', 'bb-field');
    label.appendChild(make('span', 'bb-label', 'Move its links to'));
    choice = make('select');
    choice.append(...others.map((entry) => option(entry.id, entry.name)));
    label.appendChild(choice);
    shell.body.appendChild(label);
  }

  const cancel = button('Keep shelf', 'bb-button', () => shell.close());
  const confirm = button('Remove shelf', 'bb-button bb-button--solid', () => {
    answer = choice?.value ?? others[0]?.id ?? null;
    shell.close();
  });
  shell.actions.append(cancel, confirm);
  shell.open(cancel);
  return shell.closed.then(() => answer);
}

export async function removeShelfFlow(context: FlowContext, shelfId: string): Promise<void> {
  const { store, bookshelf } = context;
  const shelf = store.shelves().find((entry) => entry.id === shelfId);
  if (!shelf) return;
  const others = store.shelves().filter((entry) => entry.id !== shelfId);
  if (others.length === 0) {
    toast('The last shelf cannot be removed.');
    return;
  }
  const count = store.bookmarks(shelfId).length;
  const destination = await askDestination(shelf, others, count);
  if (destination === null) return;

  const before = store.snapshot();
  const moved = before.bookmarks.filter((bookmark) => bookmark.shelfId === shelfId);
  const wasOpen = store.session().shelfId === shelfId;
  const result = store.removeShelf(shelfId, destination);
  if (!result.ok) {
    toast(result.error.message);
    return;
  }
  if (wasOpen) bookshelf.setShelf(null);
  const target = store.shelves().find((entry) => entry.id === destination)?.name ?? 'another shelf';
  const message = count === 0 ? `Removed ${shelf.name}.` : `Removed ${shelf.name}. ${linkCount(count)} moved to ${target}.`;
  const undo = undoerFor(store, { before, removed: [], shelves: [shelf], moved });
  toast(message, {
    label: 'Undo',
    run: () => {
      undo();
      context.refresh();
    },
  });
  context.refresh();
}

const LANGUAGES: ReadonlyArray<[string, string]> = [
  ['en', 'English'],
  ['de', 'German'],
  ['fr', 'French'],
  ['es', 'Spanish'],
  ['it', 'Italian'],
  ['pt', 'Portuguese'],
  ['nl', 'Dutch'],
  ['tr', 'Turkish'],
  ['ar', 'Arabic'],
];

/** Lets the person say what a shelf is for, who put it together, which language it is in and when it is due. */
export function describeShelfFlow(context: FlowContext, shelfId: string): void {
  const { store } = context;
  const shelf = store.shelves().find((entry) => entry.id === shelfId);
  if (!shelf) return;

  const description = make('textarea');
  description.rows = 4;
  description.maxLength = 500;
  description.value = shelf.description ?? '';

  const author = make('input');
  author.type = 'text';
  author.maxLength = 80;
  author.autocomplete = 'name';
  author.value = shelf.author ?? '';

  const lang = make('input');
  lang.type = 'text';
  lang.maxLength = 12;
  lang.setAttribute('list', 'flow-languages');
  lang.setAttribute('autocapitalize', 'off');
  lang.spellcheck = false;
  lang.value = shelf.lang ?? '';
  const choices = make('datalist');
  choices.id = 'flow-languages';
  for (const [code, name] of LANGUAGES) choices.appendChild(option(code, name));

  const due = make('input');
  due.type = 'date';
  due.value = shelf.due ?? '';

  const fields: Record<string, HTMLElement> = { description, author, lang, due };
  const start = JSON.stringify([description.value, author.value, lang.value, due.value]);
  const shell = createDialog({
    title: `About ${shelf.name}`,
    isDirty: () => JSON.stringify([description.value, author.value, lang.value, due.value]) !== start,
  });
  shell.body.append(
    buildField(description, {
      label: 'What this shelf is for',
      name: 'description',
      hint: 'Anyone you share the shelf with sees this first.',
    }),
    buildField(author, {
      label: 'Your name',
      name: 'author',
      hint: 'Shown to others as you write it. Leave it empty to share without a name.',
    }),
    buildField(lang, {
      label: 'Language of the texts',
      name: 'lang',
      hint: 'A code such as en or de. The reader uses it for word breaks and dates.',
    }),
    choices,
    buildField(due, {
      label: 'Due date',
      name: 'due',
      hint: 'Optional. It appears in the summary a student hands in.',
    }),
  );

  const cancel = button('Cancel', 'bb-button', () => shell.close());
  const save = make('button', 'bb-button bb-button--solid', 'Save');
  save.type = 'submit';
  shell.actions.append(cancel, save);

  shell.form.addEventListener('submit', (event) => {
    event.preventDefault();
    for (const control of Object.values(fields)) setFieldError(control, null);
    const result = store.updateShelf(shelfId, {
      description: description.value.trim(),
      author: author.value.trim(),
      lang: lang.value.trim(),
      due: due.value,
    });
    if (!result.ok) {
      const target = (result.error.field ? fields[result.error.field] : undefined) ?? description;
      setFieldError(target, result.error.message);
      target.focus();
      return;
    }
    shell.close();
    context.refresh();
  });
  shell.open(description);
}

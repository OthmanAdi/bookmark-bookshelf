import type { Shelf } from '../store';
import { button, make, option, toast } from './dom';
import { createDialog } from './flow-dialog';
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

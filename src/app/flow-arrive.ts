import type { ShelfFileRead, ShelfFileSummary } from '../store/shelf-file';
import { summariseShelfFile } from '../store/shelf-file';
import { decodeShelfLink } from '../store/shelf-link';
import { shelfStats } from '../store/stats';
import { formatMinutes } from '../store/reading-time';
import { button, make, toast } from './dom';
import { createDialog } from './flow-dialog';
import type { FlowContext } from './flows';

/**
 * A shelf that arrives from outside, as a file or as a link. Everything in it is shown as plain text and
 * nothing is added until the person says so. What arrives becomes one new shelf; nothing already saved is
 * changed and nothing personal comes with it.
 */

const SHOWN_HOSTS = 8;

const DUE_OPTIONS: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

function dueText(due: string, lang: string | undefined): string {
  const date = new Date(`${due}T12:00:00`);
  if (Number.isNaN(date.getTime())) return due;
  try {
    if (!lang || /^en(?:-|$)/i.test(lang)) {
      // English reads day first, as the reader and the line under the row write a date: "20 Nov 2026".
      const parts = new Intl.DateTimeFormat('en-US', DUE_OPTIONS).formatToParts(date);
      const part = (type: string): string => parts.find((entry) => entry.type === type)?.value ?? '';
      return `${part('day')} ${part('month')} ${part('year')}`;
    }
    return date.toLocaleDateString(lang, DUE_OPTIONS);
  } catch {
    return due;
  }
}

/** The one line of counts: `6 links, 4 required, about 50 min, due 20 Nov 2026`. */
export function countsLine(summary: ShelfFileSummary, lang?: string): string {
  const parts = [summary.volumes === 1 ? '1 link' : `${summary.volumes} links`];
  if (summary.required < summary.volumes) parts.push(`${summary.required} required`);
  if (summary.minutes !== undefined) parts.push(formatMinutes(summary.minutes));
  if (summary.due) parts.push(`due ${dueText(summary.due, lang)}`);
  return parts.join(', ');
}

export function hostsLine(hosts: readonly string[]): string {
  if (hosts.length === 0) return '';
  const shown = hosts.slice(0, SHOWN_HOSTS).join(', ');
  const more = hosts.length - SHOWN_HOSTS;
  return more > 0 ? `${shown}, and ${more} more` : shown;
}

/** Shows what arrived and asks. Resolves true when the person adds it as a new shelf. */
function askToReceive(read: ShelfFileRead): Promise<boolean> {
  const summary = summariseShelfFile(read.file);
  const shell = createDialog({ title: 'A shelf has arrived', size: 'medium' });
  let accepted = false;

  const name = make('h3', 'bb-arrive__name', summary.name);
  const sender = make('p', 'bb-arrive__sender', summary.author ? `From ${summary.author}, as written in the file. This is not verified.` : 'No sender is named in the file.');
  shell.body.append(name, sender);
  if (summary.description) shell.body.appendChild(make('p', 'bb-dialog__text', summary.description));
  shell.body.appendChild(make('p', 'bb-arrive__counts', countsLine(summary, read.file.shelf.lang)));

  if (summary.firstTitles.length > 0) {
    const titles = make('ol', 'bb-arrive__titles');
    for (const title of summary.firstTitles) titles.appendChild(make('li', '', title));
    shell.body.append(make('p', 'bb-arrive__label', summary.volumes > summary.firstTitles.length ? 'The first few links' : 'The links'), titles);
  }
  if (summary.hosts.length > 0) {
    shell.body.append(make('p', 'bb-arrive__label', 'The links go to'), make('p', 'bb-arrive__hosts', hostsLine(summary.hosts)));
  }
  if (read.skipped.length > 0) {
    const count = read.skipped.length;
    shell.body.appendChild(make('p', 'bb-arrive__skipped', `${count === 1 ? '1 entry' : `${count} entries`} in the file could not be used and will be left out.`));
  }
  shell.body.appendChild(make('p', 'bb-field__hint', 'It is added as a new shelf. Nothing of yours is changed, and nothing from the sender’s own reading comes with it.'));

  const cancel = button('Cancel', 'bb-button', () => shell.close());
  const add = button('Add as a new shelf', 'bb-button bb-button--solid', () => {
    accepted = true;
    shell.close();
  });
  shell.actions.append(cancel, add);
  shell.open(cancel);
  return shell.closed.then(() => accepted);
}

/** A short message that needs an acknowledgement, for something the person must read rather than glance at. */
export function showNotice(title: string, message: string): Promise<void> {
  const shell = createDialog({ title, size: 'small' });
  shell.body.appendChild(make('p', 'bb-dialog__text', message));
  const ok = button('OK', 'bb-button bb-button--solid', () => shell.close());
  shell.actions.appendChild(ok);
  shell.open(ok);
  return shell.closed;
}

/**
 * Previews a shelf that arrived and, when the person agrees, adds it, switches to it and brings the link to
 * read next to the centre. Returns whether the shelf was added.
 */
export async function receiveShelf(context: FlowContext, read: ShelfFileRead): Promise<boolean> {
  const { store, bookshelf } = context;
  if (!(await askToReceive(read))) return false;
  const result = store.importShelf(read.file);
  if (!result.ok) {
    toast(result.error.message);
    return false;
  }
  bookshelf.setShelf(result.value.shelfId);
  context.refresh();
  const links = store.bookmarks(result.value.shelfId);
  const next = shelfStats(links, { percentOf: (id) => store.progress(id)?.percent ?? 0, isDone: (id) => store.isDone(id) }).next;
  const first = next?.id ?? links[0]?.id;
  if (first) bookshelf.show(first, { immediate: true });
  toast('Added as a new shelf. Nothing of yours was changed.');
  return true;
}

/** The sentence shown when a shelf link cannot be opened. */
export function linkProblem(error: { code: string; message: string }): string {
  if (error.code === 'link-unsupported') return 'This browser cannot open shelf links. Ask for the shelf file.';
  return error.message;
}

/** Opens a shelf link's fragment: decodes it, then previews it. A link that cannot be read says so in words. */
export async function receiveFromLink(context: FlowContext, fragment: string): Promise<void> {
  const read = await decodeShelfLink(fragment);
  if (!read.ok) {
    await showNotice('This shelf link cannot be opened', linkProblem(read.error));
    return;
  }
  await receiveShelf(context, read.value);
}

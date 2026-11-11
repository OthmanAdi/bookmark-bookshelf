import { formatShelfStatus, shelfStats, type ShelfStats, type StatsVolume } from '../store/stats';

/**
 * The quiet line under the tabs for an open shelf: how much is read, how long is left, and what to read
 * next. The title after "Next:" is a button that brings that link to the centre.
 */

export interface StatusContext {
  percentOf(id: string): number;
  isDone(id: string): boolean;
}

export interface StatusLine {
  /** Everything before "Next:", or the whole line when there is nothing next. */
  text: string;
  next?: { id: string; title: string };
}

export function statusLine(volumes: readonly StatsVolume[], context: StatusContext): StatusLine {
  const stats: ShelfStats = shelfStats(volumes, context);
  const { next, ...rest } = stats;
  const text = formatShelfStatus(rest);
  return next ? { text, next: { id: next.id, title: next.title } } : { text };
}

/** The line shown while any of the bundled examples remain, followed by its Remove examples button. */
export function examplesSentence(count: number): string {
  return count === 1
    ? 'This link is an example. Add your own, or remove it.'
    : `These ${count} links are examples. Add your own, or remove the examples.`;
}

/** Where to stand when a shelf is opened: the first link still to read, required ones first. */
export function firstToRead(volumes: readonly StatsVolume[], context: StatusContext): string | undefined {
  return shelfStats(volumes, context).next?.id;
}

export function renderStatus(host: HTMLElement, line: StatusLine | null, onNext: (id: string) => void): void {
  if (!line) {
    host.hidden = true;
    host.replaceChildren();
    return;
  }
  const nodes: Node[] = [document.createTextNode(line.text)];
  if (line.next) {
    const { id, title } = line.next;
    nodes.push(document.createTextNode(' Next: '));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bb-app__next';
    button.textContent = title;
    button.addEventListener('click', () => onNext(id));
    nodes.push(button);
  }
  // Keep the button that has focus when the words around it change, so focus is not dropped.
  const focused = host.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
  host.replaceChildren(...nodes);
  host.hidden = false;
  if (focused && !focused.isConnected) host.querySelector<HTMLElement>('.bb-app__next')?.focus({ preventScroll: true });
}

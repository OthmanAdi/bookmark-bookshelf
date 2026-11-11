/**
 * The caption under the row: arrows beside the title, one line about the link, and the actions for it.
 * The elements are written once in the page and never rebuilt, so a control that has focus keeps it
 * while the row moves; only words, links and states change in place.
 */

export type PrimaryKind = 'read' | 'resume' | 'again' | 'add-text';

/** What the caption needs to know about the link in the centre. */
export interface LinkView {
  id: string;
  title: string;
  url: string;
  note?: string;
  /** ISO time the link was saved. */
  addedAt: string;
  hasText: boolean;
  /** Reading position, 0 to 1. */
  percent: number;
  done: boolean;
  minutes?: number;
}

/** Where the centred link stands, which decides what the arrows and the move buttons can do. */
export interface StagePlace {
  /** True on a row with two ends when the first link is in the centre. */
  atStart: boolean;
  atEnd: boolean;
  /** Moving is offered only on a single shelf in its own order. */
  canMove: boolean;
  /** The link is the first or the last of its shelf, so it cannot move further that way. */
  first: boolean;
  last: boolean;
}

export interface StageElements {
  root: HTMLElement;
  title: HTMLElement;
  line: HTMLElement;
  previous: HTMLButtonElement;
  next: HTMLButtonElement;
  primary: HTMLButtonElement;
  original: HTMLAnchorElement;
  edit: HTMLButtonElement;
  earlier: HTMLButtonElement;
  later: HTMLButtonElement;
}

export interface StageHandlers {
  step(direction: -1 | 1): void;
  primary(id: string, kind: PrimaryKind): void;
  edit(id: string): void;
  move(id: string, direction: -1 | 1): void;
}

export interface StageCaption {
  /** Shows a link, or nothing. With `swap` the words cross-fade; otherwise they change at once. */
  show(link: LinkView | null, options?: { swap?: boolean }): void;
  setPlace(place: StagePlace): void;
  destroy(): void;
}

/** The one action a link offers first, in the words used everywhere a link appears. */
export function primaryAction(link: Pick<LinkView, 'hasText' | 'percent' | 'done'>): { kind: PrimaryKind; label: string } {
  if (!link.hasText) return { kind: 'add-text', label: 'Add text' };
  const percent = Math.round(Math.min(1, Math.max(0, Number.isFinite(link.percent) ? link.percent : 0)) * 100);
  if (link.done || percent >= 100) return { kind: 'again', label: 'Read again' };
  if (percent > 0) return { kind: 'resume', label: `Resume at ${percent}%` };
  return { kind: 'read', label: 'Read' };
}

// Spelled out rather than taken from Intl, whose short month names differ between engines ("Sep", "Sept").
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "14 Sep", with the year when it is not the current one. Empty for a date that cannot be read. */
export function savedOn(iso: string, now: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? day : `${day} ${date.getFullYear()}`;
}

/** The line under the title: the person's own note when there is one, otherwise when it was saved and how long it is. */
export function captionLine(link: Pick<LinkView, 'note' | 'addedAt' | 'minutes'>, now: Date): { text: string; isNote: boolean } {
  const note = (link.note ?? '').replace(/\s+/g, ' ').trim();
  if (note) return { text: note, isNote: true };
  const saved = savedOn(link.addedAt, now);
  const parts: string[] = [];
  if (saved) parts.push(`Saved ${saved}`);
  if (link.minutes && link.minutes > 0) parts.push(`${link.minutes} min`);
  return { text: parts.join(', '), isNote: false };
}

/** Matches the fade-out in app.css: the old words leave before the new ones come in. */
const LEAVE_MS = 90;

export function createStageCaption(
  elements: StageElements,
  handlers: StageHandlers,
  options: { reduced?: () => boolean; now?: () => Date } = {},
): StageCaption {
  const { root, title, line, previous, next, primary, original, edit, earlier, later } = elements;
  const reduced = options.reduced ?? (() => false);
  const now = options.now ?? (() => new Date());
  let current: LinkView | null = null;
  let kind: PrimaryKind = 'read';
  let pending: LinkView | null | undefined;
  let leaving: ReturnType<typeof setTimeout> | null = null;
  let place: StagePlace = { atStart: false, atEnd: false, canMove: false, first: false, last: false };

  function apply(link: LinkView | null): void {
    current = link;
    root.dataset.empty = link ? '0' : '1';
    if (!link) {
      title.textContent = '';
      line.textContent = '';
      return;
    }
    title.textContent = link.title;
    const words = captionLine(link, now());
    line.textContent = words.text;
    line.classList.toggle('is-note', words.isNote);
    const action = primaryAction(link);
    kind = action.kind;
    if (primary.textContent !== action.label) primary.textContent = action.label;
    original.href = link.url;
  }

  function cancelLeave(): void {
    if (leaving !== null) clearTimeout(leaving);
    leaving = null;
    root.classList.remove('is-leaving');
  }

  function bump(button: HTMLButtonElement): void {
    if (reduced()) return;
    button.classList.remove('is-bumping');
    // Restart the animation when the end is pressed again before the last one finished.
    void button.offsetWidth;
    button.classList.add('is-bumping');
  }

  const onAnimationEnd = (event: AnimationEvent): void => {
    (event.target as HTMLElement).classList.remove('is-bumping');
  };

  const onPrevious = (): void => {
    if (place.atStart) bump(previous);
    handlers.step(-1);
  };
  const onNext = (): void => {
    if (place.atEnd) bump(next);
    handlers.step(1);
  };
  const onPrimary = (): void => {
    if (current) handlers.primary(current.id, kind);
  };
  const onEdit = (): void => {
    if (current) handlers.edit(current.id);
  };
  const onEarlier = (): void => {
    if (current && earlier.getAttribute('aria-disabled') !== 'true') handlers.move(current.id, -1);
  };
  const onLater = (): void => {
    if (current && later.getAttribute('aria-disabled') !== 'true') handlers.move(current.id, 1);
  };

  previous.addEventListener('click', onPrevious);
  next.addEventListener('click', onNext);
  previous.addEventListener('animationend', onAnimationEnd);
  next.addEventListener('animationend', onAnimationEnd);
  primary.addEventListener('click', onPrimary);
  edit.addEventListener('click', onEdit);
  earlier.addEventListener('click', onEarlier);
  later.addEventListener('click', onLater);

  return {
    show(link, showOptions = {}) {
      if (!showOptions.swap || reduced()) {
        cancelLeave();
        pending = undefined;
        apply(link);
        return;
      }
      // Fast changes while the old words fade out only replace what comes in next.
      pending = link;
      if (leaving !== null) return;
      root.classList.add('is-leaving');
      leaving = setTimeout(() => {
        leaving = null;
        if (pending !== undefined) apply(pending);
        pending = undefined;
        root.classList.remove('is-leaving');
      }, LEAVE_MS);
    },
    setPlace(nextPlace) {
      place = nextPlace;
      previous.dataset.end = String(nextPlace.atStart);
      next.dataset.end = String(nextPlace.atEnd);
      // A move button that is focused stays in place and only says it cannot go further, so focus is never lost.
      const focused = document.activeElement;
      for (const button of [earlier, later]) {
        const show = nextPlace.canMove;
        if (!show && focused === button) edit.focus({ preventScroll: true });
        button.hidden = !show;
      }
      earlier.setAttribute('aria-disabled', String(nextPlace.first));
      later.setAttribute('aria-disabled', String(nextPlace.last));
    },
    destroy() {
      cancelLeave();
      previous.removeEventListener('click', onPrevious);
      next.removeEventListener('click', onNext);
      previous.removeEventListener('animationend', onAnimationEnd);
      next.removeEventListener('animationend', onAnimationEnd);
      primary.removeEventListener('click', onPrimary);
      edit.removeEventListener('click', onEdit);
      earlier.removeEventListener('click', onEarlier);
      later.removeEventListener('click', onLater);
    },
  };
}

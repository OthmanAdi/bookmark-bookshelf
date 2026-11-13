import type { ShowcaseItem } from './types';

/**
 * What is known about the book in view, beside it: where it stands in the row, its title, where it comes
 * from, the person's note, the tags, how long it is and how far the reading has got, then the three
 * actions. The elements are built once and only their words change, so a button that has focus keeps it
 * while the books move past.
 */

export interface DetailsHandlers {
  /** The book before or after was asked for with a button. */
  step(by: -1 | 1): void;
  primary(): void;
  original(): void;
  edit(): void;
}

export interface Details {
  readonly element: HTMLElement;
  readonly primary: HTMLButtonElement;
  /** Shows a book. With `swap` the words leave and come back from the side the books move to. */
  show(item: ShowcaseItem | null, place: { index: number; count: number }, options?: { swap?: -1 | 1 }): void;
  destroy(): void;
}

/** The old words take this long to leave before the new ones are written. Matches showcase.css. */
export const SWAP_MS = 110;

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  return element;
}

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

const SVG_NS = 'http://www.w3.org/2000/svg';

function arrow(label: string, path: string): HTMLButtonElement {
  const button = make('button', 'bb-button bb-button--quiet bb-showcase__step');
  button.type = 'button';
  button.setAttribute('aria-label', label);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS(SVG_NS, 'path');
  line.setAttribute('d', path);
  svg.appendChild(line);
  button.appendChild(svg);
  return button;
}

export function createDetails(handlers: DetailsHandlers, ids: { title: string }): Details {
  const element = make('div', 'bb-showcase__details');
  const words = make('div', 'bb-showcase__words');

  // Previous and next as buttons: whoever cannot swipe, scroll or use the keys still gets from book to book.
  const pager = make('div', 'bb-showcase__pager');
  const previous = arrow('Previous book', 'M4 10 8 6l4 4');
  const next = arrow('Next book', 'm4 6 4 4 4-4');
  const place = make('p', 'bb-showcase__place');
  pager.append(previous, place, next);
  const title = make('h2', 'bb-showcase__title');
  title.id = ids.title;
  const byline = make('p', 'bb-showcase__byline');
  const note = make('p', 'bb-showcase__note');
  const facts = make('p', 'bb-showcase__facts');
  const meter = make('div', 'bb-showcase__meter');
  const fill = make('span', 'bb-showcase__meter-fill');
  meter.setAttribute('aria-hidden', 'true');
  meter.appendChild(fill);
  const tags = make('ul', 'bb-showcase__tags');
  tags.setAttribute('aria-label', 'Tags');
  words.append(title, byline, note, facts, meter, tags);

  const actions = make('div', 'bb-showcase__actions');
  const primary = make('button', 'bb-button bb-button--solid');
  primary.type = 'button';
  primary.dataset.part = 'primary';
  primary.setAttribute('aria-describedby', ids.title);
  const original = make('a', 'bb-button');
  original.target = '_blank';
  original.rel = 'noopener noreferrer';
  original.textContent = 'Open original';
  original.dataset.part = 'original';
  original.setAttribute('aria-label', 'Open original, opens in a new tab');
  original.setAttribute('aria-describedby', ids.title);
  const edit = make('button', 'bb-button bb-button--quiet');
  edit.type = 'button';
  edit.textContent = 'Edit';
  edit.dataset.part = 'edit';
  edit.setAttribute('aria-describedby', ids.title);
  actions.append(primary, original, edit);
  element.append(pager, words, actions);

  const onPrevious = (): void => handlers.step(-1);
  const onNext = (): void => handlers.step(1);
  previous.addEventListener('click', onPrevious);
  next.addEventListener('click', onNext);
  primary.addEventListener('click', handlers.primary);
  original.addEventListener('click', handlers.original);
  edit.addEventListener('click', handlers.edit);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: (() => void) | null = null;

  function write(item: ShowcaseItem | null, at: { index: number; count: number }): void {
    element.dataset.empty = item ? '0' : '1';
    if (!item) return;
    const { book } = item;
    const width = at.count > 99 ? 3 : 2;
    place.textContent = `${pad(at.index + 1, width)} / ${pad(at.count, width)}`;
    place.setAttribute('aria-label', `${at.index + 1} of ${at.count}`);
    // At an end the button stays where it is and says so: focus is never lost to a button that went away.
    previous.setAttribute('aria-disabled', String(at.index <= 0));
    next.setAttribute('aria-disabled', String(at.index >= at.count - 1));
    title.textContent = book.title;
    if (book.lang) title.lang = book.lang;
    else title.removeAttribute('lang');
    const from = [book.author, book.source, item.shelf].filter((part): part is string => Boolean(part));
    byline.textContent = from.join(' · ');
    byline.hidden = from.length === 0;
    const text = (book.note ?? '').replace(/\s+/g, ' ').trim();
    note.textContent = text;
    note.hidden = text === '';
    facts.textContent = [item.state, item.minutes, item.saved].filter((part): part is string => Boolean(part)).join(' · ');
    const percent = book.done ? 1 : Math.min(1, Math.max(0, book.progress ?? 0));
    meter.hidden = percent <= 0;
    fill.style.inlineSize = `${Math.round(percent * 100)}%`;
    tags.replaceChildren(
      ...item.tags.map((tag) => {
        const entry = make('li', 'bb-showcase__tag');
        entry.textContent = tag;
        return entry;
      }),
    );
    tags.hidden = item.tags.length === 0;
    if (primary.textContent !== item.action) primary.textContent = item.action;
    original.href = item.url;
  }

  return {
    element,
    primary,
    show(item, at, options = {}) {
      if (!options.swap) {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        pending = null;
        words.classList.remove('is-leaving');
        write(item, at);
        return;
      }
      // Books passing quickly only replace what is written when the old words have left.
      pending = () => write(item, at);
      words.style.setProperty('--bb-swap', String(options.swap));
      if (timer !== null) return;
      words.classList.add('is-leaving');
      timer = setTimeout(() => {
        timer = null;
        pending?.();
        pending = null;
        words.classList.remove('is-leaving');
      }, SWAP_MS);
    },
    destroy() {
      if (timer !== null) clearTimeout(timer);
      previous.removeEventListener('click', onPrevious);
      next.removeEventListener('click', onNext);
      primary.removeEventListener('click', handlers.primary);
      original.removeEventListener('click', handlers.original);
      edit.removeEventListener('click', handlers.edit);
      element.remove();
    },
  };
}

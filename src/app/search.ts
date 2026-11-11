import { searchVolumes, type SearchableVolume } from '../store/search';

/**
 * Finding a link from the bar. Typing lists at most eight matches under the field; the arrow keys
 * move through them, Enter or a click chooses one, Escape closes the list and then leaves the field.
 * `/` anywhere outside a text field brings focus here.
 */

export interface SearchResult {
  id: string;
  title: string;
  shelf: string;
  host: string;
}

export const RESULT_LIMIT = 8;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** The best matches across every shelf, with the shelf and site each one is on. */
export function findLinks(
  links: ReadonlyArray<SearchableVolume & { shelfId: string }>,
  shelfNames: ReadonlyMap<string, string>,
  query: string,
  limit = RESULT_LIMIT,
): SearchResult[] {
  const byId = new Map(links.map((link) => [link.id, link]));
  // The saved text counts too: a word a person remembers from the page finds the link.
  return searchVolumes(links, query, { limit, includeText: true }).flatMap((hit) => {
    const link = byId.get(hit.id);
    if (!link) return [];
    return [{ id: link.id, title: link.title, shelf: shelfNames.get(link.shelfId) ?? '', host: hostOf(link.url) }];
  });
}

export function resultsSentence(count: number): string {
  if (count === 0) return 'No links match.';
  return count === 1 ? '1 link found.' : `${count} links found.`;
}

export interface SearchElements {
  input: HTMLInputElement;
  popup: HTMLElement;
  list: HTMLElement;
  empty: HTMLElement;
  status: HTMLElement;
}

export interface SearchHandlers {
  find(query: string): SearchResult[];
  choose(id: string): void;
  /** Where focus goes when the person leaves the field with Escape. */
  leave(): void;
}

export interface Search {
  focus(): void;
  destroy(): void;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches('input, textarea, select');
}

export function createSearch(elements: SearchElements, handlers: SearchHandlers): Search {
  const { input, popup, list, empty, status } = elements;
  const prefix = list.id || 'search-results';
  let results: SearchResult[] = [];
  let active = -1;

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', prefix);
  list.setAttribute('role', 'listbox');
  popup.hidden = true;

  function setActive(index: number): void {
    active = index;
    const options = list.children;
    for (let i = 0; i < options.length; i++) options[i]!.setAttribute('aria-selected', String(i === index));
    const current = index >= 0 ? options[index] : undefined;
    if (current) {
      input.setAttribute('aria-activedescendant', current.id);
      (current as HTMLElement).scrollIntoView?.({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function close(): void {
    popup.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    setActive(-1);
  }

  function option(result: SearchResult, index: number): HTMLElement {
    const item = document.createElement('li');
    item.id = `${prefix}-${index}`;
    item.className = 'bb-search__option';
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', 'false');
    const title = document.createElement('span');
    title.className = 'bb-search__title';
    title.textContent = result.title;
    const where = document.createElement('span');
    where.className = 'bb-search__where';
    for (const part of [result.shelf, result.host]) {
      if (!part) continue;
      const span = document.createElement('span');
      span.textContent = part;
      where.appendChild(span);
    }
    item.append(title, where);
    // Keep focus in the field while the pointer chooses, so the list does not close under it.
    item.addEventListener('pointerdown', (event) => event.preventDefault());
    item.addEventListener('click', () => choose(index));
    return item;
  }

  function update(): void {
    const query = input.value.trim();
    if (!query) {
      results = [];
      list.replaceChildren();
      status.textContent = '';
      close();
      return;
    }
    results = handlers.find(query);
    list.replaceChildren(...results.map(option));
    empty.hidden = results.length > 0;
    if (results.length === 0) empty.textContent = `No links match “${query}”.`;
    status.textContent = resultsSentence(results.length);
    popup.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(results.length > 0 ? 0 : -1);
  }

  function choose(index: number): void {
    const result = results[index];
    if (!result) return;
    input.value = '';
    results = [];
    list.replaceChildren();
    status.textContent = '';
    close();
    handlers.choose(result.id);
  }

  const onInput = (): void => update();

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (popup.hidden) {
        if (input.value.trim()) update();
        event.preventDefault();
        return;
      }
      if (results.length === 0) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((active + step + results.length) % results.length);
    } else if (event.key === 'Enter') {
      if (popup.hidden || active < 0) return;
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (!popup.hidden) {
        close();
        return;
      }
      input.value = '';
      status.textContent = '';
      handlers.leave();
    }
  };

  const onBlur = (): void => close();

  const onFocus = (): void => {
    if (input.value.trim()) update();
  };

  const onShortcut = (event: KeyboardEvent): void => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTyping(event.target) || document.querySelector('dialog[open]')) return;
    if (input.closest('[inert]') || input.getClientRects().length === 0) return;
    event.preventDefault();
    input.focus();
  };

  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKeyDown);
  input.addEventListener('blur', onBlur);
  input.addEventListener('focus', onFocus);
  document.addEventListener('keydown', onShortcut);

  return {
    focus: () => input.focus(),
    destroy() {
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onKeyDown);
      input.removeEventListener('blur', onBlur);
      input.removeEventListener('focus', onFocus);
      document.removeEventListener('keydown', onShortcut);
    },
  };
}

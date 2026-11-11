import { describe, expect, it } from 'vitest';
import { createPhoneLayout, type PhoneElements } from './shell-phone';

function fakeQuery(matches: boolean) {
  const listeners = new Set<() => void>();
  return {
    matches,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    set(next: boolean) {
      this.matches = next;
      for (const listener of listeners) listener();
    },
  };
}

function setup(): PhoneElements {
  document.body.replaceChildren();
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement = document.body): HTMLElementTagNameMap[K] => {
    const element = document.createElement(tag);
    parent.appendChild(element);
    return element;
  };
  const tools = make('div');
  const searchBox = make('div', tools);
  const searchToggle = make('button', searchBox);
  const searchInput = make('input', searchBox);
  const view = make('div', tools);
  const viewButton = make('button', view);
  viewButton.id = 'view-button';
  const viewPanel = make('div', view);
  const viewAnchor = make('div', tools);
  const add = make('button', tools);
  const dock = make('div');
  return { tools, viewAnchor, view, viewPanel, add, dock, searchBox, searchToggle, searchInput };
}

describe('createPhoneLayout', () => {
  it('moves View and Add a link to the dock on a phone and back on a wide screen, keeping focus', () => {
    const elements = setup();
    const query = fakeQuery(true);
    createPhoneLayout(elements, query as unknown as MediaQueryList);
    expect(elements.view.parentElement).toBe(elements.dock);
    expect(elements.add.parentElement).toBe(elements.dock);
    expect(elements.viewPanel.dataset.side).toBe('top');

    elements.add.focus();
    query.set(false);
    expect([...elements.tools.children]).toEqual([elements.searchBox, elements.view, elements.viewAnchor, elements.add]);
    expect(elements.viewPanel.dataset.side).toBeUndefined();
    expect(document.activeElement).toBe(elements.add);
  });

  it('opens the search field from its icon and folds it back', () => {
    const elements = setup();
    const layout = createPhoneLayout(elements, fakeQuery(true) as unknown as MediaQueryList);
    elements.searchToggle.click();
    expect(elements.searchBox.dataset.open).toBe('');
    expect(elements.searchToggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(elements.searchInput);
    layout.closeSearch(true);
    expect(elements.searchBox.dataset.open).toBeUndefined();
    expect(document.activeElement).toBe(elements.searchToggle);
  });

  it('folds an empty field away when focus leaves it, but keeps one with words', () => {
    const elements = setup();
    createPhoneLayout(elements, fakeQuery(true) as unknown as MediaQueryList);
    elements.searchToggle.click();
    elements.searchInput.value = 'rot';
    elements.searchInput.dispatchEvent(new Event('blur'));
    expect(elements.searchBox.dataset.open).toBe('');
    elements.searchInput.value = '';
    elements.searchInput.dispatchEvent(new Event('blur'));
    expect(elements.searchBox.dataset.open).toBeUndefined();
  });
});

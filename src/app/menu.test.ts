import { describe, expect, it, vi } from 'vitest';
import { createMenu } from './menu';
import { renderChoices, renderViewMenu } from './shell-view-menu';

function setup() {
  document.body.replaceChildren();
  const button = document.createElement('button');
  button.textContent = 'Library';
  const panel = document.createElement('div');
  panel.id = 'library-menu';
  const items = ['One', 'Two', 'Three'].map((label) => {
    const item = document.createElement('button');
    item.textContent = label;
    panel.appendChild(item);
    return item;
  });
  const outside = document.createElement('button');
  document.body.append(button, panel, outside);
  return { button, panel, items, outside };
}

const key = (target: Element, name: string): void => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
};

describe('createMenu', () => {
  it('starts closed and opens on the button with focus on the first item', () => {
    const { button, panel, items } = setup();
    createMenu({ button, panel });
    expect(panel.hidden).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe('library-menu');
    button.click();
    expect(panel.hidden).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(items[0]);
  });

  it('moves with the arrow keys, Home and End, and wraps', () => {
    const { button, panel, items } = setup();
    createMenu({ button, panel });
    button.click();
    key(items[0]!, 'ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    key(items[1]!, 'End');
    expect(document.activeElement).toBe(items[2]);
    key(items[2]!, 'ArrowDown');
    expect(document.activeElement).toBe(items[0]);
    key(items[0]!, 'ArrowUp');
    expect(document.activeElement).toBe(items[2]);
    key(items[2]!, 'Home');
    expect(document.activeElement).toBe(items[0]);
  });

  it('skips hidden items', () => {
    const { button, panel, items } = setup();
    items[1]!.hidden = true;
    createMenu({ button, panel });
    button.click();
    key(items[0]!, 'ArrowDown');
    expect(document.activeElement).toBe(items[2]);
  });

  it('closes on Escape and gives focus back to the button', () => {
    const { button, panel, items } = setup();
    createMenu({ button, panel });
    button.click();
    key(items[1]!, 'Escape');
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
  });

  it('opens from the button with the arrow keys', () => {
    const { button, panel, items } = setup();
    createMenu({ button, panel });
    key(button, 'ArrowUp');
    expect(panel.hidden).toBe(false);
    expect(document.activeElement).toBe(items[2]);
  });

  it('closes and returns focus before an item acts, so a dialog it opens returns focus to the button', () => {
    const { button, panel, items } = setup();
    createMenu({ button, panel });
    const seen: Array<{ hidden: boolean; focus: Element | null }> = [];
    items[1]!.addEventListener('click', () => seen.push({ hidden: panel.hidden === true, focus: document.activeElement }));
    button.click();
    items[1]!.click();
    expect(seen).toEqual([{ hidden: true, focus: button }]);
  });

  it('closes on a press outside without moving focus there', () => {
    const { button, panel, outside } = setup();
    createMenu({ button, panel });
    button.click();
    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(panel.hidden).toBe(true);
  });

  it('keeps one menu open at a time', () => {
    const first = setup();
    const second = { button: document.createElement('button'), panel: document.createElement('div') };
    second.panel.appendChild(document.createElement('button'));
    document.body.append(second.button, second.panel);
    createMenu(first);
    createMenu(second);
    first.button.click();
    second.button.click();
    expect(first.panel.hidden).toBe(true);
    expect(second.panel.hidden).toBe(false);
  });

  it('asks for the current state before it opens and focuses the checked item', () => {
    const { button, panel, items } = setup();
    const onOpen = vi.fn(() => items[2]!.setAttribute('aria-checked', 'true'));
    createMenu({ button, panel, onOpen });
    button.click();
    expect(onOpen).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(items[2]);
  });
});

describe('renderChoices', () => {
  it('fills a labelled group of single choices and marks the current one', () => {
    document.body.replaceChildren();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onChoose = vi.fn();
    const mark = renderChoices(
      host,
      'Sort by',
      [
        { value: 'manual', label: 'Shelf order' },
        { value: 'title', label: 'Title, A to Z' },
      ],
      onChoose,
    );
    mark('title');
    expect(host.getAttribute('aria-label')).toBe('Sort by');
    const items = [...host.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    expect(items.map((item) => item.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    items[0]!.click();
    expect(onChoose).toHaveBeenCalledWith('manual');
  });
});

describe('renderViewMenu', () => {
  const looks = [
    { name: 'paper', label: 'Paper Row', summary: 'A paper ground.' },
    { name: 'night', label: 'Night Study', summary: 'A dark ground.' },
  ];

  it('lists the two views and every look with its summary as the description', () => {
    document.body.replaceChildren();
    const panel = document.createElement('div');
    panel.id = 'view-menu';
    document.body.appendChild(panel);
    const menu = renderViewMenu({ panel, looks, onView: vi.fn(), onLook: vi.fn() });
    menu.update({ view: 'list', look: 'night' });
    const items = [...panel.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    expect(items.map((item) => item.querySelector('.bb-menu__label')?.textContent)).toEqual(['Shelf', 'List', 'Paper Row', 'Night Study']);
    expect(items.map((item) => item.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false', 'true']);
    const night = items[3]!;
    expect(document.getElementById(night.getAttribute('aria-describedby')!)?.textContent).toBe('A dark ground.');
  });

  it('acts only when an item is activated', () => {
    document.body.replaceChildren();
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    const onView = vi.fn();
    const onLook = vi.fn();
    renderViewMenu({ panel, looks, onView, onLook });
    const items = [...panel.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    items[3]!.focus();
    items[3]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(onLook).not.toHaveBeenCalled();
    items[3]!.click();
    items[0]!.click();
    expect(onLook).toHaveBeenCalledWith('night');
    expect(onView).toHaveBeenCalledWith('shelf');
  });
});

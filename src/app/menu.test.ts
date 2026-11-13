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

  it('lists the three views and every look with its summary as the description', () => {
    document.body.replaceChildren();
    const panel = document.createElement('div');
    panel.id = 'view-menu';
    document.body.appendChild(panel);
    const menu = renderViewMenu({ panel, looks, onView: vi.fn(), onLook: vi.fn() });
    menu.update({ view: 'list', look: 'night' });
    const items = [...panel.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    expect(items.map((item) => item.querySelector('.bb-menu__label')?.textContent)).toEqual(['Shelf', 'List', 'Showcase', 'Paper Row', 'Night Study']);
    expect(items.map((item) => item.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false', 'false', 'true']);
    const night = items[4]!;
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
    items[4]!.focus();
    items[4]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(onLook).not.toHaveBeenCalled();
    items[4]!.click();
    items[0]!.click();
    items[2]!.click();
    expect(onLook).toHaveBeenCalledWith('night');
    expect(onView).toHaveBeenCalledWith('shelf');
    expect(onView).toHaveBeenCalledWith('showcase');
  });
});

describe('renderViewMenu drawing', () => {
  const looks = [{ name: 'paper', label: 'Paper Row', summary: 'A paper ground.' }];
  const paints = [
    { name: 'classic', label: 'Classic', summary: 'CSS 3D, light and fast.' },
    { name: 'studio', label: 'Studio', summary: 'Lit materials, drawn with WebGL.' },
  ];

  function mount(onPaint = vi.fn()) {
    document.body.replaceChildren();
    const panel = document.createElement('div');
    panel.id = 'view-menu';
    document.body.appendChild(panel);
    const menu = renderViewMenu({ panel, looks, onView: vi.fn(), onLook: vi.fn(), paints, onPaint });
    const item = (name: string): HTMLElement => panel.querySelector<HTMLElement>(`[data-paint="${name}"]`)!;
    const description = (name: string): string | null | undefined =>
      document.getElementById(item(name).getAttribute('aria-describedby')!)?.textContent;
    return { panel, menu, item, description, onPaint };
  }

  it('has no Drawing group unless drawings are given', () => {
    document.body.replaceChildren();
    const panel = document.createElement('div');
    renderViewMenu({ panel, looks, onView: vi.fn(), onLook: vi.fn() });
    expect(panel.querySelector('[aria-label="Drawing"]')).toBeNull();
    expect(panel.querySelectorAll('[role="separator"]')).toHaveLength(1);
  });

  it('puts Classic and Studio first, in a group named Drawing, each with its summary', () => {
    const { panel, item, description } = mount();
    const groups = [...panel.querySelectorAll('[role="group"]')].map((group) => group.getAttribute('aria-label'));
    expect(groups).toEqual(['Drawing', 'View', 'Look']);
    const items = [...panel.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    expect(items.slice(0, 2).map((entry) => entry.dataset.paint)).toEqual(['classic', 'studio']);
    expect(item('classic').getAttribute('role')).toBe('menuitemradio');
    expect(item('studio').querySelector('.bb-menu__label')?.textContent).toBe('Studio');
    expect(description('classic')).toBe('CSS 3D, light and fast.');
    expect(description('studio')).toBe('Lit materials, drawn with WebGL.');
  });

  it('marks the current drawing, and Classic when none is stored', () => {
    const { menu, item } = mount();
    menu.update({ view: 'shelf', look: 'paper', paint: 'studio' });
    expect(item('studio').getAttribute('aria-checked')).toBe('true');
    expect(item('classic').getAttribute('aria-checked')).toBe('false');
    menu.update({ view: 'shelf', look: 'paper' });
    expect(item('classic').getAttribute('aria-checked')).toBe('true');
    expect(item('studio').getAttribute('aria-checked')).toBe('false');
  });

  it('chooses a drawing only when its item is activated', () => {
    const { menu, item, onPaint } = mount();
    menu.update({ view: 'shelf', look: 'paper' });
    item('studio').focus();
    item('studio').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(onPaint).not.toHaveBeenCalled();
    item('studio').click();
    expect(onPaint).toHaveBeenCalledWith('studio');
  });

  it('marks Studio unavailable with the reason as its description, and it does nothing', () => {
    const { menu, item, description, onPaint } = mount();
    menu.update({ view: 'shelf', look: 'paper', unavailable: { studio: 'Needs WebGL2.' } });
    expect(item('studio').getAttribute('aria-disabled')).toBe('true');
    expect(description('studio')).toBe('Needs WebGL2.');
    expect(item('studio').hasAttribute('data-keep-open')).toBe(true);
    expect(item('classic').hasAttribute('aria-disabled')).toBe(false);
    item('studio').click();
    expect(onPaint).not.toHaveBeenCalled();
  });

  it('keeps an unavailable item in reach of the arrow keys, and the menu open when it is clicked', () => {
    const { panel, menu, item } = mount();
    const button = document.createElement('button');
    document.body.prepend(button);
    createMenu({ button, panel, onOpen: () => menu.update({ view: 'shelf', look: 'paper', unavailable: { studio: 'Needs WebGL2.' } }) });
    button.click();
    item('classic').focus();
    key(item('classic'), 'ArrowDown');
    expect(document.activeElement).toBe(item('studio'));
    item('studio').click();
    expect(panel.hidden).toBe(false);
  });

  it('gives the summary back once the drawing is available again', () => {
    const { menu, item, description } = mount();
    menu.update({ view: 'shelf', look: 'paper', unavailable: { studio: 'Needs WebGL2.' } });
    menu.update({ view: 'shelf', look: 'paper' });
    expect(item('studio').hasAttribute('aria-disabled')).toBe(false);
    expect(description('studio')).toBe('Lit materials, drawn with WebGL.');
  });

  it('shows under the switch what the drawing in use is, or why Studio cannot be chosen', () => {
    const { panel, menu } = mount();
    const note = (): string | null | undefined => panel.querySelector('.bb-menu__switch-note')?.textContent;
    menu.update({ view: 'shelf', look: 'paper' });
    expect(note()).toBe('CSS 3D, light and fast.');
    menu.update({ view: 'shelf', look: 'paper', paint: 'studio' });
    expect(note()).toBe('Lit materials, drawn with WebGL.');
    menu.update({ view: 'shelf', look: 'paper', unavailable: { studio: 'Needs WebGL2.' } });
    expect(note()).toBe('Studio: Needs WebGL2.');
    // The same words reach a screen reader as each side's description, so the line itself is not read twice.
    expect(panel.querySelector('.bb-menu__switch-note')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('marks Studio busy and says it is being prepared until an update leaves that out', () => {
    const { panel, menu, item, description } = mount();
    menu.update({ view: 'shelf', look: 'paper', paint: 'studio', preparing: { studio: 'Preparing…' } });
    expect(item('studio').getAttribute('aria-busy')).toBe('true');
    expect(item('studio').getAttribute('aria-checked')).toBe('true');
    expect(description('studio')).toBe('Preparing…');
    expect(item('studio').querySelector('.bb-menu__label')?.textContent).toBe('Studio');
    expect(panel.querySelector('.bb-menu__switch-note')?.textContent).toBe('Studio: Preparing…');
    menu.update({ view: 'shelf', look: 'paper', paint: 'studio' });
    expect(item('studio').hasAttribute('aria-busy')).toBe(false);
    expect(description('studio')).toBe('Lit materials, drawn with WebGL.');
  });

  it('moves between the two sides with the left and right arrow keys', () => {
    const { panel, menu, item } = mount();
    const button = document.createElement('button');
    document.body.prepend(button);
    createMenu({ button, panel, onOpen: () => menu.update({ view: 'shelf', look: 'paper' }) });
    button.click();
    item('classic').focus();
    key(item('classic'), 'ArrowRight');
    expect(document.activeElement).toBe(item('studio'));
    key(item('studio'), 'ArrowRight');
    expect(document.activeElement).toBe(item('classic'));
    key(item('classic'), 'ArrowLeft');
    expect(document.activeElement).toBe(item('studio'));
    // Outside the switch the keys do nothing.
    const shelf = panel.querySelector<HTMLElement>('[data-view="shelf"]')!;
    shelf.focus();
    key(shelf, 'ArrowRight');
    expect(document.activeElement).toBe(shelf);
  });
});

describe('renderViewMenu staying open', () => {
  const looks = [
    { name: 'paper', label: 'Paper Row', summary: 'A paper ground.' },
    { name: 'night', label: 'Night Study', summary: 'A dark ground.' },
  ];
  const paints = [
    { name: 'classic', label: 'Classic', summary: 'CSS 3D, light and fast.' },
    { name: 'studio', label: 'Studio', summary: 'Lit materials, drawn with WebGL.' },
  ];

  function open() {
    document.body.replaceChildren();
    const button = document.createElement('button');
    const panel = document.createElement('div');
    panel.id = 'view-menu';
    document.body.append(button, panel);
    const onLook = vi.fn();
    const onPaint = vi.fn();
    const onView = vi.fn();
    const menu = renderViewMenu({ panel, looks, onView, onLook, paints, onPaint });
    createMenu({ button, panel, onOpen: () => menu.update({ view: 'shelf', look: 'paper' }) });
    button.click();
    const item = (selector: string): HTMLElement => panel.querySelector<HTMLElement>(selector)!;
    return { button, panel, item, onLook, onPaint, onView };
  }

  it('stays open when a look is chosen, marks it at once and keeps focus on it', () => {
    const { panel, item, onLook } = open();
    const night = item('[data-look="night"]');
    night.focus();
    night.click();
    expect(onLook).toHaveBeenCalledWith('night');
    expect(panel.hidden).toBe(false);
    expect(night.getAttribute('aria-checked')).toBe('true');
    expect(item('[data-look="paper"]').getAttribute('aria-checked')).toBe('false');
    expect(document.activeElement).toBe(night);
    item('[data-look="paper"]').click();
    expect(panel.hidden).toBe(false);
    expect(onLook).toHaveBeenLastCalledWith('paper');
  });

  it('stays open when a drawing is chosen', () => {
    const { panel, item, onPaint } = open();
    item('[data-paint="studio"]').click();
    expect(onPaint).toHaveBeenCalledWith('studio');
    expect(panel.hidden).toBe(false);
  });

  it('closes when a view is chosen, and on Escape', () => {
    const { button, panel, item, onView } = open();
    item('[data-view="list"]').click();
    expect(onView).toHaveBeenCalledWith('list');
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
    button.click();
    item('[data-look="night"]').click();
    key(item('[data-look="night"]'), 'Escape');
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
  });
});

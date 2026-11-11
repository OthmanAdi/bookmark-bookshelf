/**
 * The View menu: shelf or list, then the four looks, each with its one-line summary in view. A look is
 * chosen only when its item is activated, never while the arrow keys pass over it.
 */

export type ViewMode = 'shelf' | 'list';

export interface LookChoice {
  name: string;
  label: string;
  summary: string;
}

export interface ViewMenuOptions {
  panel: HTMLElement;
  looks: readonly LookChoice[];
  onView(view: ViewMode): void;
  onLook(name: string): void;
}

export interface ViewMenu {
  update(state: { view: ViewMode; look: string }): void;
}

const VIEWS: ReadonlyArray<{ value: ViewMode; label: string }> = [
  { value: 'shelf', label: 'Shelf' },
  { value: 'list', label: 'List' },
];

function item(label: string, summary?: string, summaryId?: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'bb-menu__item';
  element.setAttribute('role', 'menuitemradio');
  element.setAttribute('aria-checked', 'false');
  // Items of a menu are reached with the arrow keys; Tab leaves the menu, which then closes.
  element.tabIndex = -1;
  const name = document.createElement('span');
  name.className = 'bb-menu__label';
  name.textContent = label;
  element.appendChild(name);
  if (summary && summaryId) {
    const line = document.createElement('span');
    line.className = 'bb-menu__summary';
    line.id = summaryId;
    line.textContent = summary;
    element.appendChild(line);
    // The label names the item; the summary is read after it as its description.
    name.id = `${summaryId}-name`;
    element.setAttribute('aria-labelledby', name.id);
    element.setAttribute('aria-describedby', summaryId);
  }
  return element;
}

function group(label: string, items: HTMLElement[]): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('role', 'group');
  wrapper.setAttribute('aria-label', label);
  wrapper.className = 'bb-menu__group';
  const heading = document.createElement('span');
  heading.className = 'bb-menu__heading';
  heading.setAttribute('aria-hidden', 'true');
  heading.textContent = label;
  wrapper.append(heading, ...items);
  return wrapper;
}

export function renderViewMenu(options: ViewMenuOptions): ViewMenu {
  const { panel } = options;
  const prefix = panel.id || 'view-menu';

  const viewItems = VIEWS.map((view) => {
    const element = item(view.label);
    element.dataset.view = view.value;
    element.addEventListener('click', () => options.onView(view.value));
    return element;
  });

  const lookItems = options.looks.map((look) => {
    const element = item(look.label, look.summary, `${prefix}-${look.name}`);
    element.dataset.look = look.name;
    element.addEventListener('click', () => options.onLook(look.name));
    return element;
  });

  const rule = document.createElement('div');
  rule.className = 'bb-menu__rule';
  rule.setAttribute('role', 'separator');
  panel.replaceChildren(group('View', viewItems), rule, group('Look', lookItems));

  return {
    update(state) {
      for (const element of viewItems) element.setAttribute('aria-checked', String(element.dataset.view === state.view));
      for (const element of lookItems) element.setAttribute('aria-checked', String(element.dataset.look === state.look));
    },
  };
}

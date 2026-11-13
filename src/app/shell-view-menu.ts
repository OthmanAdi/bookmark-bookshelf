/**
 * The View menu: how the shelf is drawn as a two-way switch at the top, then shelf, list or showcase, then
 * the four looks, each with its one-line summary in view. A look or a drawing is chosen only when its item
 * is activated, never while the arrow keys pass over it, and choosing one leaves the menu open, so looks
 * can be compared in one visit. Choosing a view closes it.
 */

export type ViewMode = 'shelf' | 'list' | 'showcase';

export interface LookChoice {
  name: string;
  label: string;
  summary: string;
}

/** A way to draw the shelf, such as Classic or Studio. */
export interface PaintChoice {
  name: string;
  label: string;
  summary: string;
}

export interface ViewMenuOptions {
  panel: HTMLElement;
  looks: readonly LookChoice[];
  onView(view: ViewMode): void;
  onLook(name: string): void;
  /** Left out or empty, the menu has no Drawing group. */
  paints?: readonly PaintChoice[];
  onPaint?(name: string): void;
}

export interface ViewMenuState {
  view: ViewMode;
  look: string;
  paint?: string;
  /**
   * Drawings this browser cannot use, each with the reason in a few words. Such an item stays in the menu,
   * reachable with the arrow keys, but is marked unavailable, says why in place of its summary, and does nothing.
   */
  unavailable?: Readonly<Record<string, string>>;
  /**
   * A drawing that was asked for and is not on the shelf yet, with what its item says meanwhile. The item
   * is marked busy until an update leaves this out.
   */
  preparing?: Readonly<Record<string, string>>;
}

export interface ViewMenu {
  update(state: ViewMenuState): void;
}

const VIEWS: ReadonlyArray<{ value: ViewMode; label: string }> = [
  { value: 'shelf', label: 'Shelf' },
  { value: 'list', label: 'List' },
  { value: 'showcase', label: 'Showcase' },
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

/**
 * A group of single choices inside a menu, such as Sort by. Fills `host` (which keeps its own label)
 * and returns a function that marks the current choice.
 */
export function renderChoices<T extends string>(
  host: HTMLElement,
  heading: string,
  choices: ReadonlyArray<{ value: T; label: string }>,
  onChoose: (value: T) => void,
): (current: T) => void {
  const items = choices.map((choice) => {
    const element = item(choice.label);
    element.addEventListener('click', () => onChoose(choice.value));
    return { element, value: choice.value };
  });
  const title = document.createElement('span');
  title.className = 'bb-menu__heading';
  title.setAttribute('aria-hidden', 'true');
  title.textContent = heading;
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', heading);
  host.replaceChildren(title, ...items.map((entry) => entry.element));
  return (current) => {
    for (const entry of items) entry.element.setAttribute('aria-checked', String(entry.value === current));
  };
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

  const mark = (items: readonly HTMLElement[], current: HTMLElement): void => {
    for (const element of items) element.setAttribute('aria-checked', String(element === current));
  };

  const lookItems: HTMLButtonElement[] = options.looks.map((look) => {
    const element = item(look.label, look.summary, `${prefix}-${look.name}`);
    element.dataset.look = look.name;
    // A look is tried, not committed to: the menu stays for the next one.
    element.dataset.keepOpen = '';
    element.addEventListener('click', () => {
      options.onLook(look.name);
      // The look itself changes behind a short fade; the menu says what was chosen at once.
      mark(lookItems, element);
    });
    return element;
  });

  const paintItems = (options.paints ?? []).map((paint) => {
    const element = item(paint.label, paint.summary, `${prefix}-paint-${paint.name}`);
    element.dataset.paint = paint.name;
    element.dataset.keepOpen = '';
    element.addEventListener('click', () => {
      if (element.getAttribute('aria-disabled') === 'true') return;
      options.onPaint?.(paint.name);
    });
    return { element, paint };
  });

  const rule = (): HTMLElement => {
    const element = document.createElement('div');
    element.className = 'bb-menu__rule';
    element.setAttribute('role', 'separator');
    return element;
  };

  // Each side of the switch keeps its own description for a screen reader; the one line under the switch
  // shows the same words for the side in use, or why the other side cannot be chosen.
  const switchNote = document.createElement('p');
  switchNote.className = 'bb-menu__switch-note';
  switchNote.setAttribute('aria-hidden', 'true');

  const parts: HTMLElement[] = [];
  if (paintItems.length > 0) {
    const sides = document.createElement('div');
    sides.className = 'bb-menu__switch';
    // Left and right move between the sides, as they lie; up and down still walk the whole menu.
    sides.dataset.arrows = 'row';
    sides.append(...paintItems.map((entry) => entry.element));
    parts.push(group('Drawing', [sides, switchNote]), rule());
  }
  const views = group('View', viewItems);
  // On a phone the views lie in one row; the class says so, the order and the roles stay the same.
  views.classList.add('bb-menu__group--row');
  parts.push(views, rule(), group('Look', lookItems));
  panel.replaceChildren(...parts);

  return {
    update(state) {
      for (const element of viewItems) element.setAttribute('aria-checked', String(element.dataset.view === state.view));
      for (const element of lookItems) element.setAttribute('aria-checked', String(element.dataset.look === state.look));
      const current = state.paint ?? paintItems[0]?.paint.name;
      let note = '';
      for (const { element, paint } of paintItems) {
        const checked = paint.name === current;
        element.setAttribute('aria-checked', String(checked));
        const reason = state.unavailable?.[paint.name];
        const waiting = reason ? undefined : state.preparing?.[paint.name];
        const summary = element.querySelector('.bb-menu__summary');
        if (summary) summary.textContent = reason ?? waiting ?? paint.summary;
        if (reason) element.setAttribute('aria-disabled', 'true');
        else element.removeAttribute('aria-disabled');
        if (waiting) element.setAttribute('aria-busy', 'true');
        else element.removeAttribute('aria-busy');
        if (waiting) note = `${paint.label}: ${waiting}`;
        else if (reason) note = `${paint.label}: ${reason}`;
        else if (checked && note === '') note = paint.summary;
      }
      switchNote.textContent = note;
    },
  };
}

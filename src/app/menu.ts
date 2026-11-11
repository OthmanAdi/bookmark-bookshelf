/**
 * A button that opens a small panel of real buttons. Escape closes it and gives focus back to the
 * button; the arrow keys, Home and End move between items; a click elsewhere or tabbing away closes it.
 *
 * Choosing an item closes the panel and returns focus to the button before the item's own action runs,
 * so an action that opens a dialog hands focus back to the menu button, a control that is still there,
 * when that dialog closes.
 */

export interface MenuOptions {
  button: HTMLButtonElement;
  panel: HTMLElement;
  /** Called just before the panel shows, so its items can describe the current state. */
  onOpen?: () => void;
}

export interface Menu {
  readonly isOpen: boolean;
  open(focus?: 'first' | 'last' | 'current'): void;
  close(options?: { returnFocus?: boolean }): void;
  destroy(): void;
}

const ITEMS = 'button, a[href], input, select, textarea, [role^="menuitem"]';

/** Only one menu is open at a time. */
let openMenu: Menu | null = null;

function usable(element: HTMLElement): boolean {
  if (element.hidden || element.closest('[hidden]')) return false;
  if (element.matches(':disabled')) return false;
  return true;
}

export function createMenu(options: MenuOptions): Menu {
  const { button, panel } = options;
  let isOpen = false;

  button.setAttribute('aria-expanded', 'false');
  if (panel.id) button.setAttribute('aria-controls', panel.id);
  panel.hidden = true;

  const items = (): HTMLElement[] => [...panel.querySelectorAll<HTMLElement>(ITEMS)].filter(usable);

  function focusItem(which: 'first' | 'last' | 'current'): void {
    const list = items();
    const current = which === 'current' ? list.find((item) => item.getAttribute('aria-checked') === 'true') : undefined;
    const target = current ?? (which === 'last' ? list[list.length - 1] : list[0]);
    target?.focus({ preventScroll: true });
  }

  const onPointerDown = (event: PointerEvent): void => {
    const target = event.target as Node | null;
    if (target && (panel.contains(target) || button.contains(target))) return;
    menu.close();
  };

  const menu: Menu = {
    get isOpen() {
      return isOpen;
    },
    open(focus = 'first') {
      if (isOpen) return;
      if (openMenu && openMenu !== menu) openMenu.close();
      options.onOpen?.();
      isOpen = true;
      openMenu = menu;
      panel.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', onPointerDown, true);
      focusItem(focus);
    },
    close(closeOptions = {}) {
      if (!isOpen) return;
      const hadFocus = panel.contains(document.activeElement);
      isOpen = false;
      if (openMenu === menu) openMenu = null;
      document.removeEventListener('pointerdown', onPointerDown, true);
      // Focus leaves the panel before it hides, so it never falls to the page.
      if (closeOptions.returnFocus || hadFocus) button.focus({ preventScroll: true });
      panel.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    },
    destroy() {
      menu.close();
      button.removeEventListener('click', onButtonClick);
      button.removeEventListener('keydown', onButtonKey);
      panel.removeEventListener('keydown', onPanelKey);
      panel.removeEventListener('click', onPanelClick, true);
      panel.removeEventListener('focusout', onFocusOut);
    },
  };

  const onButtonClick = (): void => {
    if (isOpen) menu.close({ returnFocus: true });
    else menu.open('current');
  };

  const onButtonKey = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) menu.open(event.key === 'ArrowDown' ? 'first' : 'last');
      else focusItem(event.key === 'ArrowDown' ? 'first' : 'last');
    } else if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      menu.close({ returnFocus: true });
    }
  };

  const onPanelKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      menu.close({ returnFocus: true });
      return;
    }
    const target = event.target as HTMLElement;
    // Inside a text field the arrow keys belong to the field.
    if (target.matches('input, textarea, select')) return;
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    let next: HTMLElement | undefined;
    if (event.key === 'ArrowDown') next = list[(index + 1) % list.length];
    else if (event.key === 'ArrowUp') next = list[(index - 1 + list.length) % list.length];
    else if (event.key === 'Home') next = list[0];
    else if (event.key === 'End') next = list[list.length - 1];
    else return;
    event.preventDefault();
    next?.focus({ preventScroll: true });
  };

  // Capture phase: the menu is closed and focus is on the button before the item's own listener runs.
  const onPanelClick = (event: MouseEvent): void => {
    const item = (event.target as Element | null)?.closest<HTMLElement>(ITEMS);
    if (!item || !panel.contains(item) || item.dataset.keepOpen !== undefined) return;
    menu.close({ returnFocus: true });
  };

  const onFocusOut = (event: FocusEvent): void => {
    const next = event.relatedTarget as Node | null;
    if (!isOpen || !next) return;
    if (panel.contains(next) || button.contains(next)) return;
    menu.close();
  };

  button.addEventListener('click', onButtonClick);
  button.addEventListener('keydown', onButtonKey);
  panel.addEventListener('keydown', onPanelKey);
  panel.addEventListener('click', onPanelClick, true);
  panel.addEventListener('focusout', onFocusOut);

  return menu;
}

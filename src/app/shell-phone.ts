/**
 * The phone layout. On a narrow screen, or a touch screen up to tablet width, View and Add a link move
 * to a dock at the bottom where a thumb reaches them, and search folds into an icon in the top bar
 * that opens the field across the bar. On a wider screen they go back into the bar.
 */

export const PHONE_QUERY = '(max-width: 40rem), (pointer: coarse) and (max-width: 48rem)';

export interface PhoneElements {
  /** The bar's group of tools; the moved controls return here. */
  tools: HTMLElement;
  /** View goes back in front of this element in the bar. */
  viewAnchor: HTMLElement;
  view: HTMLElement;
  viewPanel: HTMLElement;
  add: HTMLElement;
  dock: HTMLElement;
  searchBox: HTMLElement;
  searchToggle: HTMLButtonElement;
  searchInput: HTMLInputElement;
}

export interface PhoneLayout {
  isPhone(): boolean;
  /** Folds the search field back into its icon; with `returnFocus` the icon takes focus. */
  closeSearch(returnFocus?: boolean): void;
  destroy(): void;
}

export function createPhoneLayout(elements: PhoneElements, query: MediaQueryList): PhoneLayout {
  const { tools, viewAnchor, view, viewPanel, add, dock, searchBox, searchToggle, searchInput } = elements;

  function moveKeepingFocus(move: () => void, ...moved: HTMLElement[]): void {
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const holds = focused !== null && moved.some((element) => element.contains(focused));
    move();
    if (holds && document.activeElement !== focused) focused.focus({ preventScroll: true });
  }

  function place(): void {
    const phone = query.matches;
    if (phone && view.parentElement !== dock) {
      moveKeepingFocus(() => dock.append(view, add), view, add);
    } else if (!phone && view.parentElement === dock) {
      moveKeepingFocus(() => {
        tools.insertBefore(view, viewAnchor);
        tools.append(add);
      }, view, add);
    }
    // From the dock the menu opens upward, above the thumb.
    if (phone) viewPanel.dataset.side = 'top';
    else delete viewPanel.dataset.side;
    if (!phone) closeSearch();
  }

  function openSearch(): void {
    searchBox.dataset.open = '';
    searchToggle.setAttribute('aria-expanded', 'true');
    searchInput.focus();
  }

  function closeSearch(returnFocus = false): void {
    if (searchBox.dataset.open === undefined) return;
    delete searchBox.dataset.open;
    searchToggle.setAttribute('aria-expanded', 'false');
    if (returnFocus && query.matches) searchToggle.focus({ preventScroll: true });
  }

  // An empty field folds away as soon as focus leaves it; a field with words stays open to go back to.
  const onBlur = (): void => {
    if (query.matches && searchInput.value.trim() === '') closeSearch();
  };

  searchToggle.addEventListener('click', openSearch);
  searchInput.addEventListener('blur', onBlur);
  query.addEventListener('change', place);
  place();

  return {
    isPhone: () => query.matches,
    closeSearch,
    destroy() {
      searchToggle.removeEventListener('click', openSearch);
      searchInput.removeEventListener('blur', onBlur);
      query.removeEventListener('change', place);
    },
  };
}

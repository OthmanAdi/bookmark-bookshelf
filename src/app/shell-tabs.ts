/**
 * The shelf tabs: one filter button per shelf, All first. Tabs are kept and patched in place, so the
 * tab that has focus keeps it when names, counts or the active shelf change. The strip scrolls
 * sideways when it is wider than the room it has, fades at the edge that has more, and brings the
 * active tab into view.
 */

export interface TabEntry {
  /** Null is All. */
  id: string | null;
  name: string;
  count: number;
}

export interface ShelfTabs {
  render(entries: readonly TabEntry[], active: string | null): void;
  destroy(): void;
}

const ALL_KEY = '\u0000all';
const keyOf = (id: string | null): string => id ?? ALL_KEY;

export function countWords(count: number): string {
  return count === 1 ? '1 link' : `${count} links`;
}

let serial = 0;

export function createShelfTabs(
  strip: HTMLElement,
  onChoose: (id: string | null) => void,
  options: { reduced?: () => boolean } = {},
): ShelfTabs {
  const reduced = options.reduced ?? (() => false);
  const tabs = new Map<string, HTMLButtonElement>();
  let activeKey: string | null = null;

  function create(entry: TabEntry): HTMLButtonElement {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'bb-tab';
    const id = `bb-tab-${++serial}`;
    const name = document.createElement('span');
    name.className = 'bb-tab__name';
    name.id = `${id}-name`;
    const count = document.createElement('span');
    count.className = 'bb-tab__count';
    count.setAttribute('aria-hidden', 'true');
    const said = document.createElement('span');
    said.className = 'bb-visually-hidden';
    said.id = `${id}-count`;
    tab.append(name, count, said);
    // Named by the shelf, with the count as its description: "Reading list", "5 links".
    tab.setAttribute('aria-labelledby', name.id);
    tab.setAttribute('aria-describedby', said.id);
    tab.addEventListener('click', () => onChoose(entry.id));
    return tab;
  }

  function patch(tab: HTMLButtonElement, entry: TabEntry, active: boolean): void {
    const [name, count, said] = tab.children as unknown as [HTMLElement, HTMLElement, HTMLElement];
    if (name.textContent !== entry.name) name.textContent = entry.name;
    const figure = String(entry.count);
    if (count.textContent !== figure) count.textContent = figure;
    const words = countWords(entry.count);
    if (said.textContent !== words) said.textContent = words;
    tab.setAttribute('aria-pressed', String(active));
    tab.dataset.shelf = entry.id ?? '';
  }

  function updateFade(): void {
    const max = strip.scrollWidth - strip.clientWidth;
    const start = strip.scrollLeft > 1;
    const end = strip.scrollLeft < max - 1;
    strip.dataset.fade = start && end ? 'both' : start ? 'start' : end ? 'end' : 'none';
  }

  /** Scrolls the strip, never the page, until the tab is inside it with a little room to spare. */
  function reveal(tab: HTMLElement): void {
    const room = 24;
    const left = tab.offsetLeft;
    const right = left + tab.offsetWidth;
    let target = strip.scrollLeft;
    // A tab wider than the strip shows where its name begins: the end of a long name can wait.
    const wider = tab.offsetWidth + 2 * room > strip.clientWidth;
    if (wider || left - room < strip.scrollLeft) target = left - (wider ? 0 : room);
    else if (right + room > strip.scrollLeft + strip.clientWidth) target = right + room - strip.clientWidth;
    target = Math.max(0, target);
    if (Math.abs(target - strip.scrollLeft) < 1) return;
    if (typeof strip.scrollTo === 'function') strip.scrollTo({ left: target, behavior: reduced() ? 'auto' : 'smooth' });
    else strip.scrollLeft = target;
  }

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(updateFade) : null;
  observer?.observe(strip);
  strip.addEventListener('scroll', updateFade, { passive: true });

  return {
    render(entries, active) {
      const focusedKey = [...tabs].find(([, tab]) => tab === document.activeElement)?.[0] ?? null;
      const wanted = entries.map((entry) => keyOf(entry.id));
      const focusedIndex = focusedKey ? [...tabs.keys()].indexOf(focusedKey) : -1;

      for (const [key, tab] of tabs) {
        if (wanted.includes(key)) continue;
        tab.remove();
        tabs.delete(key);
      }

      entries.forEach((entry, index) => {
        const key = keyOf(entry.id);
        let tab = tabs.get(key);
        if (!tab) {
          tab = create(entry);
          tabs.set(key, tab);
        }
        patch(tab, entry, entry.id === active);
        // Move only what is out of place, so a focused tab that stays put is never taken out of the page.
        if (strip.children[index] !== tab) strip.insertBefore(tab, strip.children[index] ?? null);
      });

      // Focus stays on the same shelf, or goes to the tab now standing where the removed one was.
      if (focusedKey && document.activeElement !== tabs.get(focusedKey)) {
        const kept = tabs.get(focusedKey);
        const neighbour = kept ?? [...tabs.values()][Math.min(Math.max(0, focusedIndex), tabs.size - 1)];
        neighbour?.focus({ preventScroll: true });
      }

      const nextActive = keyOf(active);
      const activeTab = tabs.get(nextActive);
      if (activeTab && nextActive !== activeKey) reveal(activeTab);
      activeKey = nextActive;
      updateFade();
    },
    destroy() {
      observer?.disconnect();
      strip.removeEventListener('scroll', updateFade);
    },
  };
}

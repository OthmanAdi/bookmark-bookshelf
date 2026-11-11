import { describe, expect, it, vi } from 'vitest';
import { countWords, createShelfTabs, type TabEntry } from './shell-tabs';

const entries: TabEntry[] = [
  { id: null, name: 'All', count: 9 },
  { id: 's1', name: 'Reading list', count: 5 },
  { id: 's2', name: 'iOS notes', count: 1 },
];

function setup() {
  document.body.replaceChildren();
  const strip = document.createElement('div');
  document.body.appendChild(strip);
  const onChoose = vi.fn();
  const tabs = createShelfTabs(strip, onChoose);
  return { strip, onChoose, tabs };
}

const buttons = (strip: HTMLElement): HTMLButtonElement[] => [...strip.querySelectorAll('button')];
const nameOf = (tab: HTMLElement): string | null | undefined =>
  document.getElementById(tab.getAttribute('aria-labelledby')!)?.textContent;
const descriptionOf = (tab: HTMLElement): string | null | undefined =>
  document.getElementById(tab.getAttribute('aria-describedby')!)?.textContent;

describe('createShelfTabs', () => {
  it('names each tab by its shelf as typed and describes the count', () => {
    const { strip, tabs } = setup();
    tabs.render(entries, 's1');
    const [all, reading, ios] = buttons(strip) as [HTMLButtonElement, HTMLButtonElement, HTMLButtonElement];
    expect(nameOf(ios)).toBe('iOS notes');
    expect(descriptionOf(ios)).toBe('1 link');
    expect(descriptionOf(reading)).toBe('5 links');
    expect(reading.querySelector('.bb-tab__count')?.getAttribute('aria-hidden')).toBe('true');
    expect(all.getAttribute('aria-pressed')).toBe('false');
    expect(reading.getAttribute('aria-pressed')).toBe('true');
  });

  it('patches tabs in place and keeps focus on the same tab', () => {
    const { strip, tabs } = setup();
    tabs.render(entries, null);
    const reading = buttons(strip)[1]!;
    reading.focus();
    tabs.render(
      [entries[0]!, { id: 's1', name: 'Reading list, autumn', count: 6 }, entries[2]!],
      's1',
    );
    expect(buttons(strip)[1]).toBe(reading);
    expect(document.activeElement).toBe(reading);
    expect(nameOf(reading)).toBe('Reading list, autumn');
    expect(reading.querySelector('.bb-tab__count')?.textContent).toBe('6');
  });

  it('follows a new order without losing focus', () => {
    const { strip, tabs } = setup();
    tabs.render(entries, null);
    const ios = buttons(strip)[2]!;
    ios.focus();
    tabs.render([entries[0]!, entries[2]!, entries[1]!], null);
    expect(buttons(strip).map((tab) => nameOf(tab))).toEqual(['All', 'iOS notes', 'Reading list']);
    expect(document.activeElement).toBe(ios);
  });

  it('gives focus to the neighbour when the focused shelf is removed', () => {
    const { strip, tabs } = setup();
    tabs.render(entries, 's1');
    buttons(strip)[1]!.focus();
    tabs.render([entries[0]!, entries[2]!], null);
    expect(nameOf(document.activeElement as HTMLElement)).toBe('iOS notes');
  });

  it('reports the shelf chosen', () => {
    const { strip, onChoose, tabs } = setup();
    tabs.render(entries, null);
    buttons(strip)[2]!.click();
    buttons(strip)[0]!.click();
    expect(onChoose.mock.calls).toEqual([['s2'], [null]]);
  });
});

describe('countWords', () => {
  it('says link or links', () => {
    expect(countWords(0)).toBe('0 links');
    expect(countWords(1)).toBe('1 link');
    expect(countWords(12)).toBe('12 links');
  });
});

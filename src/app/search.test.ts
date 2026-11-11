import { describe, expect, it, vi } from 'vitest';
import { createSearch, findLinks, resultsSentence, type SearchResult } from './search';

const links = [
  { id: 'a', shelfId: 's1', url: 'https://www.example.org/url', title: 'What is a URL?', tags: [] },
  { id: 'b', shelfId: 's2', url: 'https://example.com/rot', title: 'Link rot', tags: ['web'], note: 'About URLs that stop working' },
  { id: 'c', shelfId: 's2', url: 'https://example.net/', title: 'Paper size', tags: [] },
];
const names = new Map([
  ['s1', 'Homework'],
  ['s2', 'Things I look up'],
]);

describe('findLinks', () => {
  it('finds across shelves, best first, with shelf and site', () => {
    expect(findLinks(links, names, 'url')).toEqual([
      { id: 'a', title: 'What is a URL?', shelf: 'Homework', host: 'example.org' },
      { id: 'b', title: 'Link rot', shelf: 'Things I look up', host: 'example.com' },
    ]);
  });

  it('keeps to the limit and finds nothing for a blank query', () => {
    expect(findLinks(links, names, 'e', 1)).toHaveLength(1);
    expect(findLinks(links, names, '   ')).toEqual([]);
  });

  it('counts the results in a sentence', () => {
    expect(resultsSentence(0)).toBe('No links match.');
    expect(resultsSentence(1)).toBe('1 link found.');
    expect(resultsSentence(4)).toBe('4 links found.');
  });
});

function setup(results: SearchResult[]) {
  document.body.replaceChildren();
  const input = document.createElement('input');
  const popup = document.createElement('div');
  const list = document.createElement('ul');
  list.id = 'search-results';
  const empty = document.createElement('p');
  const status = document.createElement('p');
  const other = document.createElement('input');
  popup.append(list, empty);
  document.body.append(input, popup, status, other);
  const handlers = { find: vi.fn(() => results), choose: vi.fn(), leave: vi.fn() };
  createSearch({ input, popup, list, empty, status }, handlers);
  const type = (value: string): void => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const key = (target: Element, name: string): void => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
  };
  return { input, popup, list, empty, status, other, handlers, type, key };
}

const two: SearchResult[] = [
  { id: 'a', title: 'What is a URL?', shelf: 'Homework', host: 'example.org' },
  { id: 'b', title: 'Link rot', shelf: 'Things I look up', host: 'example.com' },
];

describe('createSearch', () => {
  it('is a combobox that lists the matches as options', () => {
    const { input, popup, list, status, type } = setup(two);
    expect(input.getAttribute('role')).toBe('combobox');
    type('url');
    expect(popup.hidden).toBe(false);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    const options = [...list.querySelectorAll('[role="option"]')];
    expect(options.map((option) => option.querySelector('.bb-search__title')?.textContent)).toEqual(['What is a URL?', 'Link rot']);
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]!.id);
    expect(status.textContent).toBe('2 links found.');
  });

  it('moves with the arrow keys and chooses with Enter', () => {
    const { input, popup, handlers, type, key } = setup(two);
    type('url');
    key(input, 'ArrowDown');
    key(input, 'Enter');
    expect(handlers.choose).toHaveBeenCalledWith('b');
    expect(input.value).toBe('');
    expect(popup.hidden).toBe(true);
  });

  it('says so when nothing matches', () => {
    const { empty, type } = setup([]);
    type('zebra');
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toBe('No links match “zebra”.');
  });

  it('closes the list on the first Escape and leaves the field on the second', () => {
    const { input, popup, handlers, type, key } = setup(two);
    type('url');
    key(input, 'Escape');
    expect(popup.hidden).toBe(true);
    expect(handlers.leave).not.toHaveBeenCalled();
    key(input, 'Escape');
    expect(handlers.leave).toHaveBeenCalledOnce();
    expect(input.value).toBe('');
  });

  it('focuses the field on / unless the person is typing elsewhere', () => {
    const { input, other, key } = setup(two);
    other.focus();
    key(other, '/');
    expect(document.activeElement).toBe(other);
    other.blur();
    key(document.body, '/');
    expect(document.activeElement).toBe(input);
  });
});

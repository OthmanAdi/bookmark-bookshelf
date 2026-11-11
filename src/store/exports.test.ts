import { describe, expect, it } from 'vitest';
import * as store from './index';

const FUNCTIONS = [
  'createStore',
  'createMemoryStorage',
  'migrateLibrary',
  'emptyLibrary',
  'normalizeUrl',
  'urlKey',
  'defaultCover',
  'cleanLine',
  'cleanText',
  'looksLikeAddress',
  'minutesOf',
  'formatMinutes',
  'estimateMinutes',
  'countWords',
  'searchVolumes',
  'sortVolumes',
  'shelfStats',
  'formatShelfStatus',
  'handInSummary',
  'parseNetscapeBookmarks',
  'isNetscapeBookmarks',
  'parseLinkList',
  'parseAddRequest',
  'bookmarkletSource',
  'readShelfFile',
  'shelfFileName',
  'summariseShelfFile',
  'encodeShelfLink',
  'decodeShelfLink',
  'linkFit',
  'toNetscapeBookmarks',
  'toMarkdownList',
];

describe('the store index', () => {
  it.each(FUNCTIONS)('exports %s', (name) => {
    expect(typeof (store as unknown as Record<string, unknown>)[name]).toBe('function');
  });

  it('exports the constants a caller needs', () => {
    expect(store.LIBRARY_VERSION).toBe(2);
    expect(store.SHELF_FILE_FORMAT).toBe('bookmark-bookshelf-shelf');
    expect(store.MAX_URL_LENGTH).toBe(2048);
    expect(store.SORT_MODES.map((entry) => entry.mode)).toEqual([...store.SORT_MODE_NAMES]);
  });

  it('builds a working shelf from the pieces it exports', () => {
    const library = store.createStore({ storage: store.createMemoryStorage(), syncTabs: false });
    const parsed = store.parseLinkList('Paper one | https://example.org/one | start here');
    const shelf = library.shelves()[0]?.id ?? '';
    library.importLinks(parsed.entries, shelf);
    const links = library.bookmarks(shelf);
    expect(store.searchVolumes(links, 'paper').map((hit) => hit.id)).toEqual(links.map((link) => link.id));
    expect(store.sortVolumes(links, 'title', { isDone: () => false, percentOf: () => 0 }).map((link) => link.title)).toEqual(['Paper one']);
    const file = library.exportShelf(shelf, { includeTexts: true });
    expect(file.ok && store.summariseShelfFile(file.value).volumes).toBe(1);
  });
});

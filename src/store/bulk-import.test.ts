import { describe, expect, it } from 'vitest';
import { parseLinkList } from './link-list';
import { parseNetscapeBookmarks } from './netscape';
import { addAll, firstShelfId, makeRig } from './test-helpers';

const FILE = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><H3>Research</H3>
  <DL><p>
    <DT><A HREF="https://example.org/paper-one" ADD_DATE="1700000000">Paper one</A>
    <DT><A HREF="https://example.org/paper-two?utm_source=mail" ADD_DATE="1700000100">Paper two</A>
    <DT><H3>Methods</H3>
    <DL><p>
      <DT><A HREF="https://example.com/methods">Methods note</A>
    </DL><p>
  </DL><p>
  <DT><A HREF="https://example.net/loose">A loose link</A>
  <DT><A HREF="javascript:alert(1)">Not a page</A>
</DL><p>
`;

describe('importFolders', () => {
  it('turns folders into shelves and links, with nested folders named Parent / Child', () => {
    const { store } = makeRig();
    const parsed = parseNetscapeBookmarks(FILE);
    const result = store.importFolders(parsed.folders, { skipped: parsed.skipped });
    if (!result.ok) throw new Error('import failed');
    expect(result.value).toMatchObject({ added: 4, unchanged: 0, shelvesAdded: 3, updated: 0 });
    expect(result.value.skipped).toHaveLength(1);
    expect(store.shelves().map((shelf) => shelf.name)).toEqual(['Reading list', 'Research', 'Research / Methods', 'Imported']);
    const research = store.shelves().find((shelf) => shelf.name === 'Research');
    expect(store.bookmarks(research?.id).map((link) => link.title)).toEqual(['Paper one', 'Paper two']);
    expect(store.bookmarks(research?.id)[1]?.url).toBe('https://example.org/paper-two');
  });

  it('keeps the date a link was saved in the browser', () => {
    const { store } = makeRig();
    store.importFolders(parseNetscapeBookmarks(FILE).folders);
    const paper = store.bookmarks().find((link) => link.title === 'Paper one');
    expect(paper?.addedAt).toBe(new Date(1700000000 * 1000).toISOString());
  });

  it('counts links that are already saved, in any spelling, and leaves them alone', () => {
    const { store } = makeRig();
    const [a = ''] = addAll(store, ['https://www.example.org/paper-one/', 'https://example.net/loose#top']);
    store.updateBookmark(a, { title: 'My own title', note: 'mine' });
    const before = store.snapshot().bookmarks;
    const result = store.importFolders(parseNetscapeBookmarks(FILE).folders);
    if (!result.ok) throw new Error('import failed');
    expect(result.value).toMatchObject({ added: 2, unchanged: 2 });
    expect(store.snapshot().bookmarks.slice(0, 2)).toEqual(before);
  });

  it('puts a folder on the shelf with the same name when asked, and on a new one otherwise', () => {
    const { store } = makeRig();
    const research = store.addShelf('research');
    if (!research.ok) throw new Error('shelf failed');
    store.importFolders(parseNetscapeBookmarks(FILE).folders);
    expect(store.bookmarks(research.value.id)).toHaveLength(2);
    expect(store.shelves().filter((shelf) => shelf.name.toLowerCase().startsWith('research'))).toHaveLength(2);

    const other = makeRig();
    const existing = other.store.addShelf('Research');
    if (!existing.ok) throw new Error('shelf failed');
    other.store.importFolders(parseNetscapeBookmarks(FILE).folders, { mergeIntoExistingShelfNames: false });
    expect(other.store.shelves().map((shelf) => shelf.name)).toContain('Research (2)');
    expect(other.store.bookmarks(existing.value.id)).toEqual([]);
  });

  it('gives every new shelf and link its own id and a cover', () => {
    const { store } = makeRig();
    store.importFolders(parseNetscapeBookmarks(FILE).folders);
    const ids = [...store.shelves(), ...store.bookmarks()].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const link of store.bookmarks()) expect(link.cover.cloth).toBeTruthy();
  });

  it('leaves everything personal alone', () => {
    const { store } = makeRig();
    const [a = ''] = addAll(store, ['https://example.org/paper-one']);
    store.setDone(a, true);
    store.setNote(a, 'mine');
    store.setProgress(a, { block: 1, ratio: 0.1, percent: 0.1 });
    store.importFolders(parseNetscapeBookmarks(FILE).folders);
    expect(store.isDone(a)).toBe(true);
    expect(store.note(a)).toBe('mine');
    expect(store.progress(a)).toMatchObject({ block: 1 });
  });

  it('refuses nothing it can use and announces one change', () => {
    const { store } = makeRig();
    const events: string[] = [];
    store.subscribe((event) => events.push(event.reason));
    store.importFolders(parseNetscapeBookmarks(FILE).folders);
    expect(events.sort()).toEqual(['bookmarks', 'shelves']);
    events.length = 0;
    store.importFolders(parseNetscapeBookmarks(FILE).folders);
    expect(events.sort()).toEqual(['bookmarks', 'shelves']);
  });

  it('handles thousands of links in one step', () => {
    const { store } = makeRig();
    const links = Array.from({ length: 3000 }, (_, index) => ({ url: `https://example.org/page-${index}`, title: `Page ${index}` }));
    const started = performance.now();
    const result = store.importFolders([{ name: 'Big', links }]);
    expect(result).toMatchObject({ ok: true, value: { added: 3000, shelvesAdded: 1 } });
    expect(performance.now() - started).toBeLessThan(3000);
    expect(store.bookmarks()).toHaveLength(3000);
  });

  it('stops at 5,000 and lists the rest', () => {
    const { store } = makeRig();
    const links = Array.from({ length: 5003 }, (_, index) => ({ url: `https://example.org/page-${index}`, title: `P${index}` }));
    const result = store.importFolders([{ name: 'Huge', links }]);
    if (!result.ok) throw new Error('import failed');
    expect(result.value.added).toBe(5000);
    expect(result.value.skipped).toHaveLength(3);
  });

  it('does nothing and says so when storage refuses', () => {
    const rig = makeRig({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException('full', 'QuotaExceededError');
        },
        removeItem: () => undefined,
      },
    });
    const before = rig.store.snapshot();
    expect(rig.store.importFolders(parseNetscapeBookmarks(FILE).folders)).toMatchObject({ ok: false, error: { code: 'quota' } });
    expect(rig.store.snapshot()).toEqual(before);
  });
});

describe('importLinks', () => {
  const LIST = `1. [Paper one](https://example.org/paper-one)
Paper two | https://example.org/paper-two | read the intro first
Paper three - https://example.org/paper-three (optional) ~15 min
https://example.org/paper-four
no address on this line`;

  it('adds the entries to the shelf in the order written', () => {
    const { store } = makeRig();
    const shelf = firstShelfId(store);
    const parsed = parseLinkList(LIST);
    const result = store.importLinks(parsed.entries, shelf);
    if (!result.ok) throw new Error('import failed');
    expect(result.value).toMatchObject({ added: 4, unchanged: 0, shelvesAdded: 0, skipped: [], updated: 0 });
    const links = store.bookmarks(shelf);
    expect(links.map((link) => link.title)).toEqual(['Paper one', 'Paper two', 'Paper three', 'example.org']);
    expect(links.map((link) => link.order)).toEqual([0, 1, 2, 3]);
    expect(links[1]?.note).toBe('read the intro first');
    expect(links[2]).toMatchObject({ required: false, minutes: 15 });
    expect(parsed.unreadable).toHaveLength(1);
  });

  it('appends after the links already on the shelf', () => {
    const { store } = makeRig();
    const shelf = firstShelfId(store);
    addAll(store, ['https://example.org/first']);
    store.importLinks(parseLinkList(LIST).entries, shelf);
    expect(store.bookmarks(shelf).map((link) => link.order)).toEqual([0, 1, 2, 3, 4]);
    expect(store.bookmarks(shelf)[0]?.url).toBe('https://example.org/first');
  });

  it('counts addresses that are already saved and does not touch them', () => {
    const { store } = makeRig();
    const shelf = firstShelfId(store);
    const [a = ''] = addAll(store, ['https://www.example.org/paper-one/']);
    store.updateBookmark(a, { title: 'Kept' });
    const result = store.importLinks(parseLinkList(LIST).entries, shelf);
    expect(result).toMatchObject({ ok: true, value: { added: 3, unchanged: 1 } });
    expect(store.get(a)?.title).toBe('Kept');
  });

  it('lists an entry it cannot save with the reason and adds the rest', () => {
    const { store } = makeRig();
    const result = store.importLinks(
      [
        { url: 'https://example.org/fine', title: 'Fine' },
        { url: 'not an address', title: 'Broken' },
        { url: 'https://example.org/slow', title: 'Slow', minutes: 5000 },
        { url: 'https://user:pw@example.org/', title: 'Secret' },
      ],
      firstShelfId(store),
    );
    if (!result.ok) throw new Error('import failed');
    expect(result.value.added).toBe(1);
    expect(result.value.skipped.map((entry) => entry.title)).toEqual(['Broken', 'Slow', 'Secret']);
    expect(result.value.skipped.every((entry) => entry.reason !== '')).toBe(true);
  });

  it('says not found for a shelf that does not exist and adds nothing', () => {
    const { store } = makeRig();
    expect(store.importLinks([{ url: 'https://example.org/a' }], 'missing')).toMatchObject({
      ok: false,
      error: { code: 'not-found', field: 'shelfId' },
    });
    expect(store.bookmarks()).toEqual([]);
  });

  it('gives unique ids and announces one change', () => {
    const { store } = makeRig();
    const events: string[] = [];
    store.subscribe((event) => events.push(event.reason));
    store.importLinks(parseLinkList(LIST).entries, firstShelfId(store));
    expect(events).toEqual(['bookmarks']);
    const ids = store.bookmarks().map((link) => link.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('adds nothing for an empty list', () => {
    const { store } = makeRig();
    expect(store.importLinks([], firstShelfId(store))).toMatchObject({ ok: true, value: { added: 0, unchanged: 0 } });
  });
});

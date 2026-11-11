import { describe, expect, it } from 'vitest';
import { readShelfFile } from './shelf-file';
import type { ShelfFile } from './shelf-file';
import { addAll, counterIds, firstShelfId, makeRig } from './test-helpers';
import type { Store } from './index';

/** A teacher's store with one authored shelf. */
function teacher() {
  const rig = makeRig({ idFactory: counterIds('t') });
  const { store } = rig;
  const shelf = store.addShelf('Week 4');
  if (!shelf.ok) throw new Error('shelf failed');
  store.updateShelf(shelf.value.id, {
    description: 'Read these before Thursday.',
    lang: 'en',
    author: 'Ms Example',
    due: '2026-03-31',
  });
  const [a = '', b = '', c = ''] = addAll(
    store,
    ['https://example.org/one', 'https://example.org/two', 'https://example.org/three'],
    shelf.value.id,
  );
  store.updateBookmark(a, { title: 'One', note: 'Start here', tags: ['intro'], author: 'A. Writer', readingText: 'First text.' });
  store.updateBookmark(b, { title: 'Two', required: false, minutes: 12 });
  store.updateBookmark(c, { title: 'Three', cover: { cloth: 'moss', pattern: 'rays', seed: 9 } });
  store.setProgress(a, { block: 3, ratio: 0.5, percent: 0.4 });
  store.setDone(a, true);
  store.setNote(a, 'my private thought');
  return { ...rig, shelfId: shelf.value.id, a, b, c };
}

function exported(store: Store, shelfId: string, includeTexts = true): ShelfFile {
  const result = store.exportShelf(shelfId, { includeTexts });
  if (!result.ok) throw new Error('export failed');
  return result.value;
}

describe('exportShelf', () => {
  it('carries the shelf details and its links in shelf order', () => {
    const { store, shelfId, a, b, c } = teacher();
    const file = exported(store, shelfId);
    expect(file).toMatchObject({
      format: 'bookmark-bookshelf-shelf',
      version: 1,
      shelf: { id: shelfId, name: 'Week 4', description: 'Read these before Thursday.', lang: 'en', author: 'Ms Example', due: '2026-03-31', revision: 1 },
    });
    expect(file.volumes.map((volume) => volume.id)).toEqual([a, b, c]);
    expect(file.volumes[0]).toMatchObject({ title: 'One', note: 'Start here', tags: ['intro'], author: 'A. Writer', text: 'First text.' });
    expect(file.volumes[1]).toMatchObject({ required: false, minutes: 12 });
    expect(file.volumes[2]?.cover).toEqual({ cloth: 'moss', pattern: 'rays', seed: 9 });
  });

  it('leaves the texts out when asked', () => {
    const { store, shelfId } = teacher();
    for (const volume of exported(store, shelfId, false).volumes) expect(volume).not.toHaveProperty('text');
  });

  it('never carries reading position, done marks or private notes', () => {
    const { store, shelfId } = teacher();
    const text = JSON.stringify(exported(store, shelfId));
    expect(text).not.toContain('my private thought');
    expect(text).not.toMatch(/"(progress|done|notes|block|ratio|percent|addedAt|updatedAt|session)"/);
  });

  it('takes only the links of that shelf', () => {
    const { store, shelfId } = teacher();
    addAll(store, ['https://example.org/elsewhere'], firstShelfId(store));
    expect(exported(store, shelfId).volumes).toHaveLength(3);
  });

  it('is accepted by the shelf file reader as it is', () => {
    const { store, shelfId } = teacher();
    const read = readShelfFile(JSON.stringify(exported(store, shelfId)));
    expect(read.ok && read.value.skipped).toEqual([]);
  });

  it('says not found for a shelf that does not exist', () => {
    const { store } = teacher();
    expect(store.exportShelf('missing', { includeTexts: true })).toMatchObject({ ok: false, error: { code: 'not-found' } });
  });
});

describe('importShelf', () => {
  function student() {
    return makeRig({ idFactory: counterIds('s') });
  }

  it('adds one new shelf with new ids, file order and where each link came from', () => {
    const { store: from, shelfId, a, b, c } = teacher();
    const file = exported(from, shelfId);
    const { store } = student();
    const existing = store.snapshot();

    const result = store.importShelf(JSON.stringify(file));
    if (!result.ok) throw new Error('import failed');
    expect(result.value).toMatchObject({ name: 'Week 4', added: 3, skipped: [] });

    const shelf = store.shelves().find((item) => item.id === result.value.shelfId);
    expect(shelf).toMatchObject({
      name: 'Week 4',
      description: 'Read these before Thursday.',
      lang: 'en',
      author: 'Ms Example',
      due: '2026-03-31',
      origin: { shelfId, revision: 1 },
    });
    const links = store.bookmarks(result.value.shelfId);
    expect(links.map((link) => link.title)).toEqual(['One', 'Two', 'Three']);
    expect(links.map((link) => link.order)).toEqual([0, 1, 2]);
    expect(links.map((link) => link.origin)).toEqual([a, b, c].map((volumeId) => ({ shelfId, volumeId })));
    expect(links.map((link) => link.id).some((id) => [a, b, c].includes(id))).toBe(false);
    expect(new Set(links.map((link) => link.id)).size).toBe(3);

    expect(links[0]).toMatchObject({ note: 'Start here', tags: ['intro'], author: 'A. Writer', reading: { text: 'First text.' } });
    expect(links[1]).toMatchObject({ required: false, minutes: 12 });
    expect(links[2]?.cover).toEqual({ cloth: 'moss', pattern: 'rays', seed: 9 });
    expect(store.bookmarks().filter((link) => !link.origin)).toEqual(existing.bookmarks);
  });

  it('takes no reading position, done marks or notes, and leaves the library alone', () => {
    const { store: from, shelfId } = teacher();
    const { store } = student();
    const before = store.snapshot();
    store.importShelf(exported(from, shelfId));
    const after = store.snapshot();
    expect(after.progress).toEqual({});
    expect(after.done).toEqual({});
    expect(after.notes).toEqual({});
    expect(after.session).toEqual(before.session);
    expect(after.shelves[0]).toEqual(before.shelves[0]);
  });

  it('names the shelf "Name (2)" and "Name (3)" when the name is taken', () => {
    const { store: from, shelfId } = teacher();
    const file = exported(from, shelfId);
    const { store } = student();
    const names = [1, 2, 3].map(() => {
      const result = store.importShelf(file);
      if (!result.ok) throw new Error('import failed');
      return result.value.name;
    });
    expect(names).toEqual(['Week 4', 'Week 4 (2)', 'Week 4 (3)']);
    expect(store.shelves().map((shelf) => shelf.name)).toEqual(['Reading list', 'Week 4', 'Week 4 (2)', 'Week 4 (3)']);
  });

  it('keeps a clashing name within the length limit', () => {
    const { store: from, shelfId } = teacher();
    const file = exported(from, shelfId);
    file.shelf.name = 'N'.repeat(60);
    const { store } = student();
    store.importShelf(file);
    const second = store.importShelf(file);
    if (!second.ok) throw new Error('import failed');
    expect(second.value.name).toHaveLength(60);
    expect(second.value.name.endsWith(' (2)')).toBe(true);
  });

  it('adds a link whose address is already saved, so a class shelf arrives whole', () => {
    const { store: from, shelfId } = teacher();
    const { store } = student();
    addAll(store, ['https://example.org/one']);
    const result = store.importShelf(exported(from, shelfId));
    expect(result.ok && result.value.added).toBe(3);
    expect(store.bookmarks().filter((link) => link.url === 'https://example.org/one')).toHaveLength(2);
  });

  it('is the same shelf again after a round trip from a second person', () => {
    const { store: from, shelfId } = teacher();
    const { store: middle } = student();
    const first = middle.importShelf(exported(from, shelfId));
    if (!first.ok) throw new Error('import failed');
    const passedOn = exported(middle, first.value.shelfId);
    expect(passedOn.volumes.map((volume) => volume.title)).toEqual(['One', 'Two', 'Three']);
    const { store: last } = makeRig({ idFactory: counterIds('z') });
    const second = last.importShelf(passedOn);
    expect(second.ok && second.value.added).toBe(3);
    expect(last.bookmarks(second.ok ? second.value.shelfId : '').every((link) => link.origin?.shelfId === first.value.shelfId)).toBe(true);
  });

  it('accepts what readShelfFile returned', () => {
    const { store: from, shelfId } = teacher();
    const read = readShelfFile(JSON.stringify(exported(from, shelfId)));
    if (!read.ok) throw new Error('read failed');
    const { store } = student();
    expect(store.importShelf(read.value)).toMatchObject({ ok: true, value: { added: 3 } });
  });

  it('reports links it cannot use and still adds the rest', () => {
    const { store: from, shelfId } = teacher();
    const file = exported(from, shelfId);
    file.volumes[1]!.url = 'https://user:pw@example.org/two';
    file.volumes.push({ id: 'broken', url: 'javascript:alert(1)', title: 'Broken' });
    const { store } = student();
    const result = store.importShelf(file);
    if (!result.ok) throw new Error('import failed');
    expect(result.value.added).toBe(2);
    expect(result.value.skipped.map((entry) => entry.title)).toEqual(expect.arrayContaining(['Two', 'Broken']));
  });

  it('removes tracking from the addresses it receives', () => {
    const { store: from, shelfId } = teacher();
    const file = exported(from, shelfId);
    file.volumes[0]!.url = 'https://example.org/one?utm_source=mail&id=3';
    const { store } = student();
    const result = store.importShelf(file);
    if (!result.ok) throw new Error('import failed');
    expect(store.bookmarks(result.value.shelfId)[0]?.url).toBe('https://example.org/one?id=3');
  });

  it('answers with an error and changes nothing for a file it cannot read', () => {
    const { store } = student();
    const before = store.snapshot();
    expect(store.importShelf('not json')).toMatchObject({ ok: false });
    expect(store.importShelf({ format: 'something-else' })).toMatchObject({ ok: false, error: { code: 'not-a-shelf-file' } });
    expect(store.importShelf(null)).toMatchObject({ ok: false });
    expect(store.snapshot()).toEqual(before);
  });

  it('adds an empty shelf when the file has no links', () => {
    const { store: from, shelfId } = teacher();
    const file = exported(from, shelfId);
    file.volumes = [];
    const { store } = student();
    expect(store.importShelf(file)).toMatchObject({ ok: true, value: { added: 0 } });
    expect(store.shelves()).toHaveLength(2);
  });

  it('announces a change to shelves and links once', () => {
    const { store: from, shelfId } = teacher();
    const { store } = student();
    const events: string[] = [];
    store.subscribe((event) => events.push(event.reason));
    store.importShelf(exported(from, shelfId));
    expect(events.sort()).toEqual(['bookmarks', 'shelves']);
  });
});

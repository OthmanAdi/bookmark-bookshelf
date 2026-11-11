import { describe, expect, it } from 'vitest';
import { migrateLibrary } from './index';
import { counterIds, makeRig, testClock } from './test-helpers';

// Built from escapes so the source file holds no hidden characters.
const OVERRIDE = '‮';
const ISOLATE = '⁦';
const ZERO_WIDTH = '​';
const BOM = '﻿';
const BELL = '\u0007';

const dirty = (text: string): string => `${OVERRIDE}${text.slice(0, 2)}${ZERO_WIDTH}${text.slice(2)}${ISOLATE}${BELL}${BOM}`;

describe('text hygiene on the way in', () => {
  it('cleans the title, author, note and tags of a link', () => {
    const { store } = makeRig();
    const added = store.addBookmark({
      url: 'a.example.org',
      title: dirty('Title'),
      author: dirty('Author'),
      note: dirty('A note'),
      tags: [dirty('tag one'), dirty('tag two')],
    });
    if (!added.ok) throw new Error('add failed');
    expect(added.value).toMatchObject({ title: 'Title', author: 'Author', note: 'A note', tags: ['tag one', 'tag two'] });
  });

  it('cleans on update as well', () => {
    const { store } = makeRig();
    const added = store.addBookmark({ url: 'a.example.org' });
    if (!added.ok) throw new Error('add failed');
    const updated = store.updateBookmark(added.value.id, { title: dirty('Changed'), note: dirty('Later') });
    expect(updated.ok && updated.value).toMatchObject({ title: 'Changed', note: 'Later' });
  });

  it('turns line breaks in a title into spaces but keeps them in a note and in the text', () => {
    const { store } = makeRig();
    const added = store.addBookmark({
      url: 'a.example.org',
      title: 'Two\nlines\r\nhere',
      note: 'One\nTwo',
      readingText: 'First\r\n\r\nSecond\tcolumn',
    });
    if (!added.ok) throw new Error('add failed');
    expect(added.value.title).toBe('Two lines here');
    expect(added.value.note).toBe('One\nTwo');
    expect(added.value.reading?.text).toBe('First\n\nSecond\tcolumn');
  });

  it('cleans the reading text', () => {
    const { store } = makeRig();
    const added = store.addBookmark({ url: 'a.example.org', readingText: dirty('Paragraph one.') });
    expect(added.ok && added.value.reading?.text).toBe('Paragraph one.');
  });

  it('treats a title made only of hidden characters as empty', () => {
    const { store } = makeRig();
    const added = store.addBookmark({ url: 'a.example.org', title: `${ZERO_WIDTH}${OVERRIDE}` });
    expect(added.ok && added.value.title).toBe('a.example.org');
  });

  it('cleans shelf names, descriptions and authors', () => {
    const { store } = makeRig();
    const shelf = store.addShelf(dirty('Week one'));
    if (!shelf.ok) throw new Error('shelf failed');
    expect(shelf.value.name).toBe('Week one');
    const updated = store.updateShelf(shelf.value.id, { description: dirty('Read all'), author: dirty('Ms Example') });
    expect(updated.ok && updated.value).toMatchObject({ description: 'Read all', author: 'Ms Example' });
    expect(store.addShelf('Week one')).toMatchObject({ ok: false, error: { code: 'duplicate-shelf' } });
  });

  it('cleans private notes', () => {
    const { store } = makeRig();
    const added = store.addBookmark({ url: 'a.example.org' });
    if (!added.ok) throw new Error('add failed');
    store.setNote(added.value.id, dirty('Remember this'));
    expect(store.note(added.value.id)).toBe('Remember this');
  });

  it('keeps ordinary text in any script', () => {
    const { store } = makeRig();
    const text = 'Zürich, 東京, مرحبا, Привет';
    const added = store.addBookmark({ url: 'a.example.org', title: text, note: text });
    expect(added.ok && added.value).toMatchObject({ title: text, note: text });
  });

  it('cleans a library that is imported', () => {
    const result = migrateLibrary(
      {
        format: 'bookmark-bookshelf',
        version: 2,
        shelves: [{ id: 's1', name: dirty('Class'), order: 0, description: dirty('Text') }],
        bookmarks: [
          {
            id: 'b1',
            url: 'https://example.org/',
            title: dirty('Imported'),
            note: dirty('Note'),
            tags: [dirty('one')],
            shelfId: 's1',
            order: 0,
            reading: { format: 'markdown-lite', text: dirty('Body'), savedAt: '2026-01-01T00:00:00.000Z' },
          },
        ],
        progress: {},
        done: {},
        notes: { b1: dirty('Mine') },
        session: {},
      },
      { now: testClock().now, idFactory: counterIds('m') },
    );
    if (!result.ok) throw new Error('migration failed');
    const { shelves, bookmarks, notes } = result.value;
    expect(shelves[0]).toMatchObject({ name: 'Class', description: 'Text' });
    expect(bookmarks[0]).toMatchObject({ title: 'Imported', note: 'Note', tags: ['one'], reading: { text: 'Body' } });
    expect(notes.b1).toBe('Mine');
  });
});

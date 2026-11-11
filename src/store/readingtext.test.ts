import { describe, expect, it } from 'vitest';
import { makeRig } from './test-helpers';

const LIMIT = 500000;
const MESSAGE = 'That text is 642,400 characters. The limit is 500,000. Remove some, or save it as two links.';

describe('a reading text over the limit', () => {
  it('is an error on readingText when a link is added, and nothing is added', () => {
    const { store } = makeRig();
    const result = store.addBookmark({ url: 'a.example.org', readingText: 'x'.repeat(642400) });
    expect(result).toEqual({ ok: false, error: { code: 'too-long', message: MESSAGE, field: 'readingText' } });
    expect(store.bookmarks()).toEqual([]);
  });

  it('is an error on readingText when a link is edited, and nothing about the link changes', () => {
    const { store } = makeRig();
    const added = store.addBookmark({ url: 'a.example.org', title: 'Kept', readingText: 'short text' });
    if (!added.ok) throw new Error('add failed');
    const before = store.get(added.value.id);
    const result = store.updateBookmark(added.value.id, { title: 'Changed', readingText: 'x'.repeat(LIMIT + 1) });
    expect(result).toMatchObject({ ok: false, error: { code: 'too-long', field: 'readingText' } });
    expect(store.get(added.value.id)).toEqual(before);
  });

  it('accepts exactly the limit', () => {
    const { store } = makeRig();
    expect(store.addBookmark({ url: 'a.example.org', readingText: 'x'.repeat(LIMIT) }).ok).toBe(true);
  });

  it('counts the text as it is saved, after hidden characters are removed', () => {
    const { store } = makeRig();
    const padded = `${'x'.repeat(LIMIT)}${'\u200B'.repeat(50)}`;
    expect(store.addBookmark({ url: 'a.example.org', readingText: padded }).ok).toBe(true);
  });

  it('is reported by an import instead of being dropped without a word', () => {
    const { store } = makeRig();
    const result = store.importLibrary(
      [
        { url: 'a.example.org', title: 'Fine', reading: { text: 'ok' } },
        { url: 'b.example.org', title: 'Too long', reading: { text: 'x'.repeat(LIMIT + 1) } },
      ],
      'merge',
    );
    if (!result.ok) throw new Error('import failed');
    expect(result.value.added).toBe(1);
    expect(result.value.skipped).toHaveLength(1);
    expect(result.value.skipped[0]).toMatchObject({ title: 'Too long', url: 'b.example.org' });
    expect(result.value.skipped[0]?.reason).toContain('500,000');
  });
});

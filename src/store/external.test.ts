import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STORAGE_KEY, createMemoryStorage, createStore } from './index';
import type { Store, StoreEvent } from './index';
import { addAll, counterIds, testClock } from './test-helpers';

const open: Store[] = [];

afterEach(() => {
  for (const store of open.splice(0)) store.destroy();
  vi.useRealTimers();
});

/** Two tabs over one storage. The first listens for storage events like a real tab does. */
function twoTabs() {
  const storage = createMemoryStorage();
  const clock = testClock();
  const mine = createStore({ storage, now: clock.now, idFactory: counterIds('mine'), syncTabs: true });
  const [a = '', b = ''] = addAll(mine, ['a.example.org', 'b.example.org']);
  const theirs = createStore({ storage, now: clock.now, idFactory: counterIds('theirs'), syncTabs: false });
  open.push(mine, theirs);
  const events: StoreEvent[] = [];
  mine.subscribe((event) => events.push(event));
  const arrives = (key: string | null = DEFAULT_STORAGE_KEY): void => {
    window.dispatchEvent(new StorageEvent('storage', { key }));
  };
  return { mine, theirs, storage, clock, events, arrives, a, b };
}

describe('changes made in another tab', () => {
  it('are announced as external when a link is added', () => {
    const { mine, theirs, events, arrives } = twoTabs();
    theirs.addBookmark({ url: 'c.example.org' });
    arrives();
    expect(events.map((event) => event.reason)).toEqual(['external']);
    expect(mine.bookmarks()).toHaveLength(3);
  });

  it.each([
    ['a link is edited', (t: Store, a: string) => t.updateBookmark(a, { title: 'Edited' })],
    ['a shelf is added', (t: Store) => t.addShelf('Another')],
    ['a link is marked read', (t: Store, a: string) => t.setDone(a, true)],
    ['a note is written', (t: Store, a: string) => t.setNote(a, 'hello')],
    ['a link is removed', (t: Store, a: string) => t.removeBookmark(a)],
  ])('are announced when %s', (_label, change) => {
    const { theirs, events, arrives, a } = twoTabs();
    change(theirs, a);
    arrives();
    expect(events.map((event) => event.reason)).toEqual(['external']);
  });

  it('are not announced when the other tab only moved its focus or read further', () => {
    const { mine, theirs, events, arrives, a, b } = twoTabs();
    theirs.setSession({ focusId: b, variant: 'oak', view: 'list' });
    theirs.setProgress(a, { block: 4, ratio: 0.5, percent: 0.6 });
    theirs.flush();
    arrives();
    expect(events).toEqual([]);
    expect(mine.progress(a)).toMatchObject({ block: 4 });
  });

  it('are not announced when nothing differs', () => {
    const { events, arrives } = twoTabs();
    arrives();
    arrives(null);
    expect(events).toEqual([]);
  });

  it('are ignored when the key belongs to something else', () => {
    const { theirs, mine, events, arrives } = twoTabs();
    theirs.addBookmark({ url: 'c.example.org' });
    arrives('another-app:library');
    expect(events).toEqual([]);
    expect(mine.bookmarks()).toHaveLength(2);
  });

  it('leave this tab with its own session', () => {
    const { mine, theirs, arrives, a, b } = twoTabs();
    mine.setSession({ focusId: a, variant: 'night' });
    theirs.setSession({ focusId: b, variant: 'oak' });
    theirs.addBookmark({ url: 'c.example.org' });
    arrives();
    expect(mine.session()).toMatchObject({ focusId: a, variant: 'night' });
  });

  it('drop session ids that the other tab removed', () => {
    const { mine, theirs, arrives, a } = twoTabs();
    mine.setSession({ focusId: a, openId: a });
    theirs.removeBookmark(a);
    arrives();
    expect(mine.session()).toMatchObject({ focusId: null, openId: null });
  });

  it('do not discard reading position that is still waiting to be written', () => {
    vi.useFakeTimers();
    const { mine, theirs, storage, arrives, a } = twoTabs();
    mine.setProgress(a, { block: 7, ratio: 0.25, percent: 0.5 });
    theirs.addBookmark({ url: 'c.example.org' });
    arrives();
    expect(mine.progress(a)).toMatchObject({ block: 7 });
    vi.advanceTimersByTime(300);
    const saved = JSON.parse(storage.getItem(DEFAULT_STORAGE_KEY) ?? '{}') as {
      bookmarks: unknown[];
      progress: Record<string, { block: number }>;
    };
    expect(saved.progress[a]?.block).toBe(7);
    expect(saved.bookmarks).toHaveLength(3);
  });
});

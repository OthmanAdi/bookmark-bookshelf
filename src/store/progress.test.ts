import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from './index';
import { addAll, makeRig } from './test-helpers';

const KEY = 'bookmark-bookshelf:library';

function storedProgress(storage: ReturnType<typeof createMemoryStorage>, id: string): unknown {
  const raw = storage.getItem(KEY);
  if (raw === null) return undefined;
  return (JSON.parse(raw) as { progress: Record<string, unknown> }).progress[id];
}

describe('progress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clamps values and stamps updatedAt', () => {
    const { store, clock } = makeRig();
    const [id = ''] = addAll(store, ['a.com']);
    store.setProgress(id, { block: -3.7, ratio: 1.8, percent: -0.2 });
    expect(store.progress(id)).toEqual({ block: 0, ratio: 1, percent: 0, updatedAt: clock.now().toISOString() });
    store.setProgress(id, { block: 12.9, ratio: 0.4, percent: Number.NaN });
    expect(store.progress(id)).toMatchObject({ block: 12, ratio: 0.4, percent: 0 });
  });

  it('ignores unknown volumes', () => {
    const { store } = makeRig();
    store.setProgress('ghost', { block: 1, ratio: 0.1, percent: 0.1 });
    expect(store.progress('ghost')).toBeUndefined();
    expect(store.snapshot().progress).toEqual({});
  });

  it('updates memory and notifies at once, but writes to storage only after the delay', () => {
    const { store, storage } = makeRig();
    const [id = ''] = addAll(store, ['a.com']);
    const events: string[] = [];
    store.subscribe((event) => events.push(event.reason));
    const setItem = vi.spyOn(storage, 'setItem');

    store.setProgress(id, { block: 1, ratio: 0.1, percent: 0.1 });
    store.setProgress(id, { block: 2, ratio: 0.2, percent: 0.2 });
    store.setProgress(id, { block: 3, ratio: 0.3, percent: 0.3 });
    expect(store.progress(id)?.block).toBe(3);
    expect(events).toEqual(['progress', 'progress', 'progress']);
    expect(setItem).not.toHaveBeenCalled();
    expect(storedProgress(storage, id)).toBeUndefined();

    vi.advanceTimersByTime(249);
    expect(setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(storedProgress(storage, id)).toMatchObject({ block: 3 });
  });

  it('honours a custom progressDelay', () => {
    const { store, storage } = makeRig({ progressDelay: 1000 });
    const [id = ''] = addAll(store, ['a.com']);
    store.setProgress(id, { block: 5, ratio: 0, percent: 0 });
    vi.advanceTimersByTime(999);
    expect(storedProgress(storage, id)).toBeUndefined();
    vi.advanceTimersByTime(1);
    expect(storedProgress(storage, id)).toMatchObject({ block: 5 });
  });

  it('flush writes immediately and cancels the timer', () => {
    const { store, storage } = makeRig();
    const [id = ''] = addAll(store, ['a.com']);
    store.setProgress(id, { block: 7, ratio: 0.5, percent: 0.5 });
    store.flush();
    expect(storedProgress(storage, id)).toMatchObject({ block: 7 });
    const setItem = vi.spyOn(storage, 'setItem');
    vi.advanceTimersByTime(1000);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('flush does nothing when nothing is pending', () => {
    const { store, storage } = makeRig();
    addAll(store, ['a.com']);
    const setItem = vi.spyOn(storage, 'setItem');
    store.flush();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('destroy flushes pending progress', () => {
    const { store, storage } = makeRig();
    const [id = ''] = addAll(store, ['a.com']);
    store.setProgress(id, { block: 9, ratio: 0.9, percent: 0.9 });
    store.destroy();
    expect(storedProgress(storage, id)).toMatchObject({ block: 9 });
  });

  it('a synchronous mutation writes pending progress with it', () => {
    const { store, storage } = makeRig();
    const [id = ''] = addAll(store, ['a.com']);
    store.setProgress(id, { block: 2, ratio: 0, percent: 0 });
    store.addShelf('Other');
    expect(storedProgress(storage, id)).toMatchObject({ block: 2 });
    const setItem = vi.spyOn(storage, 'setItem');
    vi.advanceTimersByTime(1000);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('clearProgress removes it and writes synchronously', () => {
    const { store, storage } = makeRig();
    const [id = ''] = addAll(store, ['a.com']);
    store.setProgress(id, { block: 2, ratio: 0, percent: 0 });
    store.clearProgress(id);
    expect(store.progress(id)).toBeUndefined();
    expect(storedProgress(storage, id)).toBeUndefined();
  });
});

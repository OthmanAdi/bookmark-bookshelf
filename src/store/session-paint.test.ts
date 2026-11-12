import { describe, expect, it } from 'vitest';
import { DEFAULT_STORAGE_KEY, createStore } from './index';
import { makeRig } from './test-helpers';

const SESSION_KEY = `${DEFAULT_STORAGE_KEY}:session`;

describe('the drawing in the session', () => {
  it('is absent at first, which means classic', () => {
    const { store } = makeRig();
    expect(store.session()).not.toHaveProperty('paint');
  });

  it('takes classic or studio and keeps it through a reload', () => {
    const { store, storage } = makeRig();
    store.setSession({ paint: 'studio' });
    expect(store.session().paint).toBe('studio');
    expect(createStore({ storage, syncTabs: false }).session().paint).toBe('studio');
    store.setSession({ paint: 'classic' });
    expect(createStore({ storage, syncTabs: false }).session().paint).toBe('classic');
  });

  it('ignores a drawing it does not know', () => {
    const { store } = makeRig();
    store.setSession({ paint: 'studio' });
    store.setSession({ paint: 'webgpu' as never });
    expect(store.session().paint).toBe('studio');
  });

  it('drops an unknown drawing found in storage and keeps the rest of the session', () => {
    const { store, storage } = makeRig();
    store.setSession({ view: 'list', paint: 'studio' });
    const saved = JSON.parse(storage.getItem(SESSION_KEY) ?? '{}') as Record<string, unknown>;
    storage.setItem(SESSION_KEY, JSON.stringify({ ...saved, paint: '<script>' }));
    const session = createStore({ storage, syncTabs: false }).session();
    expect(session).not.toHaveProperty('paint');
    expect(session.view).toBe('list');
  });

  it('leaves an older session without it unchanged', () => {
    const { store, storage } = makeRig();
    store.setSession({ view: 'list', variant: 'oak' });
    const before = storage.getItem(SESSION_KEY);
    const again = createStore({ storage, syncTabs: false });
    expect(again.session()).toEqual(store.session());
    expect(storage.getItem(SESSION_KEY)).toBe(before);
  });
});

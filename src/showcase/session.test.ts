import { describe, expect, it } from 'vitest';
import { readSession } from '../store/sanitize';
import { makeRig } from '../store/test-helpers';

const none = new Map<string, string>();

describe('the session view whitelist', () => {
  it('reads shelf, list and showcase', () => {
    for (const view of ['shelf', 'list', 'showcase'] as const) expect(readSession({ view }, none, none).view).toBe(view);
  });

  it('falls back to the shelf for anything else', () => {
    for (const view of ['carousel', '', 3, null, undefined]) expect(readSession({ view }, none, none).view).toBe('shelf');
  });

  it('stores showcase as the view and ignores an unknown one', () => {
    const { store } = makeRig();
    store.setSession({ view: 'showcase' });
    expect(store.session().view).toBe('showcase');
    store.setSession({ view: 'carousel' as never });
    expect(store.session().view).toBe('showcase');
  });
});

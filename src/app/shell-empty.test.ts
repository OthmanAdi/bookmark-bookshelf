import { describe, expect, it } from 'vitest';
import { emptyState } from './shell-empty';

describe('emptyState', () => {
  it('names the open shelf as the person wrote it and offers to add to it', () => {
    const state = emptyState('iOS notes');
    expect(state.message).toBe('Nothing on iOS notes yet.');
    expect(state.hint).toBe('Links you add while this shelf is open are filed here.');
    expect(state.buttons.map((entry) => entry.label)).toEqual(['Add a link to iOS notes', 'Bring links in']);
    expect(state.buttons[0]).toMatchObject({ action: 'add', solid: true });
  });

  it('speaks of all shelves when every shelf is shown', () => {
    const state = emptyState(null);
    expect(state.message).toBe('Nothing on your shelves yet.');
    expect(state.buttons.map((entry) => entry.action)).toEqual(['add', 'bring']);
  });
});

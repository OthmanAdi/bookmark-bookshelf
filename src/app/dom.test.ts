import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from './dom';

function host(): HTMLElement {
  return document.getElementById('toasts') as HTMLElement;
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.replaceChildren();
  const toasts = document.createElement('div');
  toasts.id = 'toasts';
  document.body.appendChild(toasts);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('toast', () => {
  it('shows one message at a time', () => {
    toast('First.');
    toast('Second.');
    expect(host().querySelectorAll('.bb-toast')).toHaveLength(1);
    expect(host().textContent).toBe('Second.');
  });

  it('goes away after four seconds, plus its short exit', () => {
    toast('Done.');
    vi.advanceTimersByTime(3900);
    expect(host().querySelector('.bb-toast')).not.toBeNull();
    vi.advanceTimersByTime(100);
    expect(host().querySelector('.bb-toast')?.classList.contains('is-leaving')).toBe(true);
    vi.advanceTimersByTime(200);
    expect(host().querySelector('.bb-toast')).toBeNull();
  });

  it('stays ten seconds when it carries an action', () => {
    toast('Removed.', { label: 'Undo', run: () => undefined });
    vi.advanceTimersByTime(9500);
    expect(host().querySelector('.bb-toast')?.classList.contains('is-leaving')).toBe(false);
    vi.advanceTimersByTime(600);
    expect(host().querySelector('.bb-toast')?.classList.contains('is-leaving')).toBe(true);
  });

  it('runs the action once and closes', () => {
    const run = vi.fn();
    toast('Removed.', { label: 'Undo', run });
    host().querySelector<HTMLButtonElement>('.bb-toast__action')?.click();
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(300);
    expect(host().querySelector('.bb-toast')).toBeNull();
  });

  it('waits while the pointer is over it', () => {
    toast('Hold on.');
    const item = host().querySelector('.bb-toast') as HTMLElement;
    vi.advanceTimersByTime(2000);
    item.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(20000);
    expect(host().querySelector('.bb-toast')?.classList.contains('is-leaving')).toBe(false);
    item.dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(2100);
    expect(host().querySelector('.bb-toast')?.classList.contains('is-leaving')).toBe(true);
  });

  it('waits while focus is inside it, and gives focus back when it closes', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    toast('Removed.', { label: 'Undo', run: () => undefined });
    const action = host().querySelector<HTMLButtonElement>('.bb-toast__action') as HTMLButtonElement;
    action.dispatchEvent(new FocusEvent('focusin', { bubbles: true, relatedTarget: opener }));
    action.focus();
    vi.advanceTimersByTime(30000);
    expect(host().querySelector('.bb-toast')?.classList.contains('is-leaving')).toBe(false);
    action.click();
    expect(document.activeElement).toBe(opener);
  });

  it('writes the message as text', () => {
    toast('<img src=x onerror=alert(1)>');
    expect(host().querySelector('img')).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askConfirm, closeDialog, createDialog } from './flow-dialog';
import { preferReducedMotion, tick } from './flow-test-helpers';

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('dialog shell', () => {
  it('opens with focus in the dialog and puts it back when it closes', () => {
    preferReducedMotion(true);
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const shell = createDialog({ title: 'A question' });
    const field = document.createElement('input');
    shell.body.appendChild(field);
    shell.open(field);
    expect(shell.dialog.open).toBe(true);
    expect(document.activeElement).toBe(field);
    expect(shell.dialog.getAttribute('aria-labelledby')).toBe(shell.dialog.querySelector('h2')?.id);
    shell.close();
    expect(shell.dialog.isConnected).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('fades out for a moment before it closes', () => {
    preferReducedMotion(false);
    vi.useFakeTimers();
    const shell = createDialog({ title: 'Leaving' });
    shell.open();
    shell.close();
    expect(shell.dialog.open).toBe(true);
    expect(shell.dialog.classList.contains('is-closing')).toBe(true);
    vi.advanceTimersByTime(130);
    expect(shell.dialog.open).toBe(false);
    expect(shell.dialog.classList.contains('is-closing')).toBe(false);
  });

  it('closes at once when less motion is wanted', () => {
    preferReducedMotion(true);
    const shell = createDialog({ title: 'Quiet' });
    shell.open();
    closeDialog(shell.dialog);
    expect(shell.dialog.open).toBe(false);
  });

  it('leaves through the same exit when Escape is pressed', () => {
    preferReducedMotion(false);
    vi.useFakeTimers();
    const shell = createDialog({ title: 'Escape' });
    shell.open();
    const cancel = new Event('cancel', { cancelable: true });
    shell.dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(shell.dialog.classList.contains('is-closing')).toBe(true);
    vi.advanceTimersByTime(130);
    expect(shell.dialog.open).toBe(false);
  });

  it('ignores a press that began inside and ended on the backdrop', () => {
    preferReducedMotion(true);
    const shell = createDialog({ title: 'Selecting' });
    shell.open();
    shell.dialog.querySelector('form')?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    shell.dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(shell.dialog.open).toBe(true);
  });

  it('asks before throwing away typed text on a backdrop click', async () => {
    preferReducedMotion(true);
    let typed = true;
    const shell = createDialog({ title: 'Typed', isDirty: () => typed });
    shell.open();
    shell.dialog.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    shell.dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    const ask = document.querySelectorAll('dialog[open]');
    expect(ask).toHaveLength(2);
    typed = false;
    [...(ask[1]?.querySelectorAll('button') ?? [])].find((entry) => entry.textContent === 'Keep editing')?.click();
    await tick();
    expect(shell.dialog.open).toBe(true);
  });
});

describe('askConfirm', () => {
  it('resolves true only when confirmed, and puts focus on the safe answer first', async () => {
    preferReducedMotion(true);
    const first = askConfirm({ title: 'Sure?', message: 'This cannot be undone.', confirm: 'Remove' });
    expect(document.activeElement?.textContent).toBe('Cancel');
    [...document.querySelectorAll('dialog[open] button')].find((entry) => entry.textContent === 'Remove')?.click();
    expect(await first).toBe(true);

    const second = askConfirm({ title: 'Sure?', message: 'Again.', confirm: 'Remove' });
    [...document.querySelectorAll('dialog[open] button')].find((entry) => entry.textContent === 'Cancel')?.click();
    expect(await second).toBe(false);
  });
});

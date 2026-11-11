import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendPageHereFlow } from './flow-bookmarklet';
import { mountPage, tick } from './flow-test-helpers';

beforeEach(() => {
  mountPage();
});

const dialog = (): HTMLDialogElement => document.querySelector('dialog[open]') as HTMLDialogElement;

describe('send the current page here', () => {
  it('offers the bookmarklet as a draggable link to this app', () => {
    sendPageHereFlow('https://example.org/app.html#shelf=1.d.abc');
    const link = dialog().querySelector('a.bb-bookmarklet') as HTMLAnchorElement;
    expect(link.draggable).toBe(true);
    const target = link.getAttribute('href') ?? '';
    expect(target.startsWith('javascript:')).toBe(true);
    expect(target).toContain('https://example.org/app.html');
    expect(target).not.toContain('#shelf');
    expect(document.activeElement).toBe(link);
  });

  it('says in two sentences how to use it and that nothing is saved by itself', () => {
    sendPageHereFlow('https://example.org/app.html');
    const paragraphs = [...dialog().querySelectorAll('.bb-dialog__text')].map((entry) => entry.textContent);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toContain('Drag this link to your bookmarks bar');
    expect(paragraphs[1]).toContain('Nothing is saved until you press Save');
  });

  it('does not run the bookmarklet when it is clicked in the app', () => {
    sendPageHereFlow('https://example.org/app.html');
    const link = dialog().querySelector('a.bb-bookmarklet') as HTMLAnchorElement;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(dialog().querySelector('.bb-dialog__status')?.textContent).toContain('Clicking it here does nothing');
  });

  it('copies the address, or shows it to select when copying is refused', async () => {
    const write = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    sendPageHereFlow('https://example.org/app.html');
    const copy = [...dialog().querySelectorAll('button')].find((entry) => entry.textContent === 'Copy the address instead') as HTMLButtonElement;
    copy.click();
    await tick();
    expect(write).toHaveBeenCalledTimes(1);
    expect(document.getElementById('toasts')?.textContent).toContain('Copied.');

    write.mockRejectedValueOnce(new Error('refused'));
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    copy.click();
    await tick();
    const field = dialog().querySelector('textarea.bb-bookmarklet__code') as HTMLTextAreaElement;
    expect(field.hidden).toBe(false);
    expect(field.value.startsWith('javascript:')).toBe(true);
  });

  it('closes with Done and gives focus back', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    sendPageHereFlow('https://example.org/app.html');
    [...dialog().querySelectorAll('button')].find((entry) => entry.textContent === 'Done')?.click();
    expect(document.querySelector('dialog[open]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

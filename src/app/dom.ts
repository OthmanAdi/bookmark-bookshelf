/** Tiny DOM helpers for the app shell. Text always goes in through `textContent`. */

export function must<T extends Element>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

export function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const element = make('button', className, label);
  element.type = 'button';
  element.addEventListener('click', onClick);
  return element;
}

export function option(value: string, label: string): HTMLOptionElement {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = label;
  return element;
}

const TOAST_PLAIN_MS = 4000;
const TOAST_ACTION_MS = 10000;
const TOAST_LEAVE_MS = 120;

interface ShownToast {
  item: HTMLElement;
  close(immediately: boolean): void;
}

let shownToast: ShownToast | null = null;

/**
 * Shows one short message at a time, optionally with one action such as Undo. A toast that carries an action
 * stays longer, and any toast waits while the pointer is over it or focus is inside it.
 */
export function toast(message: string, action?: { label: string; run: () => void }, lifetime?: number): void {
  const host = must<HTMLElement>('#toasts');
  shownToast?.close(true);

  const item = make('div', 'bb-toast');
  item.appendChild(make('span', 'bb-toast__text', message));

  let remaining = lifetime ?? (action ? TOAST_ACTION_MS : TOAST_PLAIN_MS);
  let startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hovered = false;
  let focused = false;
  let returnTo: HTMLElement | null = null;
  let closed = false;

  const close = (immediately: boolean): void => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    if (shownToast?.item === item) shownToast = null;
    if (item.contains(document.activeElement) && returnTo?.isConnected) returnTo.focus({ preventScroll: true });
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (immediately || still) {
      item.remove();
      return;
    }
    item.classList.add('is-leaving');
    setTimeout(() => item.remove(), TOAST_LEAVE_MS);
  };

  const run = (): void => {
    clearTimeout(timer);
    startedAt = Date.now();
    timer = setTimeout(() => close(false), remaining);
  };
  const hold = (): void => {
    clearTimeout(timer);
    remaining = Math.max(remaining - (Date.now() - startedAt), 1500);
  };
  const settle = (): void => {
    if (hovered || focused) hold();
    else run();
  };

  item.addEventListener('pointerenter', () => {
    hovered = true;
    settle();
  });
  item.addEventListener('pointerleave', () => {
    hovered = false;
    settle();
  });
  item.addEventListener('focusin', (event) => {
    if (!focused && event.relatedTarget instanceof HTMLElement) returnTo = event.relatedTarget;
    focused = true;
    settle();
  });
  item.addEventListener('focusout', (event) => {
    if (event.relatedTarget instanceof Node && item.contains(event.relatedTarget)) return;
    focused = false;
    settle();
  });

  if (action) {
    item.appendChild(
      button(action.label, 'bb-button bb-toast__action', () => {
        close(false);
        action.run();
      }),
    );
  }
  host.appendChild(item);
  shownToast = { item, close };
  run();
}

export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = make('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Puts text on the clipboard. Resolves false when the browser refuses, so the caller can offer the text to select instead. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall through to the older route, which needs a selected text field.
  }
  const field = make('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  field.remove();
  return copied;
}

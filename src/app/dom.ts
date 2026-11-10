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

/** Shows a short message, optionally with one action such as Undo. */
export function toast(message: string, action?: { label: string; run: () => void }, lifetime = 7000): void {
  const host = must<HTMLElement>('#toasts');
  const item = make('div', 'bb-toast');
  item.appendChild(make('span', 'bb-toast__text', message));
  const dismiss = (): void => item.remove();
  if (action) {
    item.appendChild(
      button(action.label, 'bb-button bb-toast__action', () => {
        action.run();
        dismiss();
      }),
    );
  }
  host.appendChild(item);
  setTimeout(dismiss, lifetime);
}

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = make('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

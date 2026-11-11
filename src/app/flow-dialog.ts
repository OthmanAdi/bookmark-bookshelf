import { button, make } from './dom';

/**
 * Dialogs the app builds in code. Each one is a native modal <dialog> built with DOM calls: a title, a
 * body that scrolls, and a row of actions that stays at the bottom. Escape closes it, a click on the
 * backdrop closes it when the dialog allows that, and focus goes back to whatever opened it.
 */

export type DialogSize = 'small' | 'medium' | 'wide';

export interface DialogOptions {
  title: string;
  size?: DialogSize;
  /** Called when a click on the backdrop should close the dialog. Return false to keep it open. */
  onBackdrop?: () => boolean;
}

export interface FlowDialog {
  readonly dialog: HTMLDialogElement;
  readonly form: HTMLFormElement;
  readonly body: HTMLElement;
  readonly actions: HTMLElement;
  /** Shows the dialog and puts focus on `focus`, or on the first control. */
  open(focus?: HTMLElement | null): void;
  close(): void;
  /** Resolves when the dialog has closed and been removed from the page. */
  readonly closed: Promise<void>;
}

let serial = 0;

/** Closes a dialog the way every dialog closes. Kept in one place so a leaving motion can be added once. */
export function closeDialog(dialog: HTMLDialogElement): void {
  if (dialog.open) dialog.close();
}

export function createDialog(options: DialogOptions): FlowDialog {
  const id = `flow-dialog-${++serial}`;
  const dialog = make('dialog', `bb-dialog bb-dialog--${options.size ?? 'medium'}`);
  dialog.setAttribute('aria-labelledby', `${id}-title`);
  const form = make('form', 'bb-dialog__form');
  form.method = 'dialog';
  form.noValidate = true;
  const heading = make('h2', 'bb-dialog__title', options.title);
  heading.id = `${id}-title`;
  const body = make('div', 'bb-dialog__body');
  const actions = make('div', 'bb-dialog__actions');
  form.append(heading, body, actions);
  dialog.appendChild(form);

  let opener: HTMLElement | null = null;
  let settle: () => void = () => undefined;
  const closed = new Promise<void>((resolve) => {
    settle = resolve;
  });

  // A press that starts inside the dialog and ends on the backdrop (selecting text, for example) is not a click on the backdrop.
  let pressedOnBackdrop = false;
  dialog.addEventListener('pointerdown', (event) => {
    pressedOnBackdrop = event.target === dialog;
  });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog || !pressedOnBackdrop) return;
    if (options.onBackdrop?.() === false) return;
    closeDialog(dialog);
  });

  dialog.addEventListener('close', () => {
    dialog.remove();
    const active = document.activeElement;
    if (opener?.isConnected && (!active || active === document.body)) opener.focus({ preventScroll: true });
    settle();
  });

  return {
    dialog,
    form,
    body,
    actions,
    closed,
    open(focus) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      document.body.appendChild(dialog);
      dialog.showModal();
      (focus ?? dialog.querySelector<HTMLElement>('input, select, textarea, button'))?.focus();
    },
    close: () => closeDialog(dialog),
  };
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirm: string;
  cancel?: string;
}

/** A small question with two answers. Resolves true only when the person confirms. */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  const shell = createDialog({ title: options.title, size: 'small' });
  let answer = false;
  shell.body.appendChild(make('p', 'bb-dialog__text', options.message));
  const cancel = button(options.cancel ?? 'Cancel', 'bb-button', () => shell.close());
  const confirm = button(options.confirm, 'bb-button bb-button--solid', () => {
    answer = true;
    shell.close();
  });
  shell.actions.append(make('span', 'bb-dialog__spacer'), cancel, confirm);
  shell.open(cancel);
  return shell.closed.then(() => answer);
}

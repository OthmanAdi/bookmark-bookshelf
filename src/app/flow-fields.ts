import { make } from './dom';

/**
 * Notes that belong to one form control: a hint that stays visible, and an error that appears under the
 * control when the store refuses a value. Both are tied to the control with `aria-describedby`.
 */

const GROUP = 'bb-field-group';

function describe(control: HTMLElement, id: string, on: boolean): void {
  const ids = new Set((control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
  if (on) ids.add(id);
  else ids.delete(id);
  if (ids.size > 0) control.setAttribute('aria-describedby', [...ids].join(' '));
  else control.removeAttribute('aria-describedby');
}

/** The element that holds a control together with its label, so notes can sit directly beneath it. */
export function groupOf(control: HTMLElement): HTMLElement {
  const label = control.closest<HTMLElement>('.bb-field');
  if (!label) return control.parentElement ?? control;
  const existing = label.parentElement;
  if (existing?.classList.contains(GROUP)) return existing;
  const group = make('div', GROUP);
  label.replaceWith(group);
  group.appendChild(label);
  return group;
}

function nameOf(control: HTMLElement): string {
  return control.getAttribute('name') ?? control.id;
}

/**
 * Finds or creates the error element for a control. An element with the id `error-<name>` that the page
 * already carries is used as it is; otherwise one is added under the control's label.
 */
export function errorElement(control: HTMLElement, existing?: HTMLElement | null): HTMLElement {
  const id = existing?.id || `error-${nameOf(control)}`;
  const found = existing ?? control.ownerDocument.getElementById(id);
  if (found) {
    found.removeAttribute('role');
    found.classList.add('bb-field__error');
    if (existing) groupOf(control).appendChild(found);
    return found;
  }
  const note = make('p', 'bb-field__error');
  note.id = id;
  note.hidden = true;
  groupOf(control).appendChild(note);
  return note;
}

/** Shows a message under the control and marks it invalid, or clears both when `message` is null. */
export function setFieldError(control: HTMLElement, message: string | null, existing?: HTMLElement | null): void {
  const note = errorElement(control, existing);
  if (message === null) {
    note.hidden = true;
    note.textContent = '';
    control.removeAttribute('aria-invalid');
    describe(control, note.id, false);
    return;
  }
  note.textContent = message;
  note.hidden = false;
  control.setAttribute('aria-invalid', 'true');
  describe(control, note.id, true);
}

/** Clears the error as soon as the person changes the value. */
export function clearErrorOnInput(control: HTMLElement, existing?: HTMLElement | null): void {
  const clear = (): void => {
    if (control.getAttribute('aria-invalid') === 'true') setFieldError(control, null, existing);
  };
  control.addEventListener('input', clear);
  control.addEventListener('change', clear);
}

/**
 * Adds a hint under a control unless the field already has one, and drops a placeholder that was
 * carrying the same instruction. Returns the hint element so its text can change.
 */
export function ensureHint(control: HTMLElement, text: string): HTMLElement {
  const group = groupOf(control);
  const present = group.querySelector<HTMLElement>('.bb-field__hint');
  if (present) return present;
  const hint = make('p', 'bb-field__hint', text);
  hint.id = `hint-${nameOf(control)}`;
  group.appendChild(hint);
  describe(control, hint.id, true);
  control.removeAttribute('placeholder');
  return hint;
}

/** Says in words that a field must be filled in, unless its label already does. */
export function markRequired(control: HTMLElement): void {
  const label = control.closest('.bb-field')?.querySelector<HTMLElement>('.bb-label');
  if (!label || /required/i.test(label.textContent ?? '')) return;
  label.appendChild(make('span', 'bb-field__required', ' (required)'));
  control.setAttribute('aria-required', 'true');
}

export interface FieldSpec {
  label: string;
  name: string;
  /** Instruction that stays visible under the control. */
  hint?: string;
}

/** A labelled control with its hint and its error place, ready to put in a dialog. */
export function buildField(control: HTMLElement, spec: FieldSpec): HTMLElement {
  control.setAttribute('name', spec.name);
  control.id = control.id || `field-${spec.name}`;
  const label = make('label', 'bb-field');
  label.appendChild(make('span', 'bb-label', spec.label));
  label.appendChild(control);
  const group = make('div', GROUP);
  group.appendChild(label);
  if (spec.hint) {
    const hint = make('p', 'bb-field__hint', spec.hint);
    hint.id = `hint-${spec.name}`;
    group.appendChild(hint);
    describe(control, hint.id, true);
  }
  const note = make('p', 'bb-field__error');
  note.id = `error-${spec.name}`;
  note.hidden = true;
  group.appendChild(note);
  clearErrorOnInput(control);
  return group;
}

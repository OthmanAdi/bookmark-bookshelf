import { beforeEach, describe, expect, it } from 'vitest';
import { clearErrorOnInput, ensureHint, errorElement, markRequired, setFieldError } from './flow-fields';

function form(): HTMLInputElement {
  document.body.replaceChildren();
  const row = document.createElement('div');
  row.className = 'bb-field-row';
  const label = document.createElement('label');
  label.className = 'bb-field';
  const caption = document.createElement('span');
  caption.className = 'bb-label';
  caption.textContent = 'Link';
  const input = document.createElement('input');
  input.name = 'url';
  input.placeholder = 'Leave empty';
  label.append(caption, input);
  row.appendChild(label);
  document.body.appendChild(row);
  return input;
}

describe('field notes', () => {
  let input: HTMLInputElement;
  beforeEach(() => {
    input = form();
  });

  it('puts an error under the field and ties it to the control', () => {
    setFieldError(input, 'Enter a web address.');
    const note = document.getElementById('error-url') as HTMLElement;
    expect(note.textContent).toBe('Enter a web address.');
    expect(note.hidden).toBe(false);
    expect(note.previousElementSibling?.tagName).toBe('LABEL');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('error-url');
  });

  it('removes the error again', () => {
    setFieldError(input, 'Enter a web address.');
    setFieldError(input, null);
    expect((document.getElementById('error-url') as HTMLElement).hidden).toBe(true);
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });

  it('clears the error when the person types', () => {
    errorElement(input);
    clearErrorOnInput(input);
    setFieldError(input, 'Enter a web address.');
    input.dispatchEvent(new Event('input'));
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('uses an error element the page already has', () => {
    const own = document.createElement('p');
    own.id = 'error-url';
    own.hidden = true;
    own.setAttribute('role', 'alert');
    document.body.appendChild(own);
    setFieldError(input, 'Nope.');
    expect(document.querySelectorAll('#error-url')).toHaveLength(1);
    expect(own.textContent).toBe('Nope.');
    expect(own.hasAttribute('role')).toBe(false);
  });

  it('keeps other descriptions on the control', () => {
    input.setAttribute('aria-describedby', 'hint-url');
    setFieldError(input, 'Nope.');
    expect(input.getAttribute('aria-describedby')).toBe('hint-url error-url');
    setFieldError(input, null);
    expect(input.getAttribute('aria-describedby')).toBe('hint-url');
  });

  it('adds one hint, outside the label, and drops the placeholder', () => {
    ensureHint(input, 'Leave this empty and the title comes from the address.');
    ensureHint(input, 'A second hint is not added.');
    expect(document.querySelectorAll('.bb-field__hint')).toHaveLength(1);
    expect(input.closest('label')?.querySelector('.bb-field__hint')).toBeNull();
    expect(input.hasAttribute('placeholder')).toBe(false);
    expect(input.getAttribute('aria-describedby')).toBe('hint-url');
  });

  it('says in words that a field is required, once', () => {
    markRequired(input);
    markRequired(input);
    expect(input.closest('label')?.textContent).toBe('Link (required)');
  });
});

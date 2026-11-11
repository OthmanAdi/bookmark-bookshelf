import { CLOTHS, PATTERNS } from '../shelf';
import type { Bookmark, BookmarkInput, Store } from '../store';
import { button, make, must, option, toast } from './dom';
import { askToDiscard, closeDialog } from './flow-dialog';
import { clearErrorOnInput, ensureHint, errorElement, groupOf, markRequired, setFieldError } from './flow-fields';
import { titleFromAddress } from './flow-title';

/**
 * Add and edit dialog. One native <dialog> with a plain form. Every rule lives
 * in the store: this file only collects values and shows the store's answer.
 */
export interface LinkPreset {
  url?: string;
  title?: string;
  text?: string;
  shelfId?: string;
}

export interface Editor {
  add(preset?: LinkPreset): void;
  edit(id: string): void;
}

const capitalise = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

export function createEditor(
  store: Store,
  onSaved: (bookmark: Bookmark, created: boolean) => void,
  onShow?: (bookmark: Bookmark) => void,
): Editor {
  const dialog = must<HTMLDialogElement>('#editor');
  const form = must<HTMLFormElement>('#editor-form');
  const title = must<HTMLElement>('#editor-title');
  const formError = must<HTMLElement>('#editor-error');
  const remove = must<HTMLButtonElement>('#editor-delete');
  const cancel = must<HTMLButtonElement>('#editor-cancel');
  const save = must<HTMLButtonElement>('#editor-save');
  const field = <T extends HTMLElement>(name: string): T => must<T>(`[name="${name}"]`, form);

  const url = field<HTMLInputElement>('url');
  const titleInput = field<HTMLInputElement>('title');
  const author = field<HTMLInputElement>('author');
  const note = field<HTMLInputElement>('note');
  const tags = field<HTMLInputElement>('tags');
  const shelf = field<HTMLSelectElement>('shelfId');
  const cloth = field<HTMLSelectElement>('cloth');
  const pattern = field<HTMLSelectElement>('pattern');
  const readingText = field<HTMLTextAreaElement>('readingText');
  const more = form.querySelector<HTMLDetailsElement>('details');

  let editingId: string | null = null;
  let untouched = '';
  let opener: HTMLElement | null = null;
  let keepOpen = false;

  cloth.replaceChildren(option('', 'Chosen for you'), ...CLOTHS.map((name) => option(name, capitalise(name))));
  pattern.replaceChildren(option('', 'Chosen for you'), ...PATTERNS.map((name) => option(name, capitalise(name))));

  url.setAttribute('autocapitalize', 'off');
  url.setAttribute('autocorrect', 'off');
  url.spellcheck = false;
  url.enterKeyHint = 'done';

  const controls: Record<string, HTMLElement> = { url, title: titleInput, author, note, tags, shelfId: shelf, cloth, pattern, readingText };
  for (const control of Object.values(controls)) {
    errorElement(control);
    clearErrorOnInput(control);
  }
  const textLabel = readingText.closest('.bb-field')?.querySelector('.bb-label');
  if (textLabel && /reading (copy|text)/i.test(textLabel.textContent ?? '')) textLabel.textContent = 'Text to read (optional)';
  markRequired(url);
  const titleHint = ensureHint(titleInput, 'Leave this empty and the title is taken from the address.');
  const showTitleHint = (): void => {
    const suggestion = titleFromAddress(url.value);
    titleHint.textContent = suggestion
      ? `Leave this empty and the title becomes “${suggestion}”.`
      : 'Leave this empty and the title is taken from the address.';
  };
  url.addEventListener('input', showTitleHint);

  const known = make('p', 'bb-field__note');
  known.id = 'note-url';
  known.hidden = true;
  const knownText = make('span');
  let knownLink: Bookmark | undefined;
  const showKnown = button('Show it', 'bb-button bb-button--quiet', async () => {
    if (!knownLink || !onShow) return;
    const target = knownLink;
    const typed = [titleInput, author, note, tags, readingText].some((control) => control.value.trim() !== '');
    if (typed && !(await askToDiscard('This link has not been saved.'))) return;
    closeDialog(dialog);
    onShow(target);
  });
  known.append(knownText, ' ', showKnown);
  groupOf(url).appendChild(known);

  function checkKnown(): void {
    knownLink = url.value.trim() === '' ? undefined : store.findByUrl(url.value, editingId ?? undefined);
    known.hidden = !knownLink;
    if (!knownLink) return;
    const shelfName = store.shelves().find((entry) => entry.id === knownLink?.shelfId)?.name ?? 'a shelf';
    knownText.textContent = `Already on ${shelfName}.`;
    showKnown.hidden = !onShow;
  }
  url.addEventListener('input', checkKnown);

  const status = form.querySelector<HTMLElement>('.bb-dialog__status') ?? make('p', 'bb-dialog__status');
  status.setAttribute('role', 'status');
  const actions = must<HTMLElement>('.bb-dialog__actions', form);
  if (!status.isConnected) actions.before(status);

  const saveMore = form.querySelector<HTMLButtonElement>('#editor-save-more') ?? button('Save and add another', 'bb-button', () => undefined);
  saveMore.type = 'button';
  saveMore.id = 'editor-save-more';
  if (!saveMore.isConnected) save.before(saveMore);
  saveMore.addEventListener('click', () => {
    keepOpen = true;
    form.requestSubmit();
  });

  function clearErrors(): void {
    formError.hidden = true;
    for (const control of Object.values(controls)) setFieldError(control, null);
  }

  function showError(message: string, fieldName?: string): void {
    clearErrors();
    const target = fieldName ? controls[fieldName] : undefined;
    if (!target) {
      formError.textContent = message;
      formError.hidden = false;
      url.focus();
      return;
    }
    if (more && more.contains(target)) more.open = true;
    setFieldError(target, message);
    target.focus();
  }

  function values(): string {
    return JSON.stringify([url, titleInput, author, note, tags, shelf, cloth, pattern, readingText].map((control) => (control as HTMLInputElement).value));
  }

  function fill(bookmark: Bookmark | undefined, preset: LinkPreset = {}): void {
    clearErrors();
    status.textContent = '';
    shelf.replaceChildren(...store.shelves().map((entry) => option(entry.id, entry.name)));
    url.value = bookmark?.url ?? preset.url ?? '';
    titleInput.value = bookmark?.title ?? preset.title ?? '';
    author.value = bookmark?.author ?? '';
    note.value = bookmark?.note ?? '';
    tags.value = bookmark?.tags.join(', ') ?? '';
    const wanted = bookmark?.shelfId ?? preset.shelfId ?? store.session().shelfId ?? store.shelves()[0]?.id ?? '';
    shelf.value = wanted;
    if (shelf.value !== wanted) shelf.value = store.shelves()[0]?.id ?? '';
    cloth.value = bookmark?.cover.cloth ?? '';
    pattern.value = bookmark?.cover.pattern ?? '';
    readingText.value = bookmark?.reading?.text ?? preset.text ?? '';
    title.textContent = bookmark ? 'Edit link' : 'Add a link';
    remove.textContent = 'Remove link';
    remove.hidden = !bookmark;
    saveMore.hidden = Boolean(bookmark);
    if (more) more.open = Boolean(bookmark);
    showTitleHint();
    checkKnown();
    untouched = values();
  }

  function collect(): BookmarkInput {
    const cover: { cloth?: string; pattern?: string } = {};
    if (cloth.value) cover.cloth = cloth.value;
    if (pattern.value) cover.pattern = pattern.value;
    return {
      url: url.value,
      title: titleInput.value.trim() || titleFromAddress(url.value) || undefined,
      author: author.value.trim() || undefined,
      note: note.value.trim() || undefined,
      tags: tags.value.split(','),
      shelfId: shelf.value || undefined,
      cover,
      readingText: readingText.value,
    };
  }

  function show(focus: HTMLElement): void {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    focus.focus();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const again = keepOpen;
    keepOpen = false;
    const input = collect();
    const result = editingId
      ? store.updateBookmark(editingId, {
          ...input,
          title: input.title ?? '',
          author: input.author ?? '',
          note: input.note ?? '',
        })
      : store.addBookmark(input);
    if (!result.ok) {
      showError(result.error.message, result.error.field);
      return;
    }
    const created = editingId === null;
    if (again && created) {
      fill(undefined, { shelfId: shelf.value });
      status.textContent = 'Saved. Add the next link.';
      url.focus();
      onSaved(result.value, created);
      return;
    }
    closeDialog(dialog);
    onSaved(result.value, created);
  });

  cancel.addEventListener('click', () => closeDialog(dialog));

  remove.addEventListener('click', () => {
    if (!editingId) return;
    const removed = store.removeBookmark(editingId);
    closeDialog(dialog);
    if (!removed) return;
    toast(`Removed ${removed.bookmark.title}.`, { label: 'Undo', run: () => store.restoreBookmark(removed) });
  });

  // A stray click on the backdrop must not throw away what was typed or pasted.
  let pressedOnBackdrop = false;
  dialog.addEventListener('pointerdown', (event) => {
    pressedOnBackdrop = event.target === dialog;
  });
  dialog.addEventListener('click', async (event) => {
    if (event.target !== dialog || !pressedOnBackdrop) return;
    if (values() === untouched) return closeDialog(dialog);
    const discard = await askToDiscard('This link has not been saved.');
    if (discard) closeDialog(dialog);
  });

  dialog.addEventListener('close', () => {
    const active = document.activeElement;
    if (opener?.isConnected && (!active || active === document.body || dialog.contains(active))) opener.focus({ preventScroll: true });
  });

  return {
    add(preset) {
      editingId = null;
      fill(undefined, preset);
      show(url);
    },
    edit(id) {
      const bookmark = store.get(id);
      if (!bookmark) return;
      editingId = id;
      fill(bookmark);
      show(titleInput);
    },
  };
}

/** One-field dialog used for naming shelves. Resolves with the text, or null when cancelled. */
export function askText(heading: string, label: string, initial: string, validate: (value: string) => string | null): Promise<string | null> {
  const dialog = must<HTMLDialogElement>('#prompt');
  const form = must<HTMLFormElement>('#prompt-form');
  const input = must<HTMLInputElement>('#prompt-input');
  const error = must<HTMLElement>('#prompt-error');
  must<HTMLElement>('#prompt-title').textContent = heading;
  must<HTMLElement>('#prompt-label').textContent = label;
  input.value = initial;
  errorElement(input, error);
  setFieldError(input, null, error);
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  return new Promise((resolve) => {
    let answer: string | null = null;
    const onSubmit = (event: Event): void => {
      event.preventDefault();
      const message = validate(input.value);
      if (message) {
        setFieldError(input, message, error);
        input.focus();
        return;
      }
      answer = input.value;
      closeDialog(dialog);
    };
    const onInput = (): void => setFieldError(input, null, error);
    const onCancel = (): void => closeDialog(dialog);
    const onClose = (): void => {
      form.removeEventListener('submit', onSubmit);
      input.removeEventListener('input', onInput);
      cancel.removeEventListener('click', onCancel);
      dialog.removeEventListener('close', onClose);
      const active = document.activeElement;
      if (opener?.isConnected && (!active || active === document.body || dialog.contains(active))) opener.focus();
      resolve(answer);
    };
    const cancel = must<HTMLButtonElement>('#prompt-cancel');
    form.addEventListener('submit', onSubmit);
    input.addEventListener('input', onInput);
    cancel.addEventListener('click', onCancel);
    dialog.addEventListener('close', onClose);
    dialog.showModal();
    input.select();
  });
}

import { CLOTHS, PATTERNS } from '../shelf';
import type { Bookmark, BookmarkInput, Store } from '../store';
import { must, option, toast } from './dom';
import { clearErrorOnInput, ensureHint, errorElement, markRequired, setFieldError } from './flow-fields';

/**
 * Add and edit dialog. One native <dialog> with a plain form. Every rule lives
 * in the store: this file only collects values and shows the store's answer.
 */
export interface Editor {
  add(): void;
  edit(id: string): void;
}

const capitalise = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

export function createEditor(store: Store, onSaved: (bookmark: Bookmark, created: boolean) => void): Editor {
  const dialog = must<HTMLDialogElement>('#editor');
  const form = must<HTMLFormElement>('#editor-form');
  const title = must<HTMLElement>('#editor-title');
  const formError = must<HTMLElement>('#editor-error');
  const remove = must<HTMLButtonElement>('#editor-delete');
  const cancel = must<HTMLButtonElement>('#editor-cancel');
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

  let editingId: string | null = null;

  cloth.replaceChildren(option('', 'Chosen for you'), ...CLOTHS.map((name) => option(name, capitalise(name))));
  pattern.replaceChildren(option('', 'Chosen for you'), ...PATTERNS.map((name) => option(name, capitalise(name))));

  const controls: Record<string, HTMLElement> = { url, title: titleInput, author, note, tags, shelfId: shelf, cloth, pattern, readingText };
  for (const control of Object.values(controls)) {
    errorElement(control);
    clearErrorOnInput(control);
  }
  markRequired(url);
  ensureHint(titleInput, 'Leave this empty and the title is taken from the address.');

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
    setFieldError(target, message);
    target.focus();
  }

  function fill(bookmark: Bookmark | undefined): void {
    clearErrors();
    shelf.replaceChildren(...store.shelves().map((entry) => option(entry.id, entry.name)));
    url.value = bookmark?.url ?? '';
    titleInput.value = bookmark?.title ?? '';
    author.value = bookmark?.author ?? '';
    note.value = bookmark?.note ?? '';
    tags.value = bookmark?.tags.join(', ') ?? '';
    shelf.value = bookmark?.shelfId ?? store.session().shelfId ?? store.shelves()[0]?.id ?? '';
    cloth.value = bookmark?.cover.cloth ?? '';
    pattern.value = bookmark?.cover.pattern ?? '';
    readingText.value = bookmark?.reading?.text ?? '';
    title.textContent = bookmark ? 'Edit volume' : 'Add a link';
    remove.hidden = !bookmark;
  }

  function collect(): BookmarkInput {
    const cover: { cloth?: string; pattern?: string } = {};
    if (cloth.value) cover.cloth = cloth.value;
    if (pattern.value) cover.pattern = pattern.value;
    return {
      url: url.value,
      title: titleInput.value.trim() || undefined,
      author: author.value.trim() || undefined,
      note: note.value.trim() || undefined,
      tags: tags.value.split(','),
      shelfId: shelf.value || undefined,
      cover,
      readingText: readingText.value,
    };
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
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
    dialog.close();
    onSaved(result.value, created);
  });

  cancel.addEventListener('click', () => dialog.close());

  remove.addEventListener('click', () => {
    if (!editingId) return;
    const removed = store.removeBookmark(editingId);
    dialog.close();
    if (!removed) return;
    toast(`Removed ${removed.bookmark.title}.`, { label: 'Undo', run: () => store.restoreBookmark(removed) });
  });

  // Closing by Escape or backdrop click must not leave a half-edited state behind.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  return {
    add() {
      editingId = null;
      fill(undefined);
      dialog.showModal();
      url.focus();
    },
    edit(id) {
      const bookmark = store.get(id);
      if (!bookmark) return;
      editingId = id;
      fill(bookmark);
      dialog.showModal();
      titleInput.focus();
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
      dialog.close();
    };
    const onInput = (): void => setFieldError(input, null, error);
    const onCancel = (): void => dialog.close();
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

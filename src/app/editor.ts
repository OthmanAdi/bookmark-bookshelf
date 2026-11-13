import { CLOTHS, listVariants, outlineOf, PATTERNS, type ShelfItem } from '../shelf';
import { type Bookmark, type BookmarkInput, type CoverSpec, defaultCover, normalizeUrl, type Store } from '../store';
import { resolveBinding } from '../studio/materials/resolve';
import { BINDING_LABELS, BINDINGS, STAMP_LABELS, STAMPS } from '../studio/types';
import { button, make, must, option, toast } from './dom';
import { createEditorPreview, type PreviewState } from './editor-preview';
import { askToDiscard, closeDialog, leaveOnEscape } from './flow-dialog';
import { clearErrorOnInput, ensureHint, errorElement, groupOf, markRequired, setFieldError } from './flow-fields';
import { titleFromAddress } from './flow-title';
import { canUseStudio, forcedColors, paintControl } from './paint-support';
import { clothColor, STAMP_TROUBLE, stampTrouble } from './stamp-reads';

/**
 * Add and edit dialog. One native <dialog> with a plain form. Every rule lives
 * in the store: this file only collects values and shows the store's answer.
 *
 * How the book looks is chosen high in the form, beside a small book that shows the choice at once.
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

/**
 * A row of radios, each a small swatch, inside a fieldset whose legend names the row. Every radio keeps
 * its name for a screen reader and as a tooltip; the name of the checked one is written beside the legend.
 */
interface SwatchGroup {
  /** The chosen name, `''` for Automatic, or undefined when the link has a name this version does not offer. */
  value(): string | undefined;
  /** Checks the radio for a name; a name that has no radio leaves every radio unchecked. */
  set(value: string | undefined): void;
  /** Gives each choice a short note, or none. A choice with a note is marked, and says it when it is checked. */
  note(of: (value: string) => string | undefined): void;
}

function swatchGroup(
  form: HTMLFormElement,
  name: 'binding' | 'stamp',
  legend: string,
  choices: ReadonlyArray<{ value: string; label: string }>,
): SwatchGroup {
  let fieldset = form.querySelector<HTMLFieldSetElement>(`#field-${name}`);
  if (!fieldset) {
    fieldset = make('fieldset', 'bb-swatches');
    fieldset.id = `field-${name}`;
    fieldset.append(make('legend', 'bb-swatches__legend', legend));
    (form.querySelector('.bb-look__choices') ?? form.querySelector('details'))?.append(fieldset);
  }
  // The checked radio says its own name and note; this line shows them to the eye.
  const chosen = make('span', 'bb-swatches__chosen');
  chosen.setAttribute('aria-hidden', 'true');
  const chosenName = make('span', 'bb-swatches__chosen-name');
  const chosenNote = make('span', 'bb-swatches__chosen-note');
  chosen.append(chosenName, chosenNote);
  const list = make('div', 'bb-swatches__list');
  const notes = make('div', 'bb-swatches__notes');
  notes.hidden = true;
  const rows = [{ value: '', label: 'Automatic' }, ...choices].map((choice) => {
    const row = make('label', 'bb-swatch');
    row.title = choice.label;
    const input = make('input', 'bb-swatch__input');
    input.type = 'radio';
    input.name = name;
    input.value = choice.value;
    const chip = make('span', 'bb-swatch__chip');
    chip.dataset[name] = choice.value || 'auto';
    chip.setAttribute('aria-hidden', 'true');
    row.append(input, chip, make('span', 'bb-swatch__name', choice.label));
    list.append(row);
    const note = make('span');
    note.id = `note-${name}-${choice.value || 'auto'}`;
    notes.append(note);
    return { input, row, note, label: choice.label };
  });
  const sync = (): void => {
    const checked = rows.find((row) => row.input.checked);
    chosenName.textContent = checked?.label ?? '';
    chosenNote.textContent = checked?.note.textContent ?? '';
  };
  list.addEventListener('change', sync);
  for (const old of fieldset.querySelectorAll('.bb-swatches__chosen, .bb-swatches__list, .bb-swatches__notes')) old.remove();
  fieldset.append(chosen, list, notes);
  return {
    value: () => rows.find((row) => row.input.checked)?.input.value,
    set(value) {
      for (const row of rows) row.input.checked = row.input.value === (value ?? '');
      sync();
    },
    note(of) {
      for (const row of rows) {
        const text = row.input.value === '' ? undefined : of(row.input.value);
        row.note.textContent = text ?? '';
        row.row.toggleAttribute('data-weak', text !== undefined);
        row.row.title = text ? `${row.label}. ${text}` : row.label;
        if (text) row.input.setAttribute('aria-describedby', row.note.id);
        else row.input.removeAttribute('aria-describedby');
      }
      sync();
    },
  };
}

/** The part of an address a cover prints as its source. */
function hostOf(address: string): string | undefined {
  try {
    return new URL(address).hostname.replace(/^www\./, '') || undefined;
  } catch {
    return undefined;
  }
}

/** The words beside the small book: where the choice shows, and why there is or is not a lit preview. */
export const LOOK_NOTES = {
  classic: 'Binding and title stamp show when the shelf is drawn in Studio.',
  noWebgl: 'Binding and title stamp show in Studio, which needs WebGL2. This browser does not offer it, so there is no lit preview.',
  forcedColors: 'Binding and title stamp show in Studio, which is not drawn in forced colours, so there is no lit preview.',
  preparing: 'Preparing the Studio preview…',
  studio: 'Lit as on your Studio shelf.',
  stopped: 'The Studio preview could not start. Your choices are still saved with the link.',
} as const;

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
  leaveOnEscape(dialog);
  let untouched = '';
  let opener: HTMLElement | null = null;
  let keepOpen = false;

  cloth.replaceChildren(option('', 'Chosen for you'), ...CLOTHS.map((name) => option(name, capitalise(name))));
  pattern.replaceChildren(option('', 'Chosen for you'), ...PATTERNS.map((name) => option(name, capitalise(name))));
  const binding = swatchGroup(form, 'binding', 'Binding', BINDINGS.map((value) => ({ value, label: BINDING_LABELS[value] })));
  const stamp = swatchGroup(form, 'stamp', 'Title stamp', STAMPS.map((value) => ({ value, label: STAMP_LABELS[value] })));

  /* ---------- the small book beside the choices ---------- */

  const lookStage = form.querySelector<HTMLElement>('#look-stage');
  const lookNote = form.querySelector<HTMLElement>('#hint-materials');
  const lookSwitch = form.querySelector<HTMLButtonElement>('#look-studio');
  const reduced = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const lookOf = (): { variant: string; aspect: number } => {
    const looks = listVariants();
    const look = looks.find((entry) => entry.name === document.documentElement.dataset.variant) ?? looks[0];
    return { variant: look?.name ?? 'paper', aspect: look ? look.geometry.coverWidth / look.geometry.bookHeight : 0.68 };
  };

  function sayLook(state: PreviewState): void {
    if (!lookNote) return;
    let words: string = LOOK_NOTES[state];
    let offer = false;
    if (state === 'classic') {
      if (forcedColors()) words = LOOK_NOTES.forcedColors;
      else if (!canUseStudio()) words = LOOK_NOTES.noWebgl;
      // Studio is one press away, and the shell knows how to switch to it.
      else offer = paintControl() !== undefined;
    }
    if (lookNote.textContent !== words) lookNote.textContent = words;
    if (lookSwitch) lookSwitch.hidden = !offer;
  }

  const preview = lookStage ? createEditorPreview({ stage: lookStage, look: lookOf, reduced, onState: sayLook }) : null;

  /** The link as the form has it right now, saved or not, as the shelf would draw it. */
  function draft(): ShelfItem {
    const stored = editingId ? store.get(editingId) : undefined;
    const address = normalizeUrl(url.value);
    const base = stored?.cover ?? defaultCover(address.ok ? address.value : url.value.trim());
    const chosenBinding = binding.value();
    const chosenStamp = stamp.value();
    return {
      id: stored?.id ?? 'editor-draft',
      title: titleInput.value.trim() || titleFromAddress(url.value) || 'Untitled',
      source: hostOf(address.ok ? address.value : url.value.trim()),
      author: author.value.trim() || undefined,
      cloth: cloth.value || base.cloth,
      pattern: pattern.value || base.pattern,
      seed: base.seed,
      binding: chosenBinding === undefined ? base.binding : chosenBinding || undefined,
      stamp: chosenStamp === undefined ? base.stamp : chosenStamp || undefined,
      // A link with a text prints the shape of that text on its cover.
      outline: readingText.value.trim() ? outlineOf(readingText.value) : undefined,
    };
  }

  /** Redraws the small book and says which stamps would be hard to read on the cover as it now is. */
  function showLook(turn: boolean): void {
    const item = draft();
    const colour = clothColor(dialog, item.cloth ?? '');
    const bound = resolveBinding(item.binding, Math.abs(Math.floor(item.seed ?? 0)), lookOf().variant);
    stamp.note((value) => {
      const trouble = stampTrouble(value, bound, colour);
      return trouble ? STAMP_TROUBLE[trouble] : undefined;
    });
    preview?.show(item, turn);
  }

  function openLook(): void {
    const lit = paintControl()?.current() === 'studio' && canUseStudio();
    if (preview) preview.open(lit);
    else sayLook('classic');
    showLook(false);
  }

  let typing: number | undefined;
  form.addEventListener('change', (event) => {
    // A swatch or a cloth is a change to look at: the book turns once. Leaving a text field is not.
    const target = event.target;
    showLook(target instanceof HTMLSelectElement || (target instanceof HTMLInputElement && target.type === 'radio'));
  });
  form.addEventListener('input', (event) => {
    const target = event.target;
    if (target instanceof HTMLSelectElement || (target instanceof HTMLInputElement && target.type === 'radio')) return;
    window.clearTimeout(typing);
    typing = window.setTimeout(() => showLook(false), 250);
  });

  lookSwitch?.addEventListener('click', () => {
    const control = paintControl();
    if (!control) return;
    control.choose('studio');
    if (control.current() !== 'studio') return;
    // The button goes away with the press: focus moves on to the choices it was offered for.
    (form.querySelector<HTMLInputElement>('input[name="binding"]:checked') ?? form.querySelector<HTMLInputElement>('input[name="binding"]'))?.focus();
    openLook();
  });

  /** Marks the dialog while more of the form lies below the fold, so the bar over the buttons can say so. */
  const syncMore = (): void => {
    dialog.toggleAttribute('data-more', dialog.scrollHeight - dialog.scrollTop - dialog.clientHeight > 8);
  };
  dialog.addEventListener('scroll', syncMore, { passive: true });
  window.addEventListener('resize', syncMore);
  more?.addEventListener('toggle', syncMore);

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
    const typed = [url, titleInput, author, note, tags, shelf, cloth, pattern, readingText].map((control) => (control as HTMLInputElement).value);
    return JSON.stringify([...typed, binding.value() ?? null, stamp.value() ?? null]);
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
    binding.set(bookmark?.cover.binding);
    stamp.set(bookmark?.cover.stamp);
    readingText.value = bookmark?.reading?.text ?? preset.text ?? '';
    title.textContent = bookmark ? 'Edit link' : 'Add a link';
    remove.textContent = 'Remove link';
    remove.hidden = !bookmark;
    saveMore.hidden = Boolean(bookmark);
    if (more) more.open = Boolean(bookmark);
    showTitleHint();
    checkKnown();
    untouched = values();
    // Saving and adding another fills the open form again: the small book follows.
    if (dialog.open) showLook(false);
  }

  function collect(): BookmarkInput {
    const cover: Partial<CoverSpec> = {};
    if (cloth.value) cover.cloth = cloth.value;
    if (pattern.value) cover.pattern = pattern.value;
    // Automatic is an empty name, which removes the choice. A name with no radio here is left as it is.
    const chosenBinding = binding.value();
    const chosenStamp = stamp.value();
    if (chosenBinding !== undefined) cover.binding = chosenBinding;
    if (chosenStamp !== undefined) cover.stamp = chosenStamp;
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
    openLook();
    syncMore();
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
    window.clearTimeout(typing);
    // The small book gives back its WebGL context with the dialog.
    preview?.close();
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
  leaveOnEscape(dialog);

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

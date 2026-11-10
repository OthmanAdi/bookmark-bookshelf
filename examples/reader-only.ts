/**
 * Partial composition: reader only.
 * No shelf, no motion, no store. Progress lives in sessionStorage under one key.
 */
import '../src/styles/base.css';
import { mountReader, type ReaderDoc, type ReaderHandle, type ReaderProgress } from '../src/reader';

const STORAGE_KEY = 'bookmark-bookshelf:example:reader-only';

const slowReading = `## Why read slowly

Reading slowly is a way of paying attention, not a failure to keep up. A page read in a hurry leaves a summary behind. A page read at walking pace leaves questions, and the questions are usually what you wanted from the text in the first place.

A few habits make the pace easier to keep:

- Read one section, then look away for a moment before the next.
- Stop at a sentence you did not expect and read it again.
- Write down a single line about what you just read.
- Close the text when your attention has gone, and return later.

None of this needs special equipment. It needs a quiet corner, a little time, and permission to be unfinished. A text you have returned to three times is often better known than one you finished once.`;

const textDoc: ReaderDoc = {
  id: 'example-slow-reading',
  title: 'Why read slowly',
  url: 'https://example.org/reading-slowly',
  author: 'Example text',
  text: slowReading,
};

const linkDoc: ReaderDoc = {
  id: 'example-link-only',
  title: 'A link without text',
  url: 'https://example.org/only-a-link',
};

interface Saved {
  docId: string | null;
  position: ReaderProgress | null;
}

function load(): Saved {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return { docId: null, position: null, ...(JSON.parse(raw) as Partial<Saved>) };
  } catch {
    // Storage can be blocked or hold something else; start fresh.
  }
  return { docId: null, position: null };
}

function save(next: Saved): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Without storage the example still works, it just forgets on reload.
  }
}

const host = document.querySelector<HTMLElement>('#reader')!;
const page = document.querySelector<HTMLElement>('#page')!;
const textButton = document.querySelector<HTMLButtonElement>('#open-text')!;
const linkButton = document.querySelector<HTMLButtonElement>('#open-link')!;

let state = load();
let handle: ReaderHandle | null = null;
let opener: HTMLButtonElement = textButton;
// The saved text replaces the document text in memory only.
const docs = new Map<string, ReaderDoc>([
  [textDoc.id, textDoc],
  [linkDoc.id, linkDoc],
]);

function openReader(doc: ReaderDoc, trigger: HTMLButtonElement): void {
  if (handle) return;
  opener = trigger;
  const current = docs.get(doc.id) ?? doc;
  const restore = state.docId === doc.id ? state.position : null;
  handle = mountReader(host, {
    doc: current,
    ...(restore ? { progress: restore } : {}),
    onProgress: (position) => {
      state = { docId: doc.id, position };
      save(state);
    },
    onClose: closeReader,
    onSaveText: (text) => {
      docs.set(doc.id, { ...current, text });
    },
  });
  handle.setReveal(1);
  page.inert = true;
  state = { docId: doc.id, position: restore };
  save(state);
  handle.focus();
}

function closeReader(): void {
  if (!handle) return;
  handle.destroy();
  handle = null;
  page.inert = false;
  opener.focus();
}

textButton.addEventListener('click', () => openReader(textDoc, textButton));
linkButton.addEventListener('click', () => openReader(linkDoc, linkButton));

/**
 * Partial composition: store only.
 * No shelf, no reader, no motion. Storage is in memory, so nothing outlives the tab.
 */
import '../src/styles/base.css';
import './example.css';
import { createMemoryStorage, createStore } from '../src/store';

const store = createStore({ storage: createMemoryStorage() });

const form = document.querySelector<HTMLFormElement>('#add-form')!;
const urlInput = form.elements.namedItem('url') as HTMLInputElement;
const titleInput = form.elements.namedItem('title') as HTMLInputElement;
const error = document.querySelector<HTMLElement>('#error')!;
const list = document.querySelector<HTMLElement>('#list')!;
const json = document.querySelector<HTMLElement>('#json')!;
const removeLast = document.querySelector<HTMLButtonElement>('#remove-last')!;

function render(): void {
  const bookmarks = store.bookmarks();
  const rows = bookmarks.map((bookmark) => {
    const row = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = bookmark.title;
    const link = document.createElement('small');
    link.textContent = bookmark.url;
    row.append(title, link);
    return row;
  });
  list.replaceChildren(...rows);
  removeLast.disabled = bookmarks.length === 0;
  json.textContent = store.exportLibrary();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  const result = store.addBookmark({ url: urlInput.value, ...(title ? { title } : {}) });
  if (!result.ok) {
    error.textContent = result.error.message;
    urlInput.focus();
    return;
  }
  error.textContent = '';
  form.reset();
  urlInput.focus();
});

removeLast.addEventListener('click', () => {
  const last = store.bookmarks().at(-1);
  if (last) store.removeBookmark(last.id);
});

store.subscribe(render);
render();

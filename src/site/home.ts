import '../styles/base.css';
import '../app/app.css';
import './home.css';
import { createBookshelf } from '../app/bookshelf';
import { button, make, must } from '../app/dom';
import { sampleLibrary } from '../data/sample-library';
import { listVariants } from '../shelf';
import { createMemoryStorage, createStore, type Bookmark } from '../store';

/**
 * Homepage: the real composition on an in-memory store, so trying it here
 * never touches the library kept by the app.
 */
const store = createStore({ storage: createMemoryStorage(), seed: () => sampleLibrary(), syncTabs: false });

const looks = must<HTMLElement>('#looks');

const bookshelf = createBookshelf({
  store,
  shelfHost: must<HTMLElement>('#shelf'),
  readerHost: must<HTMLElement>('#reader-host'),
  background: [must<HTMLElement>('#page')],
  label: 'Sample shelf',
  onFocusChange: (bookmark) => renderActions(bookmark),
});

function renderActions(bookmark: Bookmark | undefined): void {
  const host = bookshelf.shelf.actions;
  if (!bookmark) {
    host.replaceChildren();
    return;
  }
  const primary = bookmark.reading
    ? button('Read this one', 'bb-button bb-button--solid', () => void bookshelf.open(bookmark.id))
    : button('Add reading text', 'bb-button bb-button--solid', () => void bookshelf.open(bookmark.id, { editCopy: true }));
  const original = make('a', 'bb-button', 'Open original');
  original.href = bookmark.url;
  original.target = '_blank';
  original.rel = 'noopener noreferrer';
  original.setAttribute('aria-label', `Open original of ${bookmark.title} in a new tab`);
  host.replaceChildren(primary, original);
}

function renderLooks(): void {
  const active = bookshelf.shelf.variant.name;
  looks.replaceChildren(
    ...listVariants().map((variant) => {
      const choice = button(variant.label, 'bb-tab', () => {
        bookshelf.setVariant(variant.name);
        renderLooks();
      });
      choice.setAttribute('aria-pressed', String(variant.name === active));
      choice.title = variant.summary;
      return choice;
    }),
  );
}

store.subscribe((event) => {
  if (event.reason === 'progress' && !bookshelf.isOpen()) renderActions(bookshelf.current());
});

renderLooks();
renderActions(bookshelf.current());

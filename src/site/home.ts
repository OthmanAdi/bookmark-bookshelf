import '../styles/base.css';
import '../app/app.css';
import './home.css';
import { createBookshelf, hostnameOf } from '../app/bookshelf';
import { button, must } from '../app/dom';
import { sampleLibrary } from '../data/sample-library';
import { listVariants } from '../shelf';
import { createMemoryStorage, createStore, type Bookmark } from '../store';

/**
 * Homepage: the real composition on an in-memory store, so trying it here
 * never touches the library kept by the app.
 */
const store = createStore({ storage: createMemoryStorage(), seed: () => sampleLibrary(), syncTabs: false });

const looks = must<HTMLElement>('#looks');
const prev = must<HTMLButtonElement>('#prev');
const next = must<HTMLButtonElement>('#next');
const read = must<HTMLButtonElement>('#read');
const captionTitle = must<HTMLElement>('#caption-title');
const captionMeta = must<HTMLElement>('#caption-meta');

const bookshelf = createBookshelf({
  store,
  shelfHost: must<HTMLElement>('#shelf'),
  readerHost: must<HTMLElement>('#reader-host'),
  background: [must<HTMLElement>('#page')],
  label: 'Example shelf',
  caption: false,
  arrows: false,
  onFocusChange: (bookmark) => renderCaption(bookmark),
});

/** The same words the app uses for the primary action on a link. */
function primaryLabel(bookmark: Bookmark): string {
  if (!bookmark.reading) return 'Add text';
  const percent = store.progress(bookmark.id)?.percent ?? 0;
  if (store.isDone(bookmark.id) || percent >= 99) return 'Read again';
  if (percent > 0) return `Resume at ${Math.round(percent)}%`;
  return 'Read';
}

function renderCaption(bookmark: Bookmark | undefined): void {
  read.hidden = !bookmark;
  if (!bookmark) {
    captionTitle.textContent = '';
    captionMeta.textContent = '';
    return;
  }
  captionTitle.textContent = bookmark.title;
  captionMeta.textContent = bookmark.note || hostnameOf(bookmark.url);
  captionMeta.classList.toggle('is-note', Boolean(bookmark.note));
  read.textContent = primaryLabel(bookmark);
  read.setAttribute('aria-label', `${read.textContent}: ${bookmark.title}`);
}

prev.addEventListener('click', () => bookshelf.motion.step(-1));
next.addEventListener('click', () => bookshelf.motion.step(1));
read.addEventListener('click', () => {
  const bookmark = bookshelf.current();
  if (bookmark) void bookshelf.open(bookmark.id, { editCopy: !bookmark.reading });
});
prev.hidden = false;
next.hidden = false;

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
  if (event.reason === 'progress' && !bookshelf.isOpen()) renderCaption(bookshelf.current());
});

renderLooks();
renderCaption(bookshelf.current());

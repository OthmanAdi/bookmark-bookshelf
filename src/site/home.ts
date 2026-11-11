import '../styles/base.css';
import './home.css';
import { createBookshelf, hostnameOf } from '../app/bookshelf';
import { make, must } from '../app/dom';
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

/** Each look shows its name and what it looks like, built once so focus stays put while switching. */
const lookButtons = listVariants().map((variant) => {
  const choice = make('button', 'bb-look');
  choice.type = 'button';
  choice.dataset.look = variant.name;
  choice.append(make('span', 'bb-look__name', variant.label), make('span', 'bb-look__summary', variant.summary));
  choice.addEventListener('click', () => chooseLook(variant.name));
  return choice;
});
looks.replaceChildren(...lookButtons);

function syncLooks(): void {
  const active = bookshelf.shelf.variant.name;
  for (const choice of lookButtons) choice.setAttribute('aria-pressed', String(choice.dataset.look === active));
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** The whole page cross-fades from one look to the next, so nothing is seen being rebuilt. */
function chooseLook(name: string): void {
  if (name === bookshelf.shelf.variant.name) return;
  const apply = (): void => {
    bookshelf.setVariant(name);
    syncLooks();
  };
  if (reducedMotion.matches || typeof document.startViewTransition !== 'function') apply();
  else document.startViewTransition(apply);
}

store.subscribe((event) => {
  if (event.reason === 'progress' && !bookshelf.isOpen()) renderCaption(bookshelf.current());
});

syncLooks();
renderCaption(bookshelf.current());

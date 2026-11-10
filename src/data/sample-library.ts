import type { Bookmark, LibraryV1, Progress, Shelf } from '../store/types';
import { SAMPLE_TEXTS } from './sample-texts';

export const SAMPLE_TEXT_NOTICE =
  'The sample reading copies are original notes written for this project and are not excerpts of the linked pages.';

interface SampleSpec {
  id: string;
  shelfId: string;
  url: string;
  title: string;
  author?: string;
  note: string;
  tags: string[];
  cloth: string;
  pattern: string;
  seed: number;
  /** Minutes before `now` that the bookmark was added. Fixed, so output is deterministic. */
  ageMinutes: number;
  /** Whether a reading copy exists in SAMPLE_TEXTS under the same id. */
  hasText: boolean;
}

const DAY = 24 * 60;

const SHELVES: ReadonlyArray<Pick<Shelf, 'id' | 'name'>> = [
  { id: 'shelf-reading', name: 'Reading list' },
  { id: 'shelf-craft', name: 'Craft' },
  { id: 'shelf-reference', name: 'Reference' },
];

/** Listed in shelf order, then in position order inside each shelf. */
const SPECS: ReadonlyArray<SampleSpec> = [
  {
    id: 'bm-tsundoku',
    shelfId: 'shelf-reading',
    url: 'https://en.wikipedia.org/wiki/Tsundoku',
    title: 'On Piles of Unread Books',
    author: "Reader's notes",
    note: 'Saved for a kind name for the stack beside the bed.',
    tags: ['reading', 'habits'],
    cloth: 'ink',
    pattern: 'arcs',
    seed: 1101,
    ageMinutes: 58 * DAY + 190,
    hasText: true,
  },
  {
    id: 'bm-commonplace-book',
    shelfId: 'shelf-reading',
    url: 'https://en.wikipedia.org/wiki/Commonplace_book',
    title: 'Keeping a Commonplace Book',
    author: "Reader's notes",
    note: 'Saved as a model for a notebook of passages worth keeping.',
    tags: ['notes', 'reading'],
    cloth: 'rust',
    pattern: 'bars',
    seed: 2207,
    ageMinutes: 53 * DAY + 410,
    hasText: true,
  },
  {
    id: 'bm-marginalia',
    shelfId: 'shelf-reading',
    url: 'https://en.wikipedia.org/wiki/Marginalia',
    title: 'Notes in the Margin',
    note: 'Saved to decide which marks are worth making on a page.',
    tags: ['annotation', 'reading'],
    cloth: 'bone',
    pattern: 'dots',
    seed: 3313,
    ageMinutes: 47 * DAY + 75,
    hasText: true,
  },
  {
    id: 'bm-link-rot',
    shelfId: 'shelf-reading',
    url: 'https://en.wikipedia.org/wiki/Link_rot',
    title: 'When Links Quietly Vanish',
    note: 'Saved as the reason this shelf keeps a reading copy beside each link.',
    tags: ['links', 'preservation'],
    cloth: 'moss',
    pattern: 'waves',
    seed: 4421,
    ageMinutes: 41 * DAY + 520,
    hasText: true,
  },
  {
    id: 'bm-internet-archive',
    shelfId: 'shelf-reading',
    url: 'https://archive.org/',
    title: 'A Library of Snapshots',
    note: 'Saved as the place to look when an old address stops answering.',
    tags: ['archive'],
    cloth: 'plum',
    pattern: 'tiles',
    seed: 5527,
    ageMinutes: 36 * DAY + 260,
    hasText: false,
  },
  {
    id: 'bm-pointer-events',
    shelfId: 'shelf-craft',
    url: 'https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events',
    title: 'Pointer Events, a Field Guide',
    author: 'Field notes',
    note: 'Saved for the drag handling that moves a volume along the shelf.',
    tags: ['input', 'gestures'],
    cloth: 'teal',
    pattern: 'rays',
    seed: 6631,
    ageMinutes: 33 * DAY + 330,
    hasText: true,
  },
  {
    id: 'bm-transform-style',
    shelfId: 'shelf-craft',
    url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/transform-style',
    title: 'Depth Without a Game Engine',
    note: 'Saved to remember what keeps the books looking solid when they turn.',
    tags: ['css', '3d'],
    cloth: 'ochre',
    pattern: 'arcs',
    seed: 7741,
    ageMinutes: 29 * DAY + 95,
    hasText: true,
  },
  {
    id: 'bm-reduced-motion',
    shelfId: 'shelf-craft',
    url: 'https://web.dev/articles/prefers-reduced-motion',
    title: 'Motion That Can Rest',
    note: 'Saved as the checklist for the calm version of every animation.',
    tags: ['motion', 'accessibility'],
    cloth: 'slate',
    pattern: 'waves',
    seed: 8851,
    ageMinutes: 24 * DAY + 470,
    hasText: true,
  },
  {
    id: 'bm-aria-patterns',
    shelfId: 'shelf-craft',
    url: 'https://www.w3.org/WAI/ARIA/apg/',
    title: 'A Pattern Book for Widgets',
    note: 'Saved for the keyboard behavior of the shelf and the reader.',
    tags: ['accessibility', 'patterns'],
    cloth: 'ink',
    pattern: 'tiles',
    seed: 9967,
    ageMinutes: 20 * DAY + 150,
    hasText: true,
  },
  {
    id: 'bm-web-storage',
    shelfId: 'shelf-craft',
    url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API',
    title: 'Small Drawers in the Browser',
    note: 'Saved for the rules about keeping a library in local storage.',
    tags: ['storage', 'browser'],
    cloth: 'moss',
    pattern: 'bars',
    seed: 10079,
    ageMinutes: 16 * DAY + 360,
    hasText: true,
  },
  {
    id: 'bm-uri-syntax',
    shelfId: 'shelf-reference',
    url: 'https://www.rfc-editor.org/rfc/rfc3986',
    title: 'The Shape of a URL',
    note: 'Saved as the authority on what counts as a valid address.',
    tags: ['urls', 'standards'],
    cloth: 'bone',
    pattern: 'rays',
    seed: 11113,
    ageMinutes: 12 * DAY + 40,
    hasText: true,
  },
  {
    id: 'bm-wcag',
    shelfId: 'shelf-reference',
    url: 'https://www.w3.org/TR/WCAG22/',
    title: 'Success Criteria, Collected',
    note: 'Saved to check the contrast and target sizes of the covers.',
    tags: ['accessibility', 'standards'],
    cloth: 'plum',
    pattern: 'dots',
    seed: 12227,
    ageMinutes: 9 * DAY + 300,
    hasText: false,
  },
  {
    id: 'bm-shelfmark',
    shelfId: 'shelf-reference',
    url: 'https://en.wikipedia.org/wiki/Shelfmark',
    title: 'Where a Book Lives',
    note: 'Saved for the idea of an address that follows the order of the shelf.',
    tags: ['libraries', 'order'],
    cloth: 'rust',
    pattern: 'arcs',
    seed: 13331,
    ageMinutes: 6 * DAY + 120,
    hasText: true,
  },
  {
    id: 'bm-bookbinding',
    shelfId: 'shelf-reference',
    url: 'https://en.wikipedia.org/wiki/Bookbinding',
    title: 'How a Book Holds Together',
    note: 'Saved for the names of the parts a cover is drawn from.',
    tags: ['craft', 'books'],
    cloth: 'ochre',
    pattern: 'tiles',
    seed: 14447,
    ageMinutes: 3 * DAY + 430,
    hasText: true,
  },
];

function isoBefore(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

/**
 * A fresh sample library on every call. Ids are stable, dates are fixed offsets
 * before `now` (all within the previous 60 days), and nothing is random.
 */
export function sampleLibrary(now: Date = new Date()): LibraryV1 {
  const shelves: Shelf[] = SHELVES.map((shelf, order) => ({ id: shelf.id, name: shelf.name, order }));

  const nextOrder = new Map<string, number>();
  const bookmarks: Bookmark[] = SPECS.map((spec) => {
    const order = nextOrder.get(spec.shelfId) ?? 0;
    nextOrder.set(spec.shelfId, order + 1);
    const addedAt = isoBefore(now, spec.ageMinutes);
    const text = spec.hasText ? SAMPLE_TEXTS[spec.id] : undefined;
    const bookmark: Bookmark = {
      id: spec.id,
      url: spec.url,
      title: spec.title,
      note: spec.note,
      tags: [...spec.tags],
      shelfId: spec.shelfId,
      order,
      addedAt,
      updatedAt: addedAt,
      cover: { cloth: spec.cloth, pattern: spec.pattern, seed: spec.seed },
    };
    if (spec.author !== undefined) bookmark.author = spec.author;
    if (text !== undefined) bookmark.reading = { format: 'markdown-lite', text, savedAt: addedAt };
    return bookmark;
  });

  const progress: Record<string, Progress> = {
    'bm-tsundoku': { block: 8, ratio: 0.35, percent: 0.34, updatedAt: isoBefore(now, 2 * DAY + 90) },
    'bm-pointer-events': { block: 9, ratio: 0.36, percent: 0.72, updatedAt: isoBefore(now, 5 * DAY + 240) },
  };

  return {
    format: 'bookmark-bookshelf',
    version: 1,
    shelves,
    bookmarks,
    progress,
    session: { shelfId: null, focusId: 'bm-tsundoku', openId: null, view: 'shelf', variant: 'paper' },
  };
}

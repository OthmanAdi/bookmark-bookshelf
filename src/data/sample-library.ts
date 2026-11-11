import type { Bookmark, LibraryV2, Shelf } from '../store/types';
import { SAMPLE_TEXTS } from './sample-texts';

/** Shown with an example text in the reader, so nobody takes it for the page the link points to. */
export const SAMPLE_TEXT_NOTICE = 'Example text written for this app. It is not the linked page.';

interface ExampleShelf {
  id: string;
  name: string;
  description?: string;
  author?: string;
  /** Days after `now`, so a fresh library never opens on a due date that has already passed. */
  dueInDays?: number;
}

interface ExampleLink {
  id: string;
  shelfId: string;
  url: string;
  title: string;
  author?: string;
  note?: string;
  tags?: readonly string[];
  required?: false;
  minutes?: number;
  cloth: string;
  pattern: string;
  seed: number;
  /** Minutes before `now` that the link was added. Fixed, so output is deterministic. */
  ageMinutes: number;
}

const DAY = 24 * 60;

const HOMEWORK = 'example-shelf-homework';
const READING = 'example-shelf-reading';
const LOOKUPS = 'example-shelf-lookups';

const SHELVES: readonly ExampleShelf[] = [
  {
    id: HOMEWORK,
    name: 'Homework: how the web works',
    author: 'Your teacher (example)',
    description:
      'Read these in order before the due date. The two MDN pages are short, and the rest of the week builds on them. Links marked optional are extras for anyone who wants more. Bring your answer to the Wayback Machine task to class on paper.',
    dueInDays: 9,
  },
  { id: READING, name: 'Reading list' },
  { id: LOOKUPS, name: 'Things I look up' },
];

/** Listed in shelf order, then in position order inside each shelf. */
const LINKS: readonly ExampleLink[] = [
  {
    id: 'example-what-is-a-url',
    shelfId: HOMEWORK,
    url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Howto/Web_mechanics/What_is_a_URL',
    title: 'What is a URL?',
    note: 'Start here. We’ll use the names of these parts all week.',
    tags: ['urls', 'basics'],
    cloth: 'ink',
    pattern: 'arcs',
    seed: 1201,
    ageMinutes: 2 * DAY + 300,
  },
  {
    id: 'example-web-storage-api',
    shelfId: HOMEWORK,
    url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API',
    title: 'Web Storage API',
    note: 'Keep the browser console open while you read and try things as you go.',
    tags: ['browser', 'storage'],
    cloth: 'teal',
    pattern: 'bars',
    seed: 2309,
    ageMinutes: 2 * DAY + 296,
  },
  {
    id: 'example-link-rot',
    shelfId: HOMEWORK,
    url: 'https://en.wikipedia.org/wiki/Link_rot',
    title: 'Link rot',
    note: 'Read the opening and the section on prevention and detection. Skim the rest.',
    tags: ['links', 'archives'],
    minutes: 12,
    cloth: 'rust',
    pattern: 'waves',
    seed: 3413,
    ageMinutes: 2 * DAY + 292,
  },
  {
    id: 'example-wayback-machine',
    shelfId: HOMEWORK,
    url: 'https://web.archive.org/',
    title: 'Wayback Machine',
    note: 'Task: find a website you use as it looked at least ten years ago. Write two sentences on what changed.',
    minutes: 20,
    cloth: 'slate',
    pattern: 'dots',
    seed: 4519,
    ageMinutes: 2 * DAY + 288,
  },
  {
    id: 'example-rfc-3986',
    shelfId: HOMEWORK,
    url: 'https://www.rfc-editor.org/info/rfc3986/',
    title: 'RFC 3986: Uniform Resource Identifier (URI): Generic Syntax',
    author: 'T. Berners-Lee, R. Fielding, L. Masinter',
    note: 'Optional and dry. Section 3 draws the parts of an address as a small diagram.',
    tags: ['urls', 'standards'],
    required: false,
    minutes: 25,
    cloth: 'bone',
    pattern: 'rays',
    seed: 5623,
    ageMinutes: 2 * DAY + 284,
  },
  {
    id: 'example-langzeitarchivierung',
    shelfId: HOMEWORK,
    url: 'https://de.wikipedia.org/wiki/Langzeitarchivierung',
    title: 'Langzeitarchivierung',
    note: 'Zusatz für alle, die lieber auf Deutsch lesen.',
    required: false,
    minutes: 15,
    cloth: 'moss',
    pattern: 'tiles',
    seed: 6737,
    ageMinutes: 2 * DAY + 280,
  },
  {
    id: 'example-commonplace-book',
    shelfId: READING,
    url: 'https://en.wikipedia.org/wiki/Commonplace_book',
    title: 'Commonplace book',
    note: 'Started mine on squared paper. Still going.',
    tags: ['notes', 'reading'],
    cloth: 'plum',
    pattern: 'tiles',
    seed: 7841,
    ageMinutes: 61 * DAY + 410,
  },
  {
    id: 'example-tsundoku',
    shelfId: READING,
    url: 'https://en.wikipedia.org/wiki/Tsundoku',
    title: 'Tsundoku',
    note: 'There’s a word for the pile next to my bed. Of course there is.',
    tags: ['reading'],
    cloth: 'ochre',
    pattern: 'dots',
    seed: 8951,
    ageMinutes: 74 * DAY + 95,
  },
  {
    id: 'example-attention',
    shelfId: READING,
    url: 'https://plato.stanford.edu/entries/attention/',
    title: 'Attention',
    author: 'Christopher Mole',
    note: 'Long. Sections 1 and 2 on a slow Sunday, the rest maybe never.',
    tags: ['attention'],
    cloth: 'slate',
    pattern: 'rays',
    seed: 10061,
    ageMinutes: 33 * DAY + 520,
  },
  {
    id: 'example-24-hours-a-day',
    shelfId: READING,
    url: 'https://www.gutenberg.org/ebooks/2274',
    title: 'How to Live on 24 Hours a Day',
    author: 'Arnold Bennett',
    note: 'Short, and oddly bossy about reading the paper on the morning train.',
    cloth: 'rust',
    pattern: 'bars',
    seed: 11173,
    ageMinutes: 19 * DAY + 260,
  },
  {
    id: 'example-zettelkasten',
    shelfId: READING,
    url: 'https://en.wikipedia.org/wiki/Zettelkasten',
    title: 'Zettelkasten',
    tags: ['notes'],
    cloth: 'teal',
    pattern: 'waves',
    seed: 12281,
    ageMinutes: 8 * DAY + 150,
  },
  {
    id: 'example-paper-size',
    shelfId: LOOKUPS,
    url: 'https://en.wikipedia.org/wiki/Paper_size',
    title: 'Paper size',
    tags: ['printing'],
    cloth: 'bone',
    pattern: 'bars',
    seed: 13397,
    ageMinutes: 212 * DAY + 330,
  },
  {
    id: 'example-pancakes',
    shelfId: LOOKUPS,
    url: 'https://en.wikibooks.org/wiki/Cookbook:Pancakes_(North_American)',
    title: 'Cookbook:Pancakes (North American)',
    note: 'Whip the whites. Worth the extra bowl.',
    tags: ['cooking'],
    cloth: 'ochre',
    pattern: 'arcs',
    seed: 14401,
    ageMinutes: 340 * DAY + 75,
  },
  {
    id: 'example-time-zones-map',
    shelfId: LOOKUPS,
    url: 'https://commons.wikimedia.org/wiki/File:World_Time_Zones_Map.png',
    title: 'File:World Time Zones Map.png',
    note: 'Before booking a call with anyone abroad.',
    cloth: 'moss',
    pattern: 'rays',
    seed: 15511,
    ageMinutes: 150 * DAY + 470,
  },
  {
    id: 'example-wcag-22',
    shelfId: LOOKUPS,
    url: 'https://www.w3.org/TR/WCAG22/',
    title: 'Web Content Accessibility Guidelines (WCAG) 2.2',
    note: 'Contrast is 1.4.3. I forget every time.',
    tags: ['accessibility', 'standards'],
    cloth: 'ink',
    pattern: 'dots',
    seed: 16619,
    ageMinutes: 96 * DAY + 40,
  },
];

/** Ids of the example links, so the app can tell them from links the person added and remove them. */
export const EXAMPLE_IDS: readonly string[] = Object.freeze(LINKS.map((link) => link.id));

/** Ids of the example shelves, for removing a shelf the examples brought once it is empty. */
export const EXAMPLE_SHELF_IDS: readonly string[] = Object.freeze(SHELVES.map((shelf) => shelf.id));

const exampleIds = new Set(EXAMPLE_IDS);
const exampleShelfIds = new Set(EXAMPLE_SHELF_IDS);

export function isExampleId(id: string): boolean {
  return exampleIds.has(id);
}

export function isExampleShelfId(id: string): boolean {
  return exampleShelfIds.has(id);
}

function isoBefore(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

function dateAfter(now: Date, days: number): string {
  return new Date(now.getTime() + days * DAY * 60_000).toISOString().slice(0, 10);
}

function toShelf(spec: ExampleShelf, order: number, now: Date): Shelf {
  const shelf: Shelf = { id: spec.id, name: spec.name, order };
  if (spec.description !== undefined) shelf.description = spec.description;
  if (spec.author !== undefined) shelf.author = spec.author;
  if (spec.dueInDays !== undefined) shelf.due = dateAfter(now, spec.dueInDays);
  return shelf;
}

/**
 * A fresh example library on every call. Ids are stable, dates are fixed offsets from `now`, and nothing is
 * random. It starts unread: no progress, nothing marked read and no private notes.
 */
export function sampleLibrary(now: Date = new Date()): LibraryV2 {
  const shelves = SHELVES.map((spec, order) => toShelf(spec, order, now));

  const nextOrder = new Map<string, number>();
  const bookmarks: Bookmark[] = LINKS.map((spec) => {
    const order = nextOrder.get(spec.shelfId) ?? 0;
    nextOrder.set(spec.shelfId, order + 1);
    const addedAt = isoBefore(now, spec.ageMinutes);
    const text = Object.hasOwn(SAMPLE_TEXTS, spec.id) ? SAMPLE_TEXTS[spec.id] : undefined;
    const bookmark: Bookmark = {
      id: spec.id,
      url: spec.url,
      title: spec.title,
      tags: [...(spec.tags ?? [])],
      shelfId: spec.shelfId,
      order,
      addedAt,
      updatedAt: addedAt,
      cover: { cloth: spec.cloth, pattern: spec.pattern, seed: spec.seed },
    };
    if (spec.author !== undefined) bookmark.author = spec.author;
    if (spec.note !== undefined) bookmark.note = spec.note;
    if (text !== undefined) bookmark.reading = { format: 'markdown-lite', text, savedAt: addedAt };
    if (spec.required !== undefined) bookmark.required = spec.required;
    if (spec.minutes !== undefined) bookmark.minutes = spec.minutes;
    return bookmark;
  });

  return {
    format: 'bookmark-bookshelf',
    version: 2,
    shelves,
    bookmarks,
    progress: {},
    done: {},
    notes: {},
    session: { shelfId: null, focusId: LINKS[0]?.id ?? null, openId: null, view: 'shelf', variant: 'paper' },
  };
}

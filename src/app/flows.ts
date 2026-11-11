import type { Bookshelf } from './bookshelf';
import { createEditor, type LinkPreset } from './editor';
import type { Store } from '../store';

/**
 * Everything the app does in a dialog or in answer to an address: adding and editing links, bringing
 * many in, sharing a shelf, receiving one. The frame (bar, shelf tabs, stage) calls these and never
 * builds a dialog itself.
 */
export interface FlowContext {
  store: Store;
  bookshelf: Bookshelf;
  /** Redraws tabs, actions and the list after a change the frame has to reflect. */
  refresh(): void;
}

export type { LinkPreset };

export interface Flows {
  addLink(preset?: LinkPreset): void;
  editLink(id: string): void;
  /** Opens the dialog for bringing many links in, optionally with files that were dropped on the page. */
  bringLinksIn(files?: File[]): void;
  shareShelf(shelfId: string): void;
  handIn(shelfId: string): void;
  describeShelf(shelfId: string): void;
  removeShelf(shelfId: string): void;
  sendPageHere(): void;
  removeExamples(): void;
  /** Acts on a shelf, a link to add or a link to open carried in the page address. Called once at start. */
  handleAddress(): void;
}

export function createFlows(context: FlowContext): Flows {
  const { store, bookshelf } = context;

  const editor = createEditor(store, (bookmark, created) => {
    if (created) {
      // Show the new link on a shelf that contains it.
      const active = store.session().shelfId;
      if (active !== null && active !== bookmark.shelfId) bookshelf.setShelf(bookmark.shelfId);
    }
    bookshelf.show(bookmark.id);
  });

  return {
    addLink: (preset) => editor.add(preset),
    editLink: (id) => editor.edit(id),
    bringLinksIn: () => undefined,
    shareShelf: () => undefined,
    handIn: () => undefined,
    describeShelf: () => undefined,
    removeShelf: () => undefined,
    sendPageHere: () => undefined,
    removeExamples: () => undefined,
    handleAddress: () => undefined,
  };
}

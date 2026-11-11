import type { Bookshelf } from './bookshelf';
import { toast } from './dom';
import { createEditor, type LinkPreset } from './editor';
import { clearAddress, readAddress } from './flow-address';
import { receiveFromLink } from './flow-arrive';
import { sendPageHereFlow } from './flow-bookmarklet';
import { removeExampleLinks } from './flow-examples';
import { takeLinksOutFlow } from './flow-export';
import { handInFlow } from './flow-handin';
import { printShelf } from './flow-print';
import { shareShelfFlow } from './flow-share';
import { describeShelfFlow, removeShelfFlow } from './flow-shelf';
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
  /** Opens the dialog for saving the library, a bookmarks file or a Markdown list. */
  takeLinksOut(): void;
  shareShelf(shelfId: string): void;
  handIn(shelfId: string): void;
  /** Prints the links of one shelf as a plain numbered list, without the app around it. */
  printShelf(shelfId: string): void;
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
      if (active !== null && active !== bookmark.shelfId) {
        bookshelf.setShelf(bookmark.shelfId);
        context.refresh();
      }
    }
    bookshelf.show(bookmark.id);
  }, (bookmark) => {
    if (store.session().shelfId !== null && store.session().shelfId !== bookmark.shelfId) {
      bookshelf.setShelf(bookmark.shelfId);
      context.refresh();
    }
    bookshelf.show(bookmark.id);
  });

  function handleAddress(): void {
    const intent = readAddress(window.location);
    if (!intent) return;
    if (intent.kind === 'add') {
      clearAddress(window.location, window.history);
      editor.add({ url: intent.request.url, title: intent.request.title, text: intent.request.text });
      return;
    }
    if (intent.kind === 'shelf') {
      clearAddress(window.location, window.history);
      void receiveFromLink(context, intent.fragment);
      return;
    }
    if (intent.kind === 'link') {
      clearAddress(window.location, window.history);
      const link = store.get(intent.id);
      if (!link) {
        toast('That link is not in this library.');
        return;
      }
      if (store.session().shelfId !== null && store.session().shelfId !== link.shelfId) {
        bookshelf.setShelf(link.shelfId);
        context.refresh();
      }
      bookshelf.show(link.id, { immediate: true });
      void bookshelf.open(link.id);
    }
  }

  return {
    addLink: (preset) => editor.add(preset),
    editLink: (id) => editor.edit(id),
    bringLinksIn: () => undefined,
    takeLinksOut: () => takeLinksOutFlow(store),
    shareShelf: (shelfId) => shareShelfFlow(store, shelfId),
    handIn: (shelfId) => handInFlow(store, shelfId),
    printShelf: (shelfId) => printShelf(store, shelfId),
    describeShelf: (shelfId) => describeShelfFlow(context, shelfId),
    removeShelf: (shelfId) => void removeShelfFlow(context, shelfId),
    sendPageHere: () => sendPageHereFlow(),
    removeExamples() {
      const result = removeExampleLinks(store);
      if (!result) return toast('There are no examples left to remove.');
      const noun = result.links === 1 ? 'link' : 'links';
      toast(`Removed ${result.links} example ${noun}.`, { label: 'Undo', run: result.undo });
    },
    handleAddress,
  };
}

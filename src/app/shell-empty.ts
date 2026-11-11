/**
 * What an empty shelf says, in three beats: what is missing, what will happen, and the way forward.
 * The same words serve the stage and the list.
 */

export type EmptyAction = 'add' | 'bring';

export interface EmptyState {
  message: string;
  hint: string;
  buttons: Array<{ action: EmptyAction; label: string; solid: boolean }>;
}

/** `shelfName` is the open shelf, or null when every shelf is shown and none has a link. */
export function emptyState(shelfName: string | null): EmptyState {
  if (shelfName === null) {
    return {
      message: 'Nothing on your shelves yet.',
      hint: 'Add a link, or bring in the bookmarks your browser keeps.',
      buttons: [
        { action: 'add', label: 'Add a link', solid: true },
        { action: 'bring', label: 'Bring links in', solid: false },
      ],
    };
  }
  return {
    message: `Nothing on ${shelfName} yet.`,
    hint: 'Links you add while this shelf is open are filed here.',
    buttons: [
      { action: 'add', label: `Add a link to ${shelfName}`, solid: true },
      { action: 'bring', label: 'Bring links in', solid: false },
    ],
  };
}

/** Explains reading where the question comes up, now that no footer carries it. */
export const READING_NOTE =
  'When you save a link, paste the text you want to read with it. It opens here as a page, and the shelf keeps your place.';

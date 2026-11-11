import type { LibraryV2, Result } from './types';
import type { OpContext } from './bookmark-ops';
import { findBookmark } from './bookmark-ops';
import { notFound, ok } from './result';
import { checkPrivateNote } from './validate';

/** Marks a link read or not read. The value says whether anything changed. */
export function setDoneIn(lib: LibraryV2, ctx: OpContext, id: string, done: boolean): Result<boolean> {
  if (!findBookmark(lib, id)) return notFound('bookmark');
  const marked = Object.hasOwn(lib.done, id);
  if (done === marked) return ok(false);
  if (done) lib.done[id] = ctx.now();
  else delete lib.done[id];
  return ok(true);
}

/** Sets or removes the private note on a link. The value says whether anything changed. */
export function setNoteIn(lib: LibraryV2, id: string, text: string): Result<boolean> {
  if (!findBookmark(lib, id)) return notFound('bookmark');
  const note = checkPrivateNote(typeof text === 'string' ? text : '');
  if (!note.ok) return note;
  const before = Object.hasOwn(lib.notes, id) ? lib.notes[id] : undefined;
  if (note.value === before) return ok(false);
  if (note.value === undefined) delete lib.notes[id];
  else lib.notes[id] = note.value;
  return ok(true);
}

import type { LibraryV2, Session } from './types';
import { PAINT_NAMES, SORT_MODE_NAMES } from './types';

/**
 * Applies the valid parts of a session patch and reports whether anything changed.
 * Ids that point at nothing, an unknown view, sort, drawing or text size and an empty variant are ignored.
 */
export function applySessionPatch(lib: LibraryV2, patch: Partial<Session>): boolean {
  const session = lib.session;
  let changed = false;
  const set = <K extends keyof Session>(key: K, value: Session[K]): void => {
    if (session[key] === value) return;
    session[key] = value;
    changed = true;
  };

  if (patch.shelfId !== undefined && (patch.shelfId === null || lib.shelves.some((s) => s.id === patch.shelfId))) {
    set('shelfId', patch.shelfId);
  }
  for (const key of ['focusId', 'openId'] as const) {
    const id = patch[key];
    if (id !== undefined && (id === null || lib.bookmarks.some((b) => b.id === id))) set(key, id);
  }
  if (patch.view === 'shelf' || patch.view === 'list' || patch.view === 'showcase') set('view', patch.view);
  if (typeof patch.variant === 'string' && patch.variant.trim() !== '') set('variant', patch.variant.trim());
  if (typeof patch.textScale === 'number' && Number.isFinite(patch.textScale)) {
    set('textScale', Math.min(4, Math.max(0, Math.round(patch.textScale))));
  }
  if (typeof patch.sort === 'string' && (SORT_MODE_NAMES as readonly string[]).includes(patch.sort)) set('sort', patch.sort);
  if (typeof patch.paint === 'string' && (PAINT_NAMES as readonly string[]).includes(patch.paint)) set('paint', patch.paint);
  return changed;
}

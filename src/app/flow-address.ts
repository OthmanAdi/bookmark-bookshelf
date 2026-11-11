import { parseAddRequest, type AddRequest } from '../store/add-request';

/**
 * What the page address asks the app to do when it opens: add a link (`#add=` or `?add=`), open one of the
 * person's own links (`#link=<id>`), or receive a shelf (`#shelf=1.d.<data>`). Reading an address never
 * changes anything; the app decides what to do and then clears the address so a reload does not repeat it.
 */
export type AddressIntent =
  | { kind: 'add'; request: AddRequest }
  | { kind: 'link'; id: string }
  | { kind: 'shelf'; fragment: string };

export interface AddressLocation {
  hash: string;
  search: string;
  pathname: string;
}

const SHELF_PREFIX = '#shelf=';
const MAX_ID_LENGTH = 200;

export function readAddress(location: AddressLocation): AddressIntent | null {
  const hash = typeof location.hash === 'string' ? location.hash : '';
  if (hash.startsWith(SHELF_PREFIX)) {
    // The whole fragment, `shelf=1.d.<data>`, is what the link decoder reads.
    return hash.length === SHELF_PREFIX.length ? null : { kind: 'shelf', fragment: hash.slice(1) };
  }
  const request = parseAddRequest(location);
  if (request) return { kind: 'add', request };
  const id = new URLSearchParams(hash.replace(/^#/, '')).get('link');
  if (id !== null && id.trim() !== '' && id.length <= MAX_ID_LENGTH) return { kind: 'link', id: id.trim() };
  return null;
}

/** Whether the address carries something the app should act on, for example to start with an empty library. */
export function carriesAddress(location: AddressLocation): boolean {
  return readAddress(location) !== null;
}

/** The address without what was acted on: no fragment, and no `add`, `title` or `text` in the query. */
export function cleanedAddress(location: AddressLocation): string {
  const query = new URLSearchParams(location.search);
  for (const key of ['add', 'title', 'text']) query.delete(key);
  const rest = query.toString();
  return rest === '' ? location.pathname : `${location.pathname}?${rest}`;
}

export function clearAddress(location: AddressLocation, history: Pick<History, 'replaceState'>): void {
  history.replaceState(null, '', cleanedAddress(location));
}

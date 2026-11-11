/**
 * A link sent to the app in its address: `app.html#add=<url>&title=<title>&text=<selected text>`, or the
 * same keys in the query string. Reading one never saves anything; the app shows its add dialog filled in.
 */

import { cleanLine, cleanText } from './clean-text';
import { MAX_URL_LENGTH, hasCredentials } from './url-hygiene';

export interface AddRequest {
  url: string;
  title?: string;
  text?: string;
}

export const MAX_ADD_TITLE = 300;
export const MAX_ADD_TEXT = 500000;
/** What the bookmarklet sends of a selection; a longer selection would not fit in an address anyway. */
const BOOKMARKLET_TEXT = 100000;

function fieldsOf(raw: string): URLSearchParams {
  const body = raw.replace(/^[#?]+/, '');
  return new URLSearchParams(body);
}

function readAddress(value: string | null): string | undefined {
  if (value === null) return undefined;
  const text = value.trim();
  if (text === '' || text.length > MAX_URL_LENGTH || !/^https?:\/\//i.test(text)) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return undefined;
  }
  if (parsed.hostname === '' || hasCredentials(parsed) || parsed.href.length > MAX_URL_LENGTH) return undefined;
  return parsed.href;
}

/** Reads `add`, `title` and `text`, each from the fragment first and then from the query. */
export function parseAddRequest(location: { hash: string; search: string }): AddRequest | null {
  const fragment = fieldsOf(typeof location.hash === 'string' ? location.hash : '');
  const query = fieldsOf(typeof location.search === 'string' ? location.search : '');
  const pick = (key: string): string | null => fragment.get(key) ?? query.get(key);

  const url = readAddress(fragment.get('add') ?? query.get('add'));
  if (url === undefined) return null;
  const request: AddRequest = { url };
  const title = cleanLine(pick('title') ?? '').slice(0, MAX_ADD_TITLE).trim();
  if (title !== '') request.title = title;
  const text = cleanText(pick('text') ?? '').slice(0, MAX_ADD_TEXT);
  if (text.trim() !== '') request.text = text;
  return request;
}

/**
 * The `javascript:` text of a bookmarklet that opens the app with the page address, title and selection.
 * It is one line, holds no `#` (a `javascript:` address ends at the first one) and no `%` of its own
 * (browsers decode percent escapes before running it). Anything but an http(s) app address gives a
 * bookmarklet that does nothing.
 */
export function bookmarkletSource(appUrl: string): string {
  const nothing = 'javascript:void(0)';
  let app: URL;
  try {
    app = new URL(appUrl);
  } catch {
    return nothing;
  }
  if ((app.protocol !== 'http:' && app.protocol !== 'https:') || hasCredentials(app)) return nothing;
  app.hash = '';
  const literal = app.href.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/%/g, '%25');
  const strip = '/[\\ud800-\\udfff]/g';
  const code =
    '(function(){' +
    "var w=window,d=document,s='';" +
    'try{s=String(w.getSelection())}catch(x){}' +
    `function e(v){try{return encodeURIComponent(v)}catch(x){return encodeURIComponent(String(v).replace(${strip},''))}}` +
    `w.open('${literal}\\x23add='+e(location.href)+'&title='+e(d.title)+'&text='+e(s.slice(0,${BOOKMARKLET_TEXT})),'_blank','noopener')` +
    '})();';
  return `javascript:${code}`;
}

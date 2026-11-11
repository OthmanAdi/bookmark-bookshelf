/**
 * A plain-text summary of what was read on a shelf, to paste into an e-mail or a form. It is built from
 * what the person marked, so it says so on its last line; nothing here proves that a text was read.
 */

import { cleanLine, cleanText } from './clean-text';
import { formatMinutes } from './reading-time';

export interface HandInVolume {
  id: string;
  title: string;
  url: string;
  /** Absent means required. */
  required?: boolean;
  minutes?: number;
  reading?: { text: string };
}

export interface HandInInput {
  shelfName: string;
  volumes: readonly HandInVolume[];
  isDone(id: string): boolean;
  /** The person's private note for a volume. Shown under its line when there is one. */
  noteOf(id: string): string | undefined;
  minutesOf(volume: HandInVolume): number | undefined;
  date: Date;
  /** Language tag for the date, for example `de-DE`. Defaults to the browser language. */
  lang?: string;
}

function formatDate(date: Date, lang: string | undefined): string {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
  try {
    return date.toLocaleDateString(lang, options);
  } catch {
    return date.toLocaleDateString(undefined, options);
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function statusLine(input: HandInInput): string {
  const { volumes } = input;
  if (volumes.length === 0) return 'This shelf is empty.';
  const done = volumes.filter((volume) => input.isDone(volume.id));
  const parts: string[] = [];
  if (done.length === 0) parts.push('Nothing read yet.');
  else if (done.length === volumes.length) parts.push(volumes.length === 1 ? 'Read.' : `All ${volumes.length} read.`);
  else parts.push(`${done.length} of ${volumes.length} read.`);

  const required = volumes.filter((volume) => volume.required !== false);
  if (required.length < volumes.length && required.length > 0) {
    const requiredDone = required.filter((volume) => input.isDone(volume.id)).length;
    parts.push(`Required: ${requiredDone} of ${required.length}.`);
  }

  let minutes = 0;
  let known = false;
  for (const volume of done) {
    const length = input.minutesOf(volume);
    if (length !== undefined) {
      minutes += length;
      known = true;
    }
  }
  if (known) {
    const length = formatMinutes(minutes);
    parts.push(`${length.charAt(0).toUpperCase()}${length.slice(1)} of reading.`);
  }
  return parts.join(' ');
}

export function handInSummary(input: HandInInput): string {
  const name = cleanLine(input.shelfName) || 'Shelf';
  const lines: string[] = [`Reading summary: ${name} (${formatDate(input.date, input.lang)})`, statusLine(input), ''];

  for (const volume of input.volumes) {
    const mark = input.isDone(volume.id) ? '[x]' : '[ ]';
    const title = cleanLine(volume.title) || hostOf(volume.url) || volume.url;
    const host = hostOf(volume.url);
    lines.push(host === '' || host === title ? `${mark} ${title}` : `${mark} ${title} (${host})`);
    const note = cleanText(input.noteOf(volume.id) ?? '').trim();
    if (note !== '') {
      for (const line of note.split('\n')) lines.push(line.trim() === '' ? '' : `    ${line.trimEnd()}`);
    }
  }
  if (input.volumes.length > 0) lines.push('');
  lines.push('This list is self-reported.');
  return lines.join('\n');
}

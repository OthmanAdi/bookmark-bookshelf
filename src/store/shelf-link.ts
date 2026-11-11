/**
 * A shelf inside a link: `app.html#shelf=1.<codec>.<base64url>`.
 *
 * The payload is the shelf file as JSON, deflated with the platform `CompressionStream` (codec `d`) or, on
 * a platform without one, as plain UTF-8 (codec `r`). Decoding is bounded at every step because the text
 * comes from a stranger: the payload length, the size it inflates to and then the shelf file checks.
 * Opening a link never changes anything; the app shows a preview and the person accepts.
 */

import type { Result } from './types';
import type { ShelfFile, ShelfFileRead } from './shelf-file';
import { fail } from './result';
import { readShelfFile } from './shelf-file';

export type LinkCodec = 'd' | 'r';
export type LinkFit = 'chat' | 'browser' | 'file-only';

export const SHELF_LINK_VERSION = 1;
export const MAX_LINK_PAYLOAD = 64000;
export const MAX_LINK_DECODED = 1.5 * 1024 * 1024;
const CHAT_LIMIT = 1800;
const BROWSER_LIMIT = 8000;

const LINK = /^shelf=(\d{1,3})\.([dr])\.([A-Za-z0-9_-]*)$/;
const CHUNK = 0x8000;

type Bytes = Uint8Array<ArrayBuffer>;

type Pumped = { kind: 'ok'; bytes: Bytes } | { kind: 'too-large' } | { kind: 'failed' };

interface ByteTransform {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
}

/** Feeds bytes through a stream and collects the output, giving up once it grows past `limit`. */
async function pump(stream: ByteTransform, input: Bytes, limit: number): Promise<Pumped> {
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const writing = writer.write(input).then(() => writer.close());
  writing.catch(() => undefined);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        return { kind: 'too-large' };
      }
      chunks.push(value);
    }
    await writing;
  } catch {
    return { kind: 'failed' };
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { kind: 'ok', bytes };
}

function toBase64Url(bytes: Bytes): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Bytes | undefined {
  if (text.length % 4 === 1) return undefined;
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return undefined;
  }
}

function hasStream(name: 'CompressionStream' | 'DecompressionStream'): boolean {
  return typeof (globalThis as Record<string, unknown>)[name] === 'function';
}

/** The fragment without `#`, its length and the codec used. Compresses when the platform can. */
export async function encodeShelfLink(file: ShelfFile): Promise<{ fragment: string; length: number; codec: LinkCodec }> {
  const raw = new TextEncoder().encode(JSON.stringify(file));
  let codec: LinkCodec = 'r';
  let bytes = raw;
  if (hasStream('CompressionStream')) {
    try {
      const packed = await pump(new CompressionStream('deflate-raw') as ByteTransform, raw, Number.POSITIVE_INFINITY);
      if (packed.kind === 'ok') {
        codec = 'd';
        bytes = packed.bytes;
      }
    } catch {
      // A platform without deflate-raw falls back to plain text.
    }
  }
  const fragment = `shelf=${SHELF_LINK_VERSION}.${codec}.${toBase64Url(bytes)}`;
  return { fragment, length: fragment.length, codec };
}

/** How a link of this length travels: in a chat message, in a browser, or only as a file. */
export function linkFit(length: number): LinkFit {
  if (length <= CHAT_LIMIT) return 'chat';
  if (length <= BROWSER_LIMIT) return 'browser';
  return 'file-only';
}

const DAMAGED = 'This link is damaged or incomplete.';

/** Reads the part after `#` (a leading `#` is accepted). Never throws. */
export async function decodeShelfLink(fragment: string): Promise<Result<ShelfFileRead>> {
  if (typeof fragment !== 'string') return fail('link-damaged', DAMAGED);
  const text = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  if (text.length > MAX_LINK_PAYLOAD + 32) {
    return fail('link-too-long', 'This link is too long to open. Ask for the shelf file instead.');
  }
  const match = LINK.exec(text);
  if (!match) return fail('link-damaged', DAMAGED);
  const [, version = '', codec = '', payload = ''] = match;
  if (Number(version) > SHELF_LINK_VERSION) {
    return fail('unsupported-version', 'This link was made by a newer version. Update the app to open it.');
  }
  if (Number(version) < 1) return fail('link-damaged', DAMAGED);
  if (payload.length > MAX_LINK_PAYLOAD) {
    return fail('link-too-long', 'This link is too long to open. Ask for the shelf file instead.');
  }
  const bytes = fromBase64Url(payload);
  if (!bytes || bytes.length === 0) return fail('link-damaged', DAMAGED);

  let decoded: Bytes = bytes;
  if (codec === 'd') {
    if (!hasStream('DecompressionStream')) {
      return fail('link-unsupported', 'This browser cannot open compressed links. Ask for the shelf file instead.');
    }
    let stream: ByteTransform;
    try {
      stream = new DecompressionStream('deflate-raw') as ByteTransform;
    } catch {
      return fail('link-unsupported', 'This browser cannot open compressed links. Ask for the shelf file instead.');
    }
    const inflated = await pump(stream, bytes, MAX_LINK_DECODED);
    if (inflated.kind === 'too-large') {
      return fail('link-too-large', 'This link holds more than 1.5 MB of text, which is more than a shelf link may carry.');
    }
    if (inflated.kind === 'failed') return fail('link-damaged', DAMAGED);
    decoded = inflated.bytes;
  } else if (decoded.length > MAX_LINK_DECODED) {
    return fail('link-too-large', 'This link holds more than 1.5 MB of text, which is more than a shelf link may carry.');
  }

  let json: string;
  try {
    json = new TextDecoder('utf-8', { fatal: true }).decode(decoded);
  } catch {
    return fail('link-damaged', DAMAGED);
  }
  const read = readShelfFile(json);
  if (!read.ok && (read.error.code === 'invalid-file' || read.error.code === 'not-a-shelf-file')) {
    return fail('link-damaged', DAMAGED);
  }
  return read;
}

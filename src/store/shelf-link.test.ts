// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShelfFile } from './shelf-file';
import { SHELF_FILE_FORMAT, SHELF_FILE_VERSION, toShelfFile } from './shelf-file';
import { decodeShelfLink, encodeShelfLink, linkFit } from './shelf-link';

afterEach(() => {
  vi.unstubAllGlobals();
});

function sampleFile(extraText = ''): ShelfFile {
  return toShelfFile({
    shelf: { id: 's1', name: 'Grüße aus Ägypten', description: 'Lesen für den Kurs', lang: 'de', due: '2026-06-30' },
    bookmarks: [
      {
        id: 'a',
        url: 'https://example.org/artikel?x=1',
        title: '„Anführungszeichen“ und Überschriften',
        note: 'Bitte vor Montag lesen 🚀',
        tags: ['wörter', 'week-1'],
        minutes: 12,
        cover: { cloth: 'ink', pattern: 'arcs', seed: 77 },
        reading: { text: extraText },
      },
      { id: 'b', url: 'https://example.com/', title: 'Second', required: false },
    ],
    includeTexts: extraText !== '',
    revision: 3,
  });
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new CompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  void writer.write(bytes).then(() => writer.close());
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function rawFragment(value: unknown): string {
  return `shelf=1.r.${toBase64Url(new TextEncoder().encode(JSON.stringify(value)))}`;
}

async function errorCode(fragment: string): Promise<string> {
  const result = await decodeShelfLink(fragment);
  if (result.ok) throw new Error('expected an error');
  return result.error.code;
}

describe('encodeShelfLink and decodeShelfLink', () => {
  it('round-trips umlauts, German quotation marks and emoji', async () => {
    const file = sampleFile();
    const link = await encodeShelfLink(file);
    expect(link.codec).toBe('d');
    expect(link.fragment).toMatch(/^shelf=1\.d\.[A-Za-z0-9_-]+$/);
    expect(link.length).toBe(link.fragment.length);
    const result = await decodeShelfLink(link.fragment);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.file).toEqual(file);
      expect(result.value.skipped).toEqual([]);
    }
  });

  it('round-trips a 20,000 character reading text', async () => {
    const text = Array.from({ length: 2000 }, (_value, i) => `Satz ${i} mit Ümlauten.`).join('\n').slice(0, 20000);
    expect(text).toHaveLength(20000);
    const file = sampleFile(text);
    const link = await encodeShelfLink(file);
    const result = await decodeShelfLink(link.fragment);
    expect(result.ok && result.value.file.volumes[0]?.text).toBe(text);
    expect(result.ok && result.value.file).toEqual(file);
  });

  it('compresses, so a repeated text makes a short link', async () => {
    const file = sampleFile('wort '.repeat(4000));
    const link = await encodeShelfLink(file);
    expect(link.length).toBeLessThan(JSON.stringify(file).length / 4);
  });

  it('accepts a fragment that still has its leading hash', async () => {
    const link = await encodeShelfLink(sampleFile());
    expect((await decodeShelfLink(`#${link.fragment}`)).ok).toBe(true);
  });

  it('carries the reading texts only if the file has them', async () => {
    const link = await encodeShelfLink(sampleFile());
    const result = await decodeShelfLink(link.fragment);
    expect(result.ok && result.value.file.volumes.every((volume) => volume.text === undefined)).toBe(true);
  });

  it('reports volumes that fail the file checks, as a file would', async () => {
    const file = sampleFile();
    const bad = { ...file, volumes: [...file.volumes, { id: 'c', url: 'javascript:alert(1)', title: 'Bad' }] };
    const result = await decodeShelfLink((await encodeShelfLink(bad as ShelfFile)).fragment);
    expect(result.ok && result.value.file.volumes).toHaveLength(2);
    expect(result.ok && result.value.skipped).toEqual([
      { title: 'Bad', url: 'javascript:alert(1)', reason: 'address is not an http or https address' },
    ]);
  });
});

describe('decodeShelfLink problems', () => {
  it('answers link-damaged for a truncated fragment', async () => {
    const { fragment } = await encodeShelfLink(sampleFile('wort '.repeat(500)));
    for (const keep of [fragment.length - 1, fragment.length - 40, Math.floor(fragment.length / 2), 20]) {
      expect(await errorCode(fragment.slice(0, keep))).toBe('link-damaged');
    }
  });

  it.each([
    '',
    '#',
    'shelf=',
    'shelf=1',
    'shelf=1.d',
    'shelf=1.d.',
    'shelf=1.x.AAAA',
    'shelf=1.d.AAAA',
    'shelf=1.r.AAAA',
    'shelf=1.d.not base64!',
    'shelf=1.d.ab+/cd==',
    'shelf=1.d.A',
    'shelf=0.d.AAAA',
    'add=https%3A%2F%2Fexample.org',
    'xshelf=1.d.AAAA',
    'shelf=1.d.AAAA&look=oak',
  ])('answers link-damaged for %j', async (fragment) => {
    expect(await errorCode(fragment)).toBe('link-damaged');
  });

  it('answers link-damaged when the payload decodes to something that is not a shelf file', async () => {
    expect(await errorCode(rawFragment({ hello: 'world' }))).toBe('link-damaged');
    expect(await errorCode(rawFragment([1, 2, 3]))).toBe('link-damaged');
    expect(await errorCode(`shelf=1.r.${toBase64Url(new TextEncoder().encode('not json'))}`)).toBe('link-damaged');
    expect(await errorCode(`shelf=1.r.${toBase64Url(new Uint8Array([0xff, 0xfe, 0xfd]))}`)).toBe('link-damaged');
  });

  it('answers link-damaged for bytes that are not deflate data', async () => {
    expect(await errorCode(`shelf=1.d.${toBase64Url(new Uint8Array(200).fill(7))}`)).toBe('link-damaged');
  });

  it('answers link-too-long over 64,000 characters of payload', async () => {
    expect(await errorCode(`shelf=1.d.${'A'.repeat(64001)}`)).toBe('link-too-long');
    expect(await errorCode(`shelf=1.d.${'A'.repeat(500000)}`)).toBe('link-too-long');
    expect(await errorCode(`shelf=1.d.${'A'.repeat(64000)}`)).not.toBe('link-too-long');
  });

  it('answers unsupported-version for a link or a shelf file of a newer version', async () => {
    expect(await errorCode('shelf=2.d.AAAA')).toBe('unsupported-version');
    expect(await errorCode(rawFragment({ ...sampleFile(), version: 2 }))).toBe('unsupported-version');
  });

  it('keeps the error of the shelf file checks', async () => {
    const tooMany = { ...sampleFile(), volumes: Array.from({ length: 501 }, (_value, i) => ({ id: `v${i}`, url: 'https://example.org/', title: 'T' })) };
    expect(await errorCode(rawFragment(tooMany))).toBe('too-many-volumes');
  });

  it('answers link-too-large when the text inflates past 1.5 MB, without reading it all', async () => {
    const zeros = new Uint8Array(40 * 1024 * 1024);
    const packed = await deflate(zeros);
    expect(packed.length).toBeLessThan(48000);

    let produced = 0;
    const RealDecompression = DecompressionStream;
    class CountingDecompression {
      readable: ReadableStream<Uint8Array>;
      writable: WritableStream<Uint8Array>;
      constructor(format: CompressionFormat) {
        const real = new RealDecompression(format);
        const counter = new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            produced += chunk.length;
            controller.enqueue(chunk);
          },
        });
        this.writable = real.writable as WritableStream<Uint8Array>;
        this.readable = (real.readable as ReadableStream<Uint8Array>).pipeThrough(counter);
      }
    }
    vi.stubGlobal('DecompressionStream', CountingDecompression);

    const start = performance.now();
    expect(await errorCode(`shelf=1.d.${toBase64Url(packed)}`)).toBe('link-too-large');
    expect(performance.now() - start).toBeLessThan(2000);
    expect(produced).toBeGreaterThan(1.5 * 1024 * 1024);
    expect(produced).toBeLessThan(8 * 1024 * 1024);
  });

});

describe('without CompressionStream', () => {
  it('writes the raw codec and reads it back', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    vi.stubGlobal('DecompressionStream', undefined);
    const file = sampleFile();
    const link = await encodeShelfLink(file);
    expect(link.codec).toBe('r');
    expect(link.fragment.startsWith('shelf=1.r.')).toBe(true);
    const result = await decodeShelfLink(link.fragment);
    expect(result.ok && result.value.file).toEqual(file);
  });

  it('reads a raw link on a platform that has the streams', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const link = await encodeShelfLink(sampleFile());
    vi.unstubAllGlobals();
    const result = await decodeShelfLink(link.fragment);
    expect(result.ok).toBe(true);
  });

  it('says plainly that it cannot open a compressed link', async () => {
    const link = await encodeShelfLink(sampleFile());
    vi.stubGlobal('DecompressionStream', undefined);
    expect(await errorCode(link.fragment)).toBe('link-unsupported');
  });

  it('falls back to the raw codec when deflate-raw is refused', async () => {
    vi.stubGlobal(
      'CompressionStream',
      class {
        constructor() {
          throw new TypeError('unsupported format');
        }
      },
    );
    expect((await encodeShelfLink(sampleFile())).codec).toBe('r');
  });
});

describe('linkFit', () => {
  it.each([
    [0, 'chat'],
    [1800, 'chat'],
    [1801, 'browser'],
    [8000, 'browser'],
    [8001, 'file-only'],
    [60000, 'file-only'],
  ])('puts a link of %i characters at %s', (length, fit) => {
    expect(linkFit(length)).toBe(fit);
  });
});

describe('a file written by hand', () => {
  it('opens a raw link made outside this module', async () => {
    const file: ShelfFile = {
      format: SHELF_FILE_FORMAT,
      version: SHELF_FILE_VERSION,
      shelf: { id: 's', name: 'By hand', revision: 1 },
      volumes: [{ id: 'v', url: 'https://example.org/', title: 'Only' }],
    };
    const result = await decodeShelfLink(rawFragment(file));
    expect(result.ok && result.value.file).toEqual(file);
  });
});

describe('binding and stamp in a link', () => {
  /** Made by version 0.2.0, before covers could name a binding or a stamp. */
  const OLD_LINK =
    'shelf=1.d.fY2xbsMwDER_JbiZqZF2Kn-iS4AMQQcloWPBkuhQstsi0L8XcjJ06nLgHXj37ujVoitgnFTH6GzctiMPEvrtqiAsYtlrAu8Ij4zv8Bcw8g6E5KKAcRAZN28gmCz-8f9KCC5dwZCESlg0zFEy-PjsOxBmC2AMpUyZu06-XZyCvKhdO00CQvEltP2P1Z11EWv8c9AygBE1ZxAmV4pYAsPcTwuyyAX8Xis9Wad_WeVL_7D2qzO5zd7aTO9ClvpZfwE';

  function shelfOf(cover: Record<string, unknown>): ShelfFile {
    return toShelfFile({
      shelf: { id: 's1', name: 'Week 3', lang: 'en' },
      bookmarks: [
        { id: 'a', url: 'https://example.org/one', title: 'One', cover: { cloth: 'moss', pattern: 'rays', seed: 9, ...cover } },
        { id: 'b', url: 'https://example.org/two', title: 'Two', required: false },
      ],
      includeTexts: false,
      revision: 2,
    });
  }

  it('still opens a link made before covers had them', async () => {
    const result = await decodeShelfLink(OLD_LINK);
    expect(result.ok && result.value.file).toEqual(shelfOf({}));
    expect(result.ok && result.value.file.volumes[0]?.cover).not.toHaveProperty('binding');
  });

  it('writes a shelf without them exactly as before', () => {
    expect(JSON.stringify(shelfOf({}))).toBe(
      '{"format":"bookmark-bookshelf-shelf","version":1,"shelf":{"id":"s1","name":"Week 3","revision":2,"lang":"en"},' +
        '"volumes":[{"id":"a","url":"https://example.org/one","title":"One","cover":{"cloth":"moss","pattern":"rays","seed":9}},' +
        '{"id":"b","url":"https://example.org/two","title":"Two","required":false}]}',
    );
  });

  it('round-trips them', async () => {
    const file = shelfOf({ binding: 'leather', stamp: 'gold' });
    const result = await decodeShelfLink((await encodeShelfLink(file)).fragment);
    expect(result.ok && result.value.file.volumes[0]?.cover).toEqual({ cloth: 'moss', pattern: 'rays', seed: 9, binding: 'leather', stamp: 'gold' });
  });

  it('adds only a few characters to a link for each volume that has them', async () => {
    const plain = await encodeShelfLink(shelfOf({}));
    const bound = await encodeShelfLink(shelfOf({ binding: 'leather', stamp: 'gold' }));
    expect(bound.length - plain.length).toBeLessThanOrEqual(48);
  });
});

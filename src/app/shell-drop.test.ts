import { describe, expect, it } from 'vitest';
import { dragKind, readDrop } from './shell-drop';

const data = (entries: Record<string, string>, files: File[] = []) => ({
  types: [...Object.keys(entries), ...(files.length ? ['Files'] : [])],
  getData: (type: string) => entries[type] ?? '',
  files,
});

describe('readDrop', () => {
  it('takes files first', () => {
    const file = new File(['<!DOCTYPE NETSCAPE-Bookmark-file-1>'], 'bookmarks.html', { type: 'text/html' });
    expect(readDrop(data({ 'text/plain': 'https://example.org/' }, [file]))).toEqual({ kind: 'files', files: [file] });
  });

  it('reads the first address of a uri list and skips comments', () => {
    expect(readDrop(data({ 'text/uri-list': '# from a page\r\nhttps://example.org/a\r\nhttps://example.org/b' }))).toEqual({
      kind: 'link',
      url: 'https://example.org/a',
    });
  });

  it('keeps the link text that comes with a moz url', () => {
    expect(readDrop(data({ 'text/x-moz-url': 'https://example.com/rot\nLink rot' }))).toEqual({
      kind: 'link',
      url: 'https://example.com/rot',
      title: 'Link rot',
    });
  });

  it('accepts a plain address and refuses words or other schemes', () => {
    expect(readDrop(data({ 'text/plain': '  https://example.net/paper  ' }))).toEqual({ kind: 'link', url: 'https://example.net/paper' });
    expect(readDrop(data({ 'text/plain': 'a sentence about https://example.net' }))).toBeNull();
    expect(readDrop(data({ 'text/uri-list': 'javascript:alert(1)' }))).toBeNull();
  });
});

describe('dragKind', () => {
  it('tells files from links while dragging', () => {
    expect(dragKind(['Files'])).toBe('files');
    expect(dragKind(['text/uri-list', 'text/plain'])).toBe('link');
    expect(dragKind(['application/x-custom'])).toBeNull();
  });
});

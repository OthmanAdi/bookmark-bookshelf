/**
 * Dropping on the page. A file goes to Bring links in; a link dragged from another page or the address
 * bar opens Add a link with its address filled in. Nothing is saved by the drop itself, and the browser
 * never navigates away to what was dropped.
 */

export type Dropped = { kind: 'files'; files: File[] } | { kind: 'link'; url: string; title?: string };

export interface DropData {
  types: readonly string[];
  getData(type: string): string;
  files?: ArrayLike<File> | null;
}

function webAddress(value: string): string | null {
  const text = value.trim();
  if (!/^https?:\/\//i.test(text) || /\s/.test(text)) return null;
  try {
    return new URL(text).href;
  } catch {
    return null;
  }
}

/** What a drop carries, or null when it is nothing the app can take. */
export function readDrop(data: DropData): Dropped | null {
  const files = data.files ? Array.from(data.files) : [];
  if (files.length > 0) return { kind: 'files', files };
  // Firefox gives the address and the link text on two lines.
  if (data.types.includes('text/x-moz-url')) {
    const [address = '', title = ''] = data.getData('text/x-moz-url').split(/\r?\n/);
    const url = webAddress(address);
    if (url) return title.trim() && title.trim() !== address.trim() ? { kind: 'link', url, title: title.trim() } : { kind: 'link', url };
  }
  if (data.types.includes('text/uri-list')) {
    const first = data
      .getData('text/uri-list')
      .split(/\r?\n/)
      .find((line) => line.trim() !== '' && !line.startsWith('#'));
    const url = first ? webAddress(first) : null;
    if (url) return { kind: 'link', url };
  }
  if (data.types.includes('text/plain')) {
    const url = webAddress(data.getData('text/plain'));
    if (url) return { kind: 'link', url };
  }
  return null;
}

/** During a drag only the kinds of data can be read, not the data itself. */
export function dragKind(types: readonly string[]): 'files' | 'link' | null {
  if (types.includes('Files')) return 'files';
  if (types.includes('text/uri-list') || types.includes('text/x-moz-url') || types.includes('text/plain')) return 'link';
  return null;
}

export interface DropOptions {
  hint: HTMLElement;
  hintText: HTMLElement;
  /** False while something else (a dialog, the reader) has the page. */
  accepting(): boolean;
  onFiles(files: File[]): void;
  onLink(link: { url: string; title?: string }): void;
}

export function attachDrop(options: DropOptions): () => void {
  const { hint, hintText } = options;
  let fromInside = false;

  const show = (kind: 'files' | 'link'): void => {
    hintText.textContent = kind === 'files' ? 'Drop the file to bring its links in.' : 'Drop the link to add it.';
    hint.hidden = false;
  };
  const hide = (): void => {
    hint.hidden = true;
  };

  const onDragStart = (): void => {
    fromInside = true;
  };
  const onDragEnd = (): void => {
    fromInside = false;
    hide();
  };

  const onDragOver = (event: DragEvent): void => {
    if (fromInside || !event.dataTransfer) return;
    const kind = dragKind([...event.dataTransfer.types]);
    if (!kind) return;
    // Taking the drag over is what stops the browser from opening the file or the address itself.
    event.preventDefault();
    if (!options.accepting()) {
      event.dataTransfer.dropEffect = 'none';
      hide();
      return;
    }
    event.dataTransfer.dropEffect = 'copy';
    show(kind);
  };

  const onDragLeave = (event: DragEvent): void => {
    // Leaving one element for another inside the page is not leaving the page.
    if (event.relatedTarget === null) hide();
  };

  const onDrop = (event: DragEvent): void => {
    hide();
    if (fromInside || !event.dataTransfer) return;
    if (!dragKind([...event.dataTransfer.types])) return;
    event.preventDefault();
    if (!options.accepting()) return;
    const dropped = readDrop({
      types: [...event.dataTransfer.types],
      getData: (type) => event.dataTransfer?.getData(type) ?? '',
      files: event.dataTransfer.files,
    });
    if (!dropped) return;
    if (dropped.kind === 'files') options.onFiles(dropped.files);
    else options.onLink(dropped.title ? { url: dropped.url, title: dropped.title } : { url: dropped.url });
  };

  document.addEventListener('dragstart', onDragStart);
  document.addEventListener('dragend', onDragEnd);
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('dragleave', onDragLeave);
  window.addEventListener('drop', onDrop);
  return () => {
    document.removeEventListener('dragstart', onDragStart);
    document.removeEventListener('dragend', onDragEnd);
    window.removeEventListener('dragover', onDragOver);
    window.removeEventListener('dragleave', onDragLeave);
    window.removeEventListener('drop', onDrop);
  };
}

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMemoryStorage, createStore } from '../store';
import type { Store } from '../store';
import { sampleLibrary } from '../data/sample-library';

/** Puts the dialogs and the toast area from app.html into the test document, so the code under test finds the markup it expects. */
export function mountPage(): void {
  const html = readFileSync(resolve(import.meta.dirname, '../../app.html'), 'utf8');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.body.replaceChildren();
  for (const id of ['editor', 'prompt', 'toasts']) {
    const node = parsed.getElementById(id);
    if (node) document.body.appendChild(document.importNode(node, true));
  }
}

export function makeStore(): Store {
  return createStore({ storage: createMemoryStorage(), seed: () => sampleLibrary(), syncTabs: false });
}

export async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

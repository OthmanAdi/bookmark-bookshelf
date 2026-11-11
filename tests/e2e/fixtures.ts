import { expect, test as base, type BrowserContext, type Page } from '@playwright/test';

export interface Watch {
  /** Uncaught errors and console errors the page reported. */
  problems: string[];
  /** Requests to anywhere but the server under test. The app must never make one. */
  outside: string[];
}

const LOCAL_SCHEMES = new Set(['data:', 'blob:', 'about:']);

/** Collects page errors and every request a browser context sends to another host than `origin`. */
export function watch(context: BrowserContext, page: Page, origin: string): Watch {
  const seen: Watch = { problems: [], outside: [] };
  const home = new URL(origin).host;
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (LOCAL_SCHEMES.has(url.protocol)) return;
    if (url.host !== home) seen.outside.push(request.url());
  });
  page.on('pageerror', (error) => seen.problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') seen.problems.push(`console.error: ${message.text()}`);
  });
  return seen;
}

/**
 * Every test gets a page that fails the test on an uncaught error, a console error, or a request that
 * leaves the server under test. Each Playwright test starts in a fresh browser context, so the app
 * always begins with its 15 example links unless a test changes that.
 */
export const test = base.extend<{ watched: Watch }>({
  watched: [
    async ({ context, page, baseURL }, use) => {
      const seen = watch(context, page, baseURL ?? 'http://127.0.0.1');
      await use(seen);
      expect(seen.problems, 'the page reported errors').toEqual([]);
      expect(seen.outside, 'requests left the server under test').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
export * from './helpers';

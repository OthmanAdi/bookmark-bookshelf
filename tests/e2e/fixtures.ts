import { expect, test as base } from '@playwright/test';

/**
 * Every test gets a page that fails the test on an uncaught error or a console error.
 * Each Playwright test starts in a fresh browser context, so the app always begins
 * with its 14 sample bookmarks unless a test changes that.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
    });
    await use(page);
    expect(problems, 'the page reported errors').toEqual([]);
  },
});

export { expect };
export * from './helpers';

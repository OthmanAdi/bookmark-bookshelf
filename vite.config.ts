import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const root = import.meta.dirname;

/**
 * Search and sharing metadata that depends on where the site is published.
 *
 * Without an approved origin the build fails closed: every page is marked noindex and no canonical or
 * absolute sharing URL is written. Set SITE_ORIGIN (an https origin, optionally with a base path, no
 * trailing slash) at build time once the site has a home:
 *
 *   SITE_ORIGIN=https://example.org npm run build
 *
 * Then the homepage and the app get a canonical link and absolute Open Graph URLs. Example pages stay noindex.
 */
function siteMeta(): Plugin {
  const origin = (process.env.SITE_ORIGIN ?? '').trim().replace(/\/+$/, '');
  const approved = /^https:\/\/[^/\s]+(\/[^\s]*)?$/.test(origin);
  return {
    name: 'bookmark-bookshelf-site-meta',
    transformIndexHtml(html, context) {
      const page = context.path.replace(/^\//, '');
      const indexable = approved && !page.startsWith('examples/');
      if (!indexable) {
        return { html, tags: [{ tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow' }, injectTo: 'head' }] };
      }
      const url = `${origin}/${page === 'index.html' ? '' : page}`;
      return {
        html: html.replaceAll('content="./social-preview.png"', `content="${origin}/social-preview.png"`),
        tags: [
          { tag: 'link', attrs: { rel: 'canonical', href: url }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:url', content: url }, injectTo: 'head' },
        ],
      };
    },
  };
}

export default defineConfig({
  plugins: [siteMeta()],
  // Relative asset URLs so the built site works from any folder or sub-path.
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: false },
  preview: { host: '127.0.0.1', port: 4173, strictPort: false },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        home: resolve(root, 'index.html'),
        app: resolve(root, 'app.html'),
        'example-shelf-only': resolve(root, 'examples/shelf-only.html'),
        'example-reader-only': resolve(root, 'examples/reader-only.html'),
        'example-store-only': resolve(root, 'examples/store-only.html'),
      },
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
});

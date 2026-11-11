import { readFileSync } from 'node:fs';
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
 * Then the homepage and the app get a canonical link and absolute Open Graph URLs, the homepage's
 * structured data gets its `url`, and `robots.txt` and `sitemap.xml` are written. Example pages stay noindex.
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
        html: html
          .replaceAll('content="./social-preview.png"', `content="${origin}/social-preview.png"`)
          .replace('"@type": "SoftwareApplication",', `"@type": "SoftwareApplication",\n        "url": "${origin}/",`),
        tags: [
          { tag: 'link', attrs: { rel: 'canonical', href: url }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:url', content: url }, injectTo: 'head' },
        ],
      };
    },
    generateBundle() {
      if (!approved) return;
      const pages = [`${origin}/`, `${origin}/app.html`];
      const sitemap =
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        pages.map((page) => `  <url><loc>${page}</loc></url>\n`).join('') +
        '</urlset>\n';
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap });
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`,
      });
    },
  };
}

/**
 * A built site is a distribution of its own, so the project licence and notices travel with it.
 * LICENSE, NOTICE and PROVENANCE.md are copied from the repository root into the root of `dist/`, byte for byte.
 * THIRD_PARTY_NOTICES.md is copied with one adjustment: in the repository its two licence links point into
 * `public/licenses/`, and in a built site those files sit in `licenses/`, so the two link targets are rewritten.
 * Nothing else in it changes.
 */
function shipNotices(): Plugin {
  const verbatim = ['LICENSE', 'NOTICE', 'PROVENANCE.md'];
  return {
    name: 'bookmark-bookshelf-ship-notices',
    apply: 'build',
    generateBundle() {
      for (const fileName of verbatim) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(resolve(root, fileName)) });
      }
      const notices = readFileSync(resolve(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
      const relinked = notices.replaceAll('](public/licenses/', '](licenses/');
      if (relinked === notices) this.error('THIRD_PARTY_NOTICES.md no longer links into public/licenses/: review shipNotices.');
      this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_NOTICES.md', source: relinked });
    },
  };
}

export default defineConfig({
  plugins: [siteMeta(), shipNotices()],
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

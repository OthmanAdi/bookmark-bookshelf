import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const root = import.meta.dirname;

/**
 * Search and sharing metadata that depends on where the site is published.
 *
 * Only the homepage is meant to be found through a search engine. `app.html` is the application and the pages
 * in `examples/` are demonstrations: they are always `noindex, follow`, carry no canonical link and are not
 * listed in the sitemap.
 *
 * Without an approved origin the build fails closed: every page is `noindex` and no canonical or absolute
 * sharing URL is written. Set SITE_ORIGIN (an https origin, optionally with a base path, no trailing slash)
 * at build time once the site has a home:
 *
 *   SITE_ORIGIN=https://example.org npm run build
 *
 * Then the homepage gets a canonical link, an `og:url` and absolute image URLs, its structured data gets its
 * `url`, and `robots.txt` and `sitemap.xml` are written. A `{{ORIGIN}}` placeholder in any page is replaced by
 * the origin, or, when there is none, the tag that carries it is dropped so no broken URL is shipped.
 * `robots.txt` is only read at the root of a host, so on a project path the robots meta tag is what counts.
 */
function siteMeta(): Plugin {
  const origin = (process.env.SITE_ORIGIN ?? '').trim().replace(/\/+$/, '');
  const approved = /^https:\/\/[^/\s]+(\/[^\s]*)?$/.test(origin);
  const version = (JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string }).version;
  const placeholder = '{{ORIGIN}}';
  const structuredData = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const applicationTypes = new Set(['SoftwareApplication', 'WebApplication', 'MobileApplication']);

  type Node = Record<string, unknown>;
  const refine = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(refine);
    if (typeof node !== 'object' || node === null) return;
    const entry = node as Node;
    const types = ([] as unknown[]).concat(entry['@type']);
    if (types.some((type) => typeof type === 'string' && applicationTypes.has(type))) {
      entry['applicationCategory'] = 'UtilitiesApplication';
      // No review or rating exists for this project, so none may be published.
      delete entry['aggregateRating'];
      delete entry['review'];
      if ('softwareVersion' in entry) entry['softwareVersion'] = version;
      if (approved && !('url' in entry)) entry['url'] = `${origin}/`;
    }
    Object.values(entry).forEach(refine);
  };

  const refineStructuredData = (html: string, page: string): string =>
    html.replace(structuredData, (_block, body: string) => {
      if (!approved && body.includes(placeholder)) return '';
      let data: unknown;
      try {
        data = JSON.parse(body.replaceAll(placeholder, origin));
      } catch (error) {
        throw new Error(`${page}: the structured data is not valid JSON (${(error as Error).message}).`);
      }
      refine(data);
      return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n    </script>`;
    });

  return {
    name: 'bookmark-bookshelf-site-meta',
    transformIndexHtml(source, context) {
      const page = context.path.replace(/^\//, '');
      const home = page === 'index.html';
      // One robots directive per page: a static one in the source would contradict the injected one.
      let html = source.replace(/<meta\s+name="robots"[^>]*>\s*/g, '');
      const robots = (content: string) => ({ tag: 'meta', attrs: { name: 'robots', content }, injectTo: 'head' as const });

      if (!approved) {
        html = html.replace(/<(?:meta|link)\b[^>]*\{\{ORIGIN\}\}[^>]*>\s*/g, '');
        html = refineStructuredData(html, page);
        return { html, tags: [robots(home ? 'noindex, nofollow' : 'noindex, follow')] };
      }

      html = refineStructuredData(
        html.replaceAll('content="./social-preview.png"', `content="${origin}/social-preview.png"`).replaceAll(placeholder, origin),
        page,
      );
      if (!home) return { html, tags: [robots('noindex, follow')] };

      const url = `${origin}/`;
      return {
        html,
        tags: [
          ...(/rel="canonical"/.test(html) ? [] : [{ tag: 'link', attrs: { rel: 'canonical', href: url }, injectTo: 'head' as const }]),
          ...(/property="og:url"/.test(html) ? [] : [{ tag: 'meta', attrs: { property: 'og:url', content: url }, injectTo: 'head' as const }]),
        ],
      };
    },
    generateBundle() {
      if (!approved) return;
      const sitemap =
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        `  <url><loc>${origin}/</loc></url>\n` +
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
        'example-materials': resolve(root, 'examples/materials.html'),
      },
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
});

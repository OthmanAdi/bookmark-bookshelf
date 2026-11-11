/** A file name made of a name a person chose: lower case, words joined with hyphens, accents dropped. */
export function fileSlug(name: string, fallback = 'shelf'): string {
  const slug = name
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || fallback;
}

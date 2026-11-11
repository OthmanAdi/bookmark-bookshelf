import { describe, expect, it } from 'vitest';
import type { SearchableVolume } from './search';
import { foldText, searchVolumes } from './search';

function vol(id: string, extra: Partial<SearchableVolume> = {}): SearchableVolume {
  return { id, url: `https://example.org/${id}`, title: `Title ${id}`, ...extra };
}

const ids = (volumes: SearchableVolume[], query: string, options?: Parameters<typeof searchVolumes>[2]) =>
  searchVolumes(volumes, query, options).map((hit) => hit.id);

describe('foldText', () => {
  it.each([
    ['Über', 'uber'],
    ['Straße', 'strasse'],
    ['ẞEIT', 'sseit'],
    ['Café À la carte', 'cafe a la carte'],
    ['Café', 'cafe'],
    ['Ångström', 'angstrom'],
    ['MIXED Case', 'mixed case'],
    ['', ''],
  ])('folds %j to %j', (input, expected) => {
    expect(foldText(input)).toBe(expected);
  });

  it('leaves other scripts alone', () => {
    expect(foldText('日本語')).toBe('日本語');
    expect(foldText('مرحبا')).toBe('مرحبا');
  });

  it('gives an empty string for a value that is not text', () => {
    expect(foldText(undefined as unknown as string)).toBe('');
  });
});

describe('searchVolumes matching', () => {
  it('returns nothing for an empty or blank query', () => {
    const volumes = [vol('a')];
    expect(searchVolumes(volumes, '')).toEqual([]);
    expect(searchVolumes(volumes, '   \t ')).toEqual([]);
    expect(searchVolumes(volumes, undefined as unknown as string)).toEqual([]);
  });

  it('returns nothing for an empty library', () => {
    expect(searchVolumes([], 'anything')).toEqual([]);
  });

  it('finds Über with uber, and Straße with strasse, and the other way round', () => {
    const volumes = [vol('a', { title: 'Über das Lesen' }), vol('b', { title: 'Die Straße nach Hause' }), vol('c', { title: 'uber maps' })];
    expect(ids(volumes, 'uber')).toEqual(['a', 'c']);
    expect(ids(volumes, 'ÜBER')).toEqual(['a', 'c']);
    expect(ids(volumes, 'strasse')).toEqual(['b']);
    expect(ids(volumes, 'straße')).toEqual(['b']);
  });

  it('is not case sensitive', () => {
    expect(ids([vol('a', { title: 'Hello World' })], 'hELLO wORLD')).toEqual(['a']);
  });

  it('needs every term, in any field', () => {
    const volumes = [
      vol('a', { title: 'Garden design', author: 'Ada Lovelace', tags: ['history'] }),
      vol('b', { title: 'Garden notes', note: 'by a friend' }),
      vol('c', { title: 'Design patterns', url: 'https://www.garden.example.org/p' }),
    ];
    expect(ids(volumes, 'garden design')).toEqual(['a', 'c']);
    expect(ids(volumes, 'garden lovelace')).toEqual(['a']);
    expect(ids(volumes, 'history ada garden')).toEqual(['a']);
    expect(ids(volumes, 'garden friend')).toEqual(['b']);
    expect(ids(volumes, 'garden missing')).toEqual([]);
  });

  it('matches the host without www, and not the path', () => {
    const volumes = [vol('a', { url: 'https://www.news.example.com/world/story-7', title: 'Story' })];
    expect(ids(volumes, 'news.example')).toEqual(['a']);
    expect(ids(volumes, 'www')).toEqual([]);
    expect(ids(volumes, 'story-7')).toEqual([]);
  });

  it('survives an address that cannot be read', () => {
    expect(ids([vol('a', { url: 'not a url', title: 'Odd' })], 'odd')).toEqual(['a']);
  });

  it('searches the reading text only when asked', () => {
    const volumes = [vol('a', { reading: { text: 'A long passage about lighthouses and the sea.' } })];
    expect(ids(volumes, 'lighthouses')).toEqual([]);
    expect(ids(volumes, 'lighthouses', { includeText: false })).toEqual([]);
    expect(searchVolumes(volumes, 'lighthouses', { includeText: true })).toEqual([
      expect.objectContaining({ id: 'a', field: 'text' }),
    ]);
  });

  it('folds the reading text the same way', () => {
    const volumes = [vol('a', { reading: { text: 'Große Überraschung' } })];
    expect(ids(volumes, 'grosse uberraschung', { includeText: true })).toEqual(['a']);
  });

  it('names the field of the best match', () => {
    const volumes = [
      vol('t', { title: 'Needle' }),
      vol('g', { title: 'x', tags: ['needle'] }),
      vol('u', { title: 'x', author: 'Needle Person' }),
      vol('s', { title: 'x', url: 'https://needle.example.org/' }),
      vol('n', { title: 'x', note: 'a needle' }),
    ];
    const fields = Object.fromEntries(searchVolumes(volumes, 'needle').map((hit) => [hit.id, hit.field]));
    expect(fields).toEqual({ t: 'title', g: 'tags', u: 'author', s: 'source', n: 'note' });
  });

  it('does not change the volumes it is given', () => {
    const volumes = [vol('a', { tags: ['b', 'a'] })];
    const copy = structuredClone(volumes);
    searchVolumes(volumes, 'a');
    expect(volumes).toEqual(copy);
  });
});

describe('searchVolumes ranking', () => {
  it('ranks title start, title, tags, author, host, note and text in that order', () => {
    const volumes = [
      vol('text', { title: 'x', reading: { text: 'the needle is here' } }),
      vol('note', { title: 'x', note: 'needle' }),
      vol('host', { title: 'x', url: 'https://needle.example.org/' }),
      vol('author', { title: 'x', author: 'needle' }),
      vol('tags', { title: 'x', tags: ['needle'] }),
      vol('title', { title: 'A needle in a haystack' }),
      vol('start', { title: 'Needle work' }),
    ];
    expect(ids(volumes, 'needle', { includeText: true })).toEqual(['start', 'title', 'tags', 'author', 'host', 'note', 'text']);
  });

  it('puts a title that starts with the whole query ahead of one that only holds the words', () => {
    const volumes = [
      vol('loose', { title: 'Design for the garden' }),
      vol('phrase', { title: 'Garden design handbook' }),
      vol('contains', { title: 'The garden design book' }),
    ];
    expect(ids(volumes, 'garden design')).toEqual(['phrase', 'contains', 'loose']);
  });

  it('lets the weakest term decide for a query across fields', () => {
    const volumes = [
      vol('weak', { title: 'Alpha', note: 'beta' }),
      vol('strong', { title: 'Alpha beta' }),
    ];
    expect(ids(volumes, 'alpha beta')).toEqual(['strong', 'weak']);
  });

  it('keeps the input order for equal scores', () => {
    const volumes = ['d', 'b', 'a', 'c'].map((id) => vol(id, { title: 'Same words' }));
    expect(ids(volumes, 'same')).toEqual(['d', 'b', 'a', 'c']);
    const scores = new Set(searchVolumes(volumes, 'same').map((hit) => hit.score));
    expect(scores.size).toBe(1);
  });

  it('cuts the list to a limit after ranking', () => {
    const volumes = [vol('c', { title: 'x', note: 'q' }), vol('b', { title: 'q two' }), vol('a', { title: 'q one' })];
    expect(ids(volumes, 'q', { limit: 2 })).toEqual(['b', 'a']);
    expect(ids(volumes, 'q', { limit: 0 })).toEqual([]);
    expect(ids(volumes, 'q', { limit: 99 })).toHaveLength(3);
  });

  it('returns scores that fall as the list goes on', () => {
    const volumes = [vol('a', { title: 'x', note: 'q' }), vol('b', { title: 'q'}), vol('c', { title: 'x q' })];
    const scores = searchVolumes(volumes, 'q').map((hit) => hit.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});

describe('searchVolumes speed', () => {
  it('searches 2,000 volumes well inside the budget', () => {
    const words = ['garden', 'history', 'lighthouse', 'design', 'ocean', 'python', 'kitchen', 'bridge', 'market', 'theory'];
    const volumes: SearchableVolume[] = Array.from({ length: 2000 }, (_value, i) =>
      vol(`v${i}`, {
        title: `${words[i % 10]} ${words[(i * 7) % 10]} notes ${i}`,
        url: `https://www.site${i % 40}.example.org/post/${i}`,
        author: `Author ${i % 25}`,
        note: `A note about ${words[(i * 3) % 10]}`,
        tags: [words[i % 10] ?? '', 'week'],
        reading: { text: `${words[(i * 11) % 10]} `.repeat(200) },
      }),
    );
    searchVolumes(volumes, 'warm up');
    const start = performance.now();
    const found = searchVolumes(volumes, 'garden notes');
    const withText = searchVolumes(volumes, 'ocean market', { includeText: true });
    const elapsed = performance.now() - start;
    expect(found.length).toBeGreaterThan(0);
    expect(withText.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(150);
  });
});

import { describe, expect, it } from 'vitest';
import type { StatsContext, StatsVolume } from './stats';
import { formatShelfStatus, shelfStats } from './stats';

function vol(id: string, extra: Partial<StatsVolume> = {}): StatsVolume {
  return { id, title: `Title ${id}`, ...extra };
}

function context(done: string[] = [], percent: Record<string, number> = {}): StatsContext {
  return { isDone: (id) => done.includes(id), percentOf: (id) => percent[id] ?? 0 };
}

describe('shelfStats', () => {
  it('describes an empty shelf', () => {
    expect(shelfStats([], context())).toEqual({ volumes: 0, required: 0, done: 0, requiredDone: 0 });
  });

  it('counts volumes, required volumes and what is done', () => {
    const volumes = [vol('a'), vol('b', { required: false }), vol('c', { required: true }), vol('d')];
    const stats = shelfStats(volumes, context(['a', 'b']));
    expect(stats).toMatchObject({ volumes: 4, required: 3, done: 2, requiredDone: 1 });
  });

  it('adds up the known lengths, stated or estimated', () => {
    const volumes = [vol('a', { minutes: 10 }), vol('b', { reading: { text: 'word '.repeat(440) } }), vol('c')];
    const stats = shelfStats(volumes, context());
    expect(stats.minutesTotal).toBe(12);
    expect(stats.minutesLeft).toBe(12);
  });

  it('leaves minutes out when no length is known', () => {
    const stats = shelfStats([vol('a'), vol('b')], context());
    expect(stats).not.toHaveProperty('minutesTotal');
    expect(stats).not.toHaveProperty('minutesLeft');
  });

  it('takes finished volumes off the minutes left, and the part read of the others', () => {
    const volumes = [vol('a', { minutes: 20 }), vol('b', { minutes: 40 }), vol('c', { minutes: 10 })];
    const stats = shelfStats(volumes, context(['a'], { b: 0.5 }));
    expect(stats.minutesTotal).toBe(70);
    expect(stats.minutesLeft).toBe(30);
  });

  it('leaves minutesLeft out when everything with a length is done', () => {
    const stats = shelfStats([vol('a', { minutes: 5 }), vol('b')], context(['a']));
    expect(stats.minutesTotal).toBe(5);
    expect(stats).not.toHaveProperty('minutesLeft');
    const all = shelfStats([vol('a', { minutes: 5 })], context(['a']));
    expect(all.minutesLeft).toBeUndefined();
  });

  it('ignores a reading position outside 0 to 1', () => {
    const stats = shelfStats([vol('a', { minutes: 10 }), vol('b', { minutes: 10 })], context([], { a: 4, b: Number.NaN }));
    expect(stats.minutesLeft).toBe(10);
  });

  it('picks the first required volume that is not done as next', () => {
    const volumes = [vol('a', { required: false }), vol('b', { minutes: 8 }), vol('c')];
    expect(shelfStats(volumes, context()).next).toEqual({ id: 'b', title: 'Title b', minutes: 8 });
    expect(shelfStats(volumes, context(['b'])).next).toEqual({ id: 'c', title: 'Title c' });
  });

  it('falls back to the first optional volume that is not done', () => {
    const volumes = [vol('a', { required: false }), vol('b'), vol('c', { required: false })];
    expect(shelfStats(volumes, context(['b'])).next?.id).toBe('a');
    expect(shelfStats(volumes, context(['b', 'a'])).next?.id).toBe('c');
  });

  it('has no next when everything is done', () => {
    expect(shelfStats([vol('a')], context(['a']))).not.toHaveProperty('next');
  });

  it('does not take volumes marked done as next even with no position', () => {
    expect(shelfStats([vol('a'), vol('b')], context(['a'])).next?.id).toBe('b');
  });
});

describe('formatShelfStatus', () => {
  const status = (volumes: StatsVolume[], ctx: StatsContext) => formatShelfStatus(shelfStats(volumes, ctx));

  it('writes the full line', () => {
    const volumes = [
      vol('a', { minutes: 5 }),
      vol('b', { minutes: 15 }),
      vol('c', { minutes: 20 }),
      vol('d', { minutes: 10 }),
      vol('e'),
      vol('f'),
    ];
    expect(status(volumes, context(['a', 'b']))).toBe('2 of 6 read. About 30 min left. Next: Title c');
  });

  it('says so when nothing is read, with the total length', () => {
    const volumes = [vol('a', { minutes: 50 }), vol('b', { minutes: 30 })];
    expect(status(volumes, context())).toBe('Nothing read yet. About 1 h 20 min in all. Next: Title a');
  });

  it('says so when nothing is read and no length is known', () => {
    expect(status([vol('a'), vol('b')], context())).toBe('Nothing read yet. Next: Title a');
  });

  it('leaves the length out when none is known for what is left', () => {
    expect(status([vol('a', { minutes: 5 }), vol('b')], context(['a']))).toBe('1 of 2 read. Next: Title b');
    expect(status([vol('a'), vol('b')], context(['a']))).toBe('1 of 2 read. Next: Title b');
  });

  it('says everything is read', () => {
    expect(status([vol('a'), vol('b'), vol('c')], context(['a', 'b', 'c']))).toBe('All 3 read.');
    expect(status([vol('a')], context(['a']))).toBe('Read.');
  });

  it('says the shelf is empty', () => {
    expect(status([], context())).toBe('Nothing on this shelf yet.');
  });

  it('never says 0 minutes left while something is unread', () => {
    const volumes = [vol('a', { minutes: 1 }), vol('b', { minutes: 1 })];
    expect(status(volumes, context([], { a: 0.2 }))).toBe('Nothing read yet. About 2 min in all. Next: Title a');
    expect(status(volumes, context(['b'], { a: 0.99 }))).toBe('1 of 2 read. About 1 min left. Next: Title a');
  });

  it('leaves the title of the next volume as it is', () => {
    expect(status([vol('a', { title: 'Grüße: a "quote" & more' })], context())).toBe(
      'Nothing read yet. Next: Grüße: a "quote" & more',
    );
  });
});

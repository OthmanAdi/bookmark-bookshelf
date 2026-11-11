import { describe, expect, it, vi } from 'vitest';
import { createAnnouncer, examplesSentence, firstToRead, positionSentence, renderStatus, statusLine } from './status';

describe('announcements', () => {
  it('says the title and the place in the row', () => {
    expect(positionSentence('What is a URL?', 2, 14)).toBe('What is a URL?, 3 of 14');
  });

  it('clears the region first so the same words are heard again', () => {
    vi.useFakeTimers();
    const region = document.createElement('p');
    const say = createAnnouncer(region);
    say('Link rot, 2 of 6');
    expect(region.textContent).toBe('');
    vi.advanceTimersByTime(60);
    expect(region.textContent).toBe('Link rot, 2 of 6');
    say('Link rot, 2 of 6');
    expect(region.textContent).toBe('');
    vi.advanceTimersByTime(60);
    expect(region.textContent).toBe('Link rot, 2 of 6');
    vi.useRealTimers();
  });
});

describe('examplesSentence', () => {
  it('counts the examples that remain', () => {
    expect(examplesSentence(15)).toBe('These 15 links are examples. Add your own, or remove the examples.');
    expect(examplesSentence(1)).toBe('This link is an example. Add your own, or remove it.');
  });
});

const volumes = [
  { id: 'a', title: 'What is a URL?', minutes: 6 },
  { id: 'b', title: 'Link rot', minutes: 10, required: false },
  { id: 'c', title: 'Paper size', minutes: 20 },
];

const context = (done: string[], percent: Record<string, number> = {}) => ({
  isDone: (id: string) => done.includes(id),
  percentOf: (id: string) => percent[id] ?? 0,
});

describe('statusLine', () => {
  it('says what is read, what is left and what is next', () => {
    expect(statusLine(volumes, context(['a']))).toEqual({
      text: '1 of 3 read. About 30 min left.',
      next: { id: 'c', title: 'Paper size' },
    });
  });

  it('says when nothing is read yet', () => {
    expect(statusLine(volumes, context([])).text).toBe('Nothing read yet. About 36 min in all.');
  });

  it('has nothing next when all is read', () => {
    expect(statusLine(volumes, context(['a', 'b', 'c']))).toEqual({ text: 'All 3 read.' });
  });
});

describe('firstToRead', () => {
  it('prefers the first required link that is not done', () => {
    expect(firstToRead(volumes, context(['a']))).toBe('c');
    expect(firstToRead(volumes, context(['a', 'c']))).toBe('b');
    expect(firstToRead(volumes, context(['a', 'b', 'c']))).toBeUndefined();
  });
});

describe('renderStatus', () => {
  it('writes the line with the next title as a button', () => {
    const host = document.createElement('p');
    document.body.replaceChildren(host);
    const onNext = vi.fn();
    renderStatus(host, { text: '1 of 3 read.', next: { id: 'c', title: 'Paper size' } }, onNext);
    expect(host.hidden).toBe(false);
    expect(host.textContent).toBe('1 of 3 read. Next: Paper size');
    host.querySelector('button')!.click();
    expect(onNext).toHaveBeenCalledWith('c');
  });

  it('keeps focus on the next button when the line is written again', () => {
    const host = document.createElement('p');
    document.body.replaceChildren(host);
    renderStatus(host, { text: 'Nothing read yet.', next: { id: 'a', title: 'What is a URL?' } }, vi.fn());
    host.querySelector('button')!.focus();
    renderStatus(host, { text: '1 of 3 read.', next: { id: 'c', title: 'Paper size' } }, vi.fn());
    expect(document.activeElement).toBe(host.querySelector('button'));
  });

  it('hides when there is no line', () => {
    const host = document.createElement('p');
    renderStatus(host, null, vi.fn());
    expect(host.hidden).toBe(true);
  });
});

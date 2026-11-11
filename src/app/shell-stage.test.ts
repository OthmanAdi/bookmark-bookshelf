import { afterEach, describe, expect, it, vi } from 'vitest';
import { captionLine, createStageCaption, primaryAction, savedOn, type LinkView, type StageElements } from './shell-stage';

const now = new Date(2026, 10, 11, 12, 0);
const sept14 = new Date(2026, 8, 14, 9, 30).toISOString();

function link(overrides: Partial<LinkView> = {}): LinkView {
  return {
    id: 'a',
    title: 'On Piles of Unread Books',
    url: 'https://example.org/piles',
    addedAt: sept14,
    hasText: true,
    percent: 0,
    done: false,
    minutes: 6,
    ...overrides,
  };
}

function elements(): StageElements {
  document.body.replaceChildren();
  const root = document.createElement('div');
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] => {
    const element = document.createElement(tag);
    root.appendChild(element);
    return element;
  };
  const result: StageElements = {
    root,
    title: make('h2'),
    line: make('p'),
    previous: make('button'),
    next: make('button'),
    primary: make('button'),
    original: make('a'),
    edit: make('button'),
    earlier: make('button'),
    later: make('button'),
  };
  document.body.appendChild(root);
  return result;
}

function handlers() {
  return { step: vi.fn(), primary: vi.fn(), edit: vi.fn(), move: vi.fn() };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('primaryAction', () => {
  it('offers to add text when none is saved', () => {
    expect(primaryAction({ hasText: false, percent: 0.5, done: false })).toEqual({ kind: 'add-text', label: 'Add text' });
  });

  it('says Read before anything is read', () => {
    expect(primaryAction({ hasText: true, percent: 0, done: false }).label).toBe('Read');
    expect(primaryAction({ hasText: true, percent: Number.NaN, done: false }).label).toBe('Read');
  });

  it('names the place to resume at', () => {
    expect(primaryAction({ hasText: true, percent: 0.34, done: false })).toEqual({ kind: 'resume', label: 'Resume at 34%' });
  });

  it('says Read again at the end or once marked read', () => {
    expect(primaryAction({ hasText: true, percent: 1, done: false }).label).toBe('Read again');
    expect(primaryAction({ hasText: true, percent: 0.996, done: false }).label).toBe('Read again');
    expect(primaryAction({ hasText: true, percent: 0.2, done: true }).kind).toBe('again');
  });
});

describe('caption line', () => {
  it('writes the day and month, and the year only when it is not this year', () => {
    expect(savedOn(sept14, now)).toBe('14 Sep');
    expect(savedOn(new Date(2025, 0, 3).toISOString(), now)).toBe('3 Jan 2025');
    expect(savedOn('not a date', now)).toBe('');
  });

  it('prefers the note, on one line', () => {
    expect(captionLine({ note: '  For the essay,\n week three ', addedAt: sept14, minutes: 6 }, now)).toEqual({
      text: 'For the essay, week three',
      isNote: true,
    });
  });

  it('otherwise says when it was saved and how long it is', () => {
    expect(captionLine({ addedAt: sept14, minutes: 6 }, now)).toEqual({ text: 'Saved 14 Sep, 6 min', isNote: false });
    expect(captionLine({ addedAt: sept14 }, now).text).toBe('Saved 14 Sep');
  });
});

describe('createStageCaption', () => {
  it('changes words in place and keeps the same buttons', () => {
    const parts = elements();
    const stage = createStageCaption(parts, handlers(), { now: () => now });
    const primary = parts.primary;
    stage.show(link());
    expect(parts.title.textContent).toBe('On Piles of Unread Books');
    expect(parts.line.textContent).toBe('Saved 14 Sep, 6 min');
    expect(parts.primary.textContent).toBe('Read');
    expect(parts.original.getAttribute('href')).toBe('https://example.org/piles');

    stage.show(link({ id: 'b', title: 'Notes in the Margin', note: 'Read before Monday', percent: 0.5 }));
    expect(parts.primary).toBe(primary);
    expect(parts.primary.textContent).toBe('Resume at 50%');
    expect(parts.line.textContent).toBe('Read before Monday');
    expect(parts.line.classList.contains('is-note')).toBe(true);
    expect(parts.root.dataset.empty).toBe('0');

    stage.show(null);
    expect(parts.root.dataset.empty).toBe('1');
  });

  it('fades the old words out before the new ones arrive, and keeps only the latest', () => {
    vi.useFakeTimers();
    const parts = elements();
    const stage = createStageCaption(parts, handlers(), { now: () => now });
    stage.show(link());
    stage.show(link({ id: 'b', title: 'Second' }), { swap: true });
    stage.show(link({ id: 'c', title: 'Third' }), { swap: true });
    expect(parts.root.classList.contains('is-leaving')).toBe(true);
    expect(parts.title.textContent).toBe('On Piles of Unread Books');
    vi.advanceTimersByTime(100);
    expect(parts.title.textContent).toBe('Third');
    expect(parts.root.classList.contains('is-leaving')).toBe(false);
  });

  it('changes at once under reduced motion', () => {
    const parts = elements();
    const stage = createStageCaption(parts, handlers(), { now: () => now, reduced: () => true });
    stage.show(link({ title: 'Now' }), { swap: true });
    expect(parts.title.textContent).toBe('Now');
  });

  it('acts on the link shown when pressed', () => {
    const parts = elements();
    const calls = handlers();
    const stage = createStageCaption(parts, calls, { now: () => now });
    stage.show(link({ id: 'z', hasText: false }));
    parts.primary.click();
    parts.edit.click();
    parts.next.click();
    expect(calls.primary).toHaveBeenCalledWith('z', 'add-text');
    expect(calls.edit).toHaveBeenCalledWith('z');
    expect(calls.step).toHaveBeenCalledWith(1);
  });

  it('shows the move buttons only where moving is possible and never drops focus', () => {
    const parts = elements();
    const calls = handlers();
    const stage = createStageCaption(parts, calls, { now: () => now });
    stage.show(link());
    stage.setPlace({ atStart: false, atEnd: false, canMove: true, first: true, last: false });
    expect(parts.earlier.hidden).toBe(false);
    expect(parts.earlier.getAttribute('aria-disabled')).toBe('true');
    parts.earlier.click();
    expect(calls.move).not.toHaveBeenCalled();
    parts.later.click();
    expect(calls.move).toHaveBeenCalledWith('a', 1);

    parts.later.focus();
    stage.setPlace({ atStart: false, atEnd: false, canMove: false, first: false, last: false });
    expect(parts.later.hidden).toBe(true);
    expect(document.activeElement).toBe(parts.edit);
  });

  it('still steps from the end of a row with two ends, and marks the arrow', () => {
    const parts = elements();
    const calls = handlers();
    const stage = createStageCaption(parts, calls, { now: () => now });
    stage.setPlace({ atStart: true, atEnd: false, canMove: false, first: true, last: false });
    expect(parts.previous.dataset.end).toBe('true');
    parts.previous.click();
    expect(calls.step).toHaveBeenCalledWith(-1);
    expect(parts.previous.classList.contains('is-bumping')).toBe(true);
  });
});

/**
 * The rail: one tick for every book, the one in view marked. Each tick is a button with the book's
 * name. A long library draws its ticks closer together, never closer than three px, and past that one
 * tick stands for several books.
 */

/** Distance between two ticks when there is room, in px. */
export const TICK_PITCH = 14;
/** Ticks are never drawn closer than this. */
export const TICK_MIN = 3;

export interface RailLayout {
  /** Books one tick stands for. */
  group: number;
  /** How many ticks are drawn. */
  ticks: number;
  /** Distance from one tick to the next, in px. */
  pitch: number;
}

/** Fits `count` books into a rail `length` px long. */
export function railLayout(count: number, length: number): RailLayout {
  if (count <= 0) return { group: 1, ticks: 0, pitch: TICK_PITCH };
  const room = Math.max(TICK_MIN, length);
  // The largest number of ticks that still stand three px apart.
  const most = Math.max(1, Math.floor(room / TICK_MIN));
  const group = Math.max(1, Math.ceil(count / most));
  const ticks = Math.ceil(count / group);
  const pitch = Math.min(TICK_PITCH, Math.max(TICK_MIN, room / ticks));
  return { group, ticks, pitch };
}

/** The tick a book belongs to. */
export function tickOf(index: number, layout: RailLayout): number {
  return layout.ticks === 0 ? 0 : Math.min(layout.ticks - 1, Math.max(0, Math.floor(index / layout.group)));
}

/** The books a tick stands for, first and last, both included. */
export function rangeOf(tick: number, layout: RailLayout, count: number): [number, number] {
  const first = Math.min(count - 1, tick * layout.group);
  return [first, Math.min(count - 1, first + layout.group - 1)];
}

/** The name a tick answers to. */
export function tickName(tick: number, layout: RailLayout, titles: readonly string[]): string {
  const count = titles.length;
  const [first, last] = rangeOf(tick, layout, count);
  if (first === last) return `${first + 1} of ${count}: ${titles[first] ?? ''}`;
  return `${first + 1} to ${last + 1} of ${count}: ${titles[first] ?? ''} to ${titles[last] ?? ''}`;
}

export interface Rail {
  readonly element: HTMLElement;
  /** Draws the ticks again for these books. Cheap when nothing about them changed. */
  render(titles: readonly string[], current: number): void;
  /** Marks another book as the one in view. */
  mark(current: number): void;
  /** Measures the rail again, after the stage changed size or turned on its side. */
  fit(): void;
  destroy(): void;
}

export function createRail(onPick: (index: number) => void): Rail {
  const element = document.createElement('nav');
  element.className = 'bb-showcase__rail';
  element.setAttribute('aria-label', 'Books');
  const track = document.createElement('div');
  track.className = 'bb-showcase__ticks';
  element.appendChild(track);

  let titles: readonly string[] = [];
  let current = 0;
  let layout: RailLayout = railLayout(0, 0);
  let buttons: HTMLButtonElement[] = [];
  let drawn = '';

  const lengthOf = (): number => {
    const sideways = getComputedStyle(element).flexDirection === 'row';
    const box = element.getBoundingClientRect();
    // Before the first layout there is nothing to measure: draw as if there were room for everyone.
    const length = sideways ? box.width : box.height;
    return length > 0 ? length : titles.length * TICK_PITCH;
  };

  function draw(): void {
    layout = railLayout(titles.length, lengthOf());
    const key = `${layout.group}|${layout.ticks}|${layout.pitch.toFixed(2)}|${titles.join('\u0001')}`;
    if (key !== drawn) {
      drawn = key;
      const hadFocus = track.contains(document.activeElement);
      track.style.setProperty('--bb-tick-pitch', `${layout.pitch}px`);
      track.dataset.dense = layout.pitch < 8 ? '1' : '0';
      buttons = Array.from({ length: layout.ticks }, (_, tick) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'bb-showcase__tick';
        const name = tickName(tick, layout, titles);
        button.setAttribute('aria-label', name);
        button.dataset.tick = String(tick);
        const mark = document.createElement('span');
        mark.className = 'bb-showcase__tick-mark';
        const tip = document.createElement('span');
        tip.className = 'bb-showcase__tip';
        tip.setAttribute('aria-hidden', 'true');
        const [first, last] = rangeOf(tick, layout, titles.length);
        tip.textContent = first === last ? (titles[first] ?? '') : `${first + 1} to ${last + 1}`;
        button.append(mark, tip);
        return button;
      });
      track.replaceChildren(...buttons);
      if (hadFocus) buttons[tickOf(current, layout)]?.focus({ preventScroll: true });
    }
    mark(current);
  }

  function mark(index: number): void {
    current = index;
    const active = tickOf(index, layout);
    const focusInside = track.contains(document.activeElement);
    buttons.forEach((button, tick) => {
      const on = tick === active;
      if (on) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
      // One stop for Tab: the tick of the book in view. The keys that move between books move it.
      button.tabIndex = on ? 0 : -1;
    });
    if (focusInside && document.activeElement !== buttons[active]) buttons[active]?.focus({ preventScroll: true });
  }

  const onClick = (event: MouseEvent): void => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('.bb-showcase__tick');
    if (!button) return;
    const tick = Number(button.dataset.tick);
    const [first, last] = rangeOf(tick, layout, titles.length);
    // A tick that stands for several books and already holds the one in view moves on inside its group.
    const inside = current >= first && current <= last;
    onPick(inside && current < last ? current + 1 : first);
  };
  track.addEventListener('click', onClick);

  return {
    element,
    render(nextTitles, index) {
      titles = nextTitles;
      current = index;
      draw();
    },
    mark,
    fit: draw,
    destroy() {
      track.removeEventListener('click', onClick);
      element.remove();
    },
  };
}

import { createCover } from '../shelf/cover-art';
import { resolveCloth } from '../shelf/variants';
import type { ShelfItem } from '../shelf/types';
import { type BookBox, type BookFrame, type Drawing, REST, type ShowcaseLook, thicknessShare } from './types';

/**
 * The classic drawing: a book made of six CSS planes. The front board carries the same cover the shelf
 * and the reader show, the spine its title, and the three open sides the edges of the page block. Light
 * is a band laid over the cover that slides as the book turns.
 */

interface Built {
  root: HTMLElement;
  key: string;
}

const DEG = Math.PI / 180;

function face(name: string): HTMLElement {
  const element = document.createElement('span');
  element.className = `bb-showcase__face bb-showcase__face--${name}`;
  return element;
}

function build(item: ShelfItem, look: ShowcaseLook): HTMLElement {
  const root = document.createElement('div');
  root.className = `bb-showcase__book bb-cloth--${resolveCloth(item.cloth)}`;
  root.style.setProperty('--bb-book-t', String(thicknessShare(item.thickness)));

  const back = face('back');
  const pages = ['fore', 'head', 'foot'].map(face);
  const leaf = face('leaf');
  const spine = face('spine');
  const title = document.createElement('span');
  title.className = 'bb-showcase__spine-title';
  title.textContent = item.title;
  const mark = document.createElement('span');
  mark.className = 'bb-showcase__spine-mark';
  mark.textContent = item.mark ?? '';
  spine.append(mark, title);

  const front = face('front');
  front.appendChild(createCover(item, item.mark, { aspect: look.aspect }));
  const sheen = document.createElement('span');
  sheen.className = 'bb-showcase__sheen';
  front.appendChild(sheen);

  root.append(back, ...pages, leaf, spine, front);
  return root;
}

const keyOf = (item: ShelfItem, look: ShowcaseLook): string =>
  [item.id, item.title, item.source, item.author, item.cloth, item.pattern, item.seed, item.mark, item.done ? 1 : 0, item.thickness, look.variant, look.aspect].join('|');

/** The light on the cover for a book turned `yaw` degrees and tipped `pitch` degrees. */
export function lightOf(yaw: number, pitch: number): { sheen: number; sweep: number; front: number; spine: number } {
  // The band is brightest when the cover stands half way between the light at the upper left and the viewer.
  const facing = Math.max(0, Math.cos((yaw - 14) * DEG));
  const sheen = 0.3 * facing ** 10;
  const sweep = Math.min(1, Math.max(0, 0.5 + (yaw - 14) / 56 + pitch / 90));
  const front = Math.min(0.5, Math.max(0, (1 - Math.cos(yaw * DEG)) * 0.9));
  const spine = Math.min(0.5, Math.max(0.06, 0.4 - 0.34 * Math.sin(Math.max(0, yaw) * DEG)));
  return { sheen, sweep, front, spine };
}

export function createClassicDrawing(): Drawing {
  const element = document.createElement('div');
  element.className = 'bb-showcase__classic';
  const books = new Map<number, Built>();
  let look: ShowcaseLook = { variant: 'paper', aspect: 0.68 };
  let box: BookBox | null = null;

  function size(): void {
    if (!box) return;
    element.style.setProperty('--bb-book-w', `${box.width}px`);
    element.style.setProperty('--bb-book-h', `${box.height}px`);
    element.style.perspective = `${box.perspective}px`;
    // The cover scales its hairlines and corners from the size it has on a shelf at scale 1.
    element.style.setProperty('--bb-cover-k', String(box.height / 300));
  }

  return {
    kind: 'classic',
    element,
    setLook(next) {
      look = next;
    },
    resize(next) {
      box = next;
      size();
    },
    setPointer() {},
    reset() {
      for (const built of books.values()) built.root.remove();
      books.clear();
    },
    draw(frames) {
      if (!box) return;
      const seen = new Set<number>();
      for (const frame of frames) {
        seen.add(frame.index);
        const key = keyOf(frame.item, look);
        let built = books.get(frame.index);
        if (!built || built.key !== key) {
          built?.root.remove();
          built = { root: build(frame.item, look), key };
          books.set(frame.index, built);
          element.appendChild(built.root);
        }
        const { root } = built;
        // The book heading for the centre is drawn over one that is leaving.
        if (frame.target && root.nextSibling) element.appendChild(root);
        const yaw = REST.yaw + frame.stand.yaw + frame.turn.yaw;
        const pitch = REST.pitch + frame.stand.pitch + frame.turn.pitch;
        const roll = REST.roll + frame.stand.roll;
        const y = frame.stand.y * box.stageHeight;
        const z = -frame.stand.back * box.stageHeight;
        root.style.transform = `translate3d(0, ${y.toFixed(2)}px, ${z.toFixed(2)}px) rotateZ(${roll.toFixed(3)}deg) rotateX(${pitch.toFixed(3)}deg) rotateY(${yaw.toFixed(3)}deg)`;
        // Each plane fades on its own: fading the book as a whole would flatten it.
        root.style.setProperty('--bb-fade', frame.opacity.toFixed(3));
        root.dataset.offset = frame.stand.y.toFixed(3);
        root.dataset.index = String(frame.index);
        const light = lightOf(yaw, pitch);
        root.style.setProperty('--bb-sheen', light.sheen.toFixed(3));
        root.style.setProperty('--bb-sweep', light.sweep.toFixed(3));
        root.style.setProperty('--bb-shade-front', light.front.toFixed(3));
        root.style.setProperty('--bb-shade-spine', light.spine.toFixed(3));
        root.style.setProperty('--bb-peek', frame.peek.toFixed(3));
      }
      for (const [index, built] of books) {
        if (seen.has(index)) continue;
        built.root.remove();
        books.delete(index);
      }
    },
    destroy() {
      element.remove();
      books.clear();
    },
  };
}

import { resolveCloth, resolvePattern, type PatternName } from './variants';
import type { ShelfItem } from './types';
import { fitTitle, linesOf, type TitleBox } from './cover-title';
import { imprintOf } from './imprint';

/**
 * Procedural cover art. Every cover is drawn from a seed with plain SVG shapes,
 * so the project ships no image files and two volumes rarely look alike.
 * Built with DOM calls only: nothing here parses markup.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Small deterministic generator (mulberry32). Same seed, same cover. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shape(name: string, attributes: Record<string, string | number>): SVGElement {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

const round = (value: number): number => Math.round(value * 100) / 100;

type Painter = (random: () => number) => SVGElement[];

const painters: Record<PatternName, Painter> = {
  arcs(random) {
    const centre = 50 + (random() - 0.5) * 36;
    const rings = 5 + Math.floor(random() * 3);
    const step = 78 / rings;
    const shapes: SVGElement[] = [];
    for (let ring = rings - 1; ring >= 0; ring--) {
      shapes.push(
        shape('circle', {
          cx: round(centre),
          cy: 100,
          r: round(12 + ring * step),
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': round(step * 0.42),
          opacity: round(1 - ring * 0.09),
        }),
      );
    }
    shapes.push(shape('circle', { cx: round(centre), cy: 100, r: 6, fill: 'currentColor' }));
    return shapes;
  },

  bars(random) {
    const count = 9 + Math.floor(random() * 5);
    const slot = 100 / count;
    const shapes: SVGElement[] = [];
    for (let index = 0; index < count; index++) {
      const height = 18 + random() * 76;
      shapes.push(
        shape('rect', {
          x: round(index * slot + slot * 0.19),
          y: round(100 - height),
          width: round(slot * 0.62),
          height: round(height),
          fill: 'currentColor',
          opacity: random() > 0.35 ? 1 : 0.5,
        }),
      );
    }
    return shapes;
  },

  dots(random) {
    const focusX = 15 + random() * 70;
    const focusY = 15 + random() * 70;
    const shapes: SVGElement[] = [];
    const cells = 7;
    const pitch = 100 / cells;
    for (let row = 0; row < cells; row++) {
      for (let column = 0; column < cells; column++) {
        const x = column * pitch + pitch / 2;
        const y = row * pitch + pitch / 2;
        const distance = Math.hypot(x - focusX, y - focusY) / 110;
        const radius = 1.1 + 4.6 * Math.pow(Math.max(0, 1 - distance), 1.6);
        shapes.push(shape('circle', { cx: round(x), cy: round(y), r: round(radius), fill: 'currentColor' }));
      }
    }
    return shapes;
  },

  rays(random) {
    const originX = 22 + random() * 56;
    const count = 13 + Math.floor(random() * 7);
    const shapes: SVGElement[] = [];
    for (let index = 0; index < count; index++) {
      const angle = Math.PI * (0.04 + (0.92 * index) / (count - 1));
      shapes.push(
        shape('line', {
          x1: round(originX),
          y1: 100,
          x2: round(originX - Math.cos(angle) * 150),
          y2: round(100 - Math.sin(angle) * 150),
          stroke: 'currentColor',
          'stroke-width': index % 3 === 0 ? 2.6 : 1.3,
          'stroke-linecap': 'round',
        }),
      );
    }
    shapes.push(shape('circle', { cx: round(originX), cy: 100, r: round(11 + random() * 8), fill: 'currentColor' }));
    return shapes;
  },

  tiles(random) {
    const cells = 5;
    const size = 100 / cells;
    const shapes: SVGElement[] = [];
    for (let row = 0; row < cells; row++) {
      for (let column = 0; column < cells; column++) {
        const x = column * size;
        const y = row * size;
        const corner = Math.floor(random() * 4);
        // A quarter disc anchored in one of the four corners of the cell.
        const paths = [
          `M${x} ${y} h${size} a${size} ${size} 0 0 1 -${size} ${size} z`,
          `M${x + size} ${y} v${size} a${size} ${size} 0 0 1 -${size} -${size} z`,
          `M${x + size} ${y + size} h-${size} a${size} ${size} 0 0 1 ${size} -${size} z`,
          `M${x} ${y + size} v-${size} a${size} ${size} 0 0 1 ${size} ${size} z`,
        ];
        shapes.push(
          shape('path', { d: paths[corner] ?? paths[0]!, fill: 'currentColor', opacity: random() > 0.3 ? 1 : 0.45 }),
        );
      }
    }
    return shapes;
  },

  waves(random) {
    const lines = 7 + Math.floor(random() * 3);
    const gap = 100 / (lines + 1);
    const wavelength = 22 + random() * 22;
    const shapes: SVGElement[] = [];
    for (let line = 0; line < lines; line++) {
      const y = gap * (line + 1);
      const amplitude = 2.5 + random() * 4.5;
      const phase = random() * wavelength;
      let path = `M${round(-phase)} ${round(y)}`;
      for (let x = -phase; x < 100 + wavelength; x += wavelength) {
        path += ` q${round(wavelength / 4)} ${round(-amplitude)} ${round(wavelength / 2)} 0 t${round(wavelength / 2)} 0`;
      }
      shapes.push(
        shape('path', {
          d: path,
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': line % 2 === 0 ? 2.8 : 1.4,
          'stroke-linecap': 'round',
        }),
      );
    }
    return shapes;
  },
};

/** The drawing alone, as a decorative SVG that fills its box. */
export function createCoverArt(pattern: string | undefined, seed = 1): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('bb-cover__art');
  const name = resolvePattern(pattern);
  for (const element of painters[name](createRandom(seed))) svg.appendChild(element);
  return svg;
}

/** A BCP 47 tag as the store keeps it. Anything else is left off rather than passed to the page. */
const LANG = /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8}){0,4}$/;

/**
 * The head of the cover in cqw, mirroring cover.css. Its height is taken for the squarest cover a look
 * uses (0.7 wide for 1 high), so a title that fits there fits every look at the same size.
 */
const HEAD = { top: 10, measure: 79, height: (100 / 0.7) * 0.47 - 10, gap: 3 };
const AUTHOR = { size: 5.6, leading: 1.2, lines: 2 };
const TITLE = { max: 13.6, min: 7.5, leading: 1.04 };

function titleBox(item: ShelfItem): TitleBox {
  let height = HEAD.height;
  if (item.author) {
    const lines = Math.min(AUTHOR.lines, linesOf(item.author, AUTHOR.size, HEAD.measure));
    height -= lines * AUTHOR.size * AUTHOR.leading + HEAD.gap;
  }
  return { measure: HEAD.measure, height, ...TITLE };
}

function textElement(tag: string, className: string, text: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

/**
 * A complete front cover: cloth, title, drawing, and at the foot the imprint of the site it comes from.
 * It sizes its type from its own width, so the same element works at spine
 * scale on the shelf and at full size beside the reader. Everything on it is
 * said again next to it (caption, reader heading), so it is hidden from
 * assistive technology.
 */
export function createCover(item: ShelfItem, mark?: string): HTMLElement {
  const cover = document.createElement('span');
  cover.className = `bb-cover bb-cloth--${resolveCloth(item.cloth)}`;
  cover.dataset.pattern = resolvePattern(item.pattern);
  cover.setAttribute('aria-hidden', 'true');
  if (item.lang && LANG.test(item.lang)) cover.lang = item.lang;

  const head = document.createElement('span');
  head.className = 'bb-cover__head';
  const title = textElement('span', 'bb-cover__title', item.title);
  const fit = fitTitle(item.title, titleBox(item));
  title.style.setProperty('--bb-cover-title', `${fit.size}cqw`);
  title.style.setProperty('--bb-cover-lines', String(fit.clamp));
  if (fit.broken) title.classList.add('bb-cover__title--break');
  head.appendChild(title);
  if (item.author) head.appendChild(textElement('span', 'bb-cover__author', item.author));
  cover.appendChild(head);

  const plate = document.createElement('span');
  plate.className = 'bb-cover__plate';
  plate.appendChild(createCoverArt(item.pattern, item.seed ?? 1));
  cover.appendChild(plate);

  const imprint = imprintOf(item.source).name;
  const label = mark ?? item.mark;
  if (imprint || label) {
    const foot = document.createElement('span');
    foot.className = 'bb-cover__foot';
    if (imprint) foot.appendChild(textElement('span', 'bb-cover__imprint', imprint));
    if (label) foot.appendChild(textElement('span', 'bb-cover__mark', label));
    cover.appendChild(foot);
  }
  return cover;
}

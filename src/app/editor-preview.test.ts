import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShelfItem } from '../shelf';
import type { BookBox, BookFrame, Drawing } from '../showcase/types';
import { createEditorPreview, PREVIEW_SCALE, type PreviewState } from './editor-preview';

const item = (over: Partial<ShelfItem> = {}): ShelfItem => ({ id: 'a', title: 'A page', cloth: 'rust', pattern: 'arcs', seed: 7, ...over });

/** A stand-in for the WebGL book: it records what it was asked to draw. */
function fakeStudio() {
  const drawn: BookFrame[][] = [];
  const boxes: BookBox[] = [];
  let failure: ((reason: string) => void) | undefined;
  const element = document.createElement('div');
  element.className = 'fake-studio';
  const drawing: Drawing = {
    kind: 'studio',
    element,
    setLook: vi.fn(),
    resize: (box) => void boxes.push(box),
    setPointer: vi.fn(),
    draw: (frames) => void drawn.push([...frames]),
    reset: vi.fn(),
    destroy: vi.fn(() => element.remove()),
  };
  const createStudioDrawing = vi.fn((options: { onFailure(reason: string): void }) => {
    failure = options.onFailure;
    return drawing;
  });
  return { drawing, drawn, boxes, createStudioDrawing, fail: (reason: string) => failure?.(reason) };
}

let stage: HTMLElement;
let states: PreviewState[];
let frames: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  document.body.replaceChildren();
  stage = document.createElement('div');
  document.body.appendChild(stage);
  states = [];
  frames = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function preview(options: { reduced?: boolean; loadStudio?: () => Promise<{ createStudioDrawing: ReturnType<typeof fakeStudio>['createStudioDrawing'] }> } = {}) {
  return createEditorPreview({
    stage,
    look: () => ({ variant: 'paper', aspect: 0.68 }),
    reduced: () => options.reduced ?? false,
    onState: (state) => states.push(state),
    loadStudio: options.loadStudio,
  });
}

const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('the CSS book', () => {
  it('stands on the stage at once, with the cover of the item', () => {
    const book = preview();
    book.open(false);
    book.show(item());
    expect(book.state).toBe('classic');
    expect(stage.dataset.preview).toBe('classic');
    expect(stage.querySelector('.bb-showcase__classic .bb-showcase__book.bb-cloth--rust')).not.toBeNull();
    expect(stage.querySelector('.bb-cover__title')?.textContent).toBe('A page');
  });

  it('is drawn again for every change', () => {
    const book = preview();
    book.open(false);
    book.show(item());
    book.show(item({ cloth: 'moss', title: 'Another page' }));
    expect(stage.querySelectorAll('.bb-showcase__book')).toHaveLength(1);
    expect(stage.querySelector('.bb-showcase__book.bb-cloth--moss')).not.toBeNull();
    expect(stage.querySelector('.bb-cover__title')?.textContent).toBe('Another page');
  });

  it('is taken away when the preview closes', () => {
    const book = preview();
    book.open(false);
    book.show(item());
    book.close();
    expect(stage.querySelector('.bb-showcase__classic')).toBeNull();
    expect(stage.dataset.preview).toBeUndefined();
  });
});

describe('the lit book', () => {
  it('is loaded only when asked for', () => {
    const studio = fakeStudio();
    const loadStudio = vi.fn(async () => studio);
    preview({ loadStudio }).open(false);
    expect(loadStudio).not.toHaveBeenCalled();
  });

  it('takes the place of the CSS book once it has loaded, drawn larger than it is shown', async () => {
    const studio = fakeStudio();
    const book = preview({ loadStudio: async () => studio });
    book.open(true);
    book.show(item());
    expect(book.state).toBe('preparing');
    expect(stage.querySelector('.bb-showcase__classic')).not.toBeNull();
    await settle();
    expect(states).toEqual(['classic', 'preparing', 'studio']);
    expect(stage.querySelector('.bb-showcase__classic')).toBeNull();
    expect(stage.querySelector('.fake-studio')).not.toBeNull();
    expect(studio.drawn.at(-1)?.[0]?.item.title).toBe('A page');
    const box = studio.boxes.at(-1)!;
    expect(box.height / PREVIEW_SCALE).toBeGreaterThanOrEqual(112);
    expect(box.height / PREVIEW_SCALE).toBeLessThanOrEqual(160);
  });

  it('follows every change', async () => {
    const studio = fakeStudio();
    const book = preview({ loadStudio: async () => studio });
    book.open(true);
    await settle();
    book.show(item({ binding: 'leather', stamp: 'copper' }));
    expect(studio.drawn.at(-1)?.[0]?.item).toMatchObject({ binding: 'leather', stamp: 'copper' });
  });

  it('is destroyed when the preview closes, and one that arrives later is not used', async () => {
    const studio = fakeStudio();
    const book = preview({ loadStudio: async () => studio });
    book.open(true);
    await settle();
    book.close();
    expect(studio.drawing.destroy).toHaveBeenCalledOnce();
    expect(stage.querySelector('.fake-studio')).toBeNull();

    const late = fakeStudio();
    const second = preview({ loadStudio: async () => late });
    second.open(true);
    second.close();
    await settle();
    expect(late.createStudioDrawing).not.toHaveBeenCalled();
  });

  it('gives way to the CSS book when it cannot load', async () => {
    const book = preview({ loadStudio: () => Promise.reject(new Error('offline')) });
    book.open(true);
    book.show(item());
    await settle();
    expect(book.state).toBe('stopped');
    expect(stage.querySelector('.bb-showcase__classic .bb-cover__title')?.textContent).toBe('A page');
  });

  it('gives way to the CSS book when WebGL is lost', async () => {
    const studio = fakeStudio();
    const book = preview({ loadStudio: async () => studio });
    book.open(true);
    book.show(item());
    await settle();
    studio.fail('The WebGL context was lost.');
    expect(book.state).toBe('stopped');
    expect(studio.drawing.destroy).toHaveBeenCalledOnce();
    expect(stage.querySelector('.bb-showcase__classic')).not.toBeNull();
  });
});

describe('movement', () => {
  it('turns the book once after a change that is worth a look, and not for typing', () => {
    const book = preview();
    book.open(false);
    book.show(item());
    expect(frames).not.toHaveBeenCalled();
    book.show(item({ binding: 'velvet' }), true);
    expect(frames).toHaveBeenCalledOnce();
  });

  it('moves nothing under reduced motion', async () => {
    const studio = fakeStudio();
    const book = preview({ reduced: true, loadStudio: async () => studio });
    book.open(true);
    book.show(item(), true);
    await settle();
    stage.dispatchEvent(new MouseEvent('pointermove', { clientX: 10, clientY: 10 }));
    book.show(item({ stamp: 'gold' }), true);
    expect(frames).not.toHaveBeenCalled();
    expect(studio.drawn.at(-1)?.[0]?.turn).toEqual({ yaw: 0, pitch: 0 });
  });
});

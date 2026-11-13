import { afterEach, describe, expect, it, vi } from 'vitest';

async function fresh(): Promise<() => boolean> {
  vi.resetModules();
  return (await import('./paint-support')).canUseStudio;
}

const realMatchMedia = window.matchMedia;

/** Reports forced colours as on or off, as a person may switch them while the page is open. */
function forceColors(state: { on: boolean }): void {
  window.matchMedia = ((query: string) => ({ matches: state.on && query.includes('forced-colors'), media: query })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  vi.restoreAllMocks();
  window.matchMedia = realMatchMedia;
});

describe('canUseStudio', () => {
  it('says no where there is no WebGL2, as in the test page', async () => {
    const canUseStudio = await fresh();
    expect(canUseStudio()).toBe(false);
  });

  it('says yes when a canvas gives a WebGL2 context, and gives the context back', async () => {
    const loseContext = vi.fn();
    const context = { getExtension: (name: string) => (name === 'WEBGL_lose_context' ? { loseContext } : null) };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    const canUseStudio = await fresh();
    expect(canUseStudio()).toBe(true);
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it('asks the browser only once', async () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const canUseStudio = await fresh();
    canUseStudio();
    canUseStudio();
    canUseStudio();
    expect(getContext).toHaveBeenCalledOnce();
    expect(getContext).toHaveBeenCalledWith('webgl2');
  });

  it('says no when asking throws', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('blocked');
    });
    const canUseStudio = await fresh();
    expect(canUseStudio()).toBe(false);
  });

  it('says no while forced colours are on, and asks about them every time', async () => {
    const context = { getExtension: () => null };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    const state = { on: true };
    forceColors(state);
    const canUseStudio = await fresh();
    expect(canUseStudio()).toBe(false);
    state.on = false;
    expect(canUseStudio()).toBe(true);
    state.on = true;
    expect(canUseStudio()).toBe(false);
    // The WebGL2 answer is still kept for the visit.
    expect(getContext).toHaveBeenCalledOnce();
  });
});

describe('studioUnavailable', () => {
  it('gives the reason in a few words, forced colours before WebGL2', async () => {
    vi.resetModules();
    const support = await import('./paint-support');
    expect(support.studioUnavailable()).toBe(support.STUDIO_UNAVAILABLE);
    forceColors({ on: true });
    expect(support.studioUnavailable()).toBe('Not drawn in forced colours.');
  });

  it('says nothing where WebGL2 is offered', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ getExtension: () => null } as never);
    vi.resetModules();
    const support = await import('./paint-support');
    expect(support.studioUnavailable()).toBeUndefined();
  });
});

describe('the paint control', () => {
  it('is empty until the shell fills it in, and hands back what it was given', async () => {
    vi.resetModules();
    const support = await import('./paint-support');
    expect(support.paintControl()).toBeUndefined();
    const control = { current: () => 'classic' as const, choose: vi.fn() };
    support.setPaintControl(control);
    expect(support.paintControl()).toBe(control);
    support.setPaintControl(undefined);
    expect(support.paintControl()).toBeUndefined();
  });
});

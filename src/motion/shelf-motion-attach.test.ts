import { afterEach, describe, expect, it, vi } from 'vitest';
import { createManualClock } from './clock';
import { createShelfMotion, type ShelfMotionOptions } from './shelf-motion';

const PITCH = 100;

interface PointerInit {
  x: number;
  y?: number;
  t?: number;
}

function pointer(type: string, init: PointerInit): PointerEvent {
  const event = new PointerEvent(type, {
    pointerId: 1,
    clientX: init.x,
    clientY: init.y ?? 0,
    pointerType: 'mouse',
    button: 0,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, 'timeStamp', { value: init.t ?? 0 });
  return event;
}

function setup(options: Partial<ShelfMotionOptions> = {}, enabled?: () => boolean) {
  const clock = createManualClock();
  const motion = createShelfMotion({ count: 12, clock, ...options });
  const element = document.createElement('div');
  document.body.appendChild(element);
  element.setPointerCapture = vi.fn();
  const detach = motion.attach(element, { pxPerItem: () => PITCH, enabled });
  const fire = (type: string, init: PointerInit): void => {
    element.dispatchEvent(pointer(type, init));
  };
  /** Presses at x = 500 and moves to 500 + dx with timestamps spaced `gap` ms apart. */
  const drag = (dx: number, gap = 200): void => {
    fire('pointerdown', { x: 500, t: 0 });
    fire('pointermove', { x: 500 + dx / 2, t: gap });
    fire('pointermove', { x: 500 + dx, t: gap * 2 });
  };
  return { clock, motion, element, detach, fire, drag };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('motion.attach drag', () => {
  it('moves position by +1 when dragged left by one pitch', () => {
    const { motion, drag } = setup();
    drag(-PITCH);
    expect(motion.state.position).toBeCloseTo(1, 10);
    expect(motion.state.dragging).toBe(true);
    expect(motion.state.settled).toBe(false);
  });

  it('moves position by -1 when dragged right by one pitch', () => {
    const { motion, drag } = setup({ initial: 4 });
    drag(PITCH);
    expect(motion.state.position).toBeCloseTo(3, 10);
  });

  it('settles on a whole index after a slow release', () => {
    const { clock, motion, drag, fire } = setup();
    drag(-130);
    fire('pointerup', { x: 370, t: 1000 });
    expect(motion.state.dragging).toBe(false);
    expect(motion.state.target).toBe(1);
    clock.advance(2000);
    expect(motion.state.position).toBe(1);
    expect(motion.state.settled).toBe(true);
  });

  it('a gentle release moving forward lands on the next volume instead of sliding back', () => {
    const { clock, motion, fire } = setup();
    fire('pointerdown', { x: 500, t: 0 });
    fire('pointermove', { x: 170, t: 1000 });
    fire('pointermove', { x: 160, t: 1033 });
    expect(motion.state.position).toBeCloseTo(3.4, 10);
    fire('pointerup', { x: 160, t: 1040 });
    expect(motion.state.target).toBe(4);
    expect(motion.state.velocity).toBeGreaterThan(0);
    clock.advance(200);
    expect(motion.state.position).toBeGreaterThan(3.4);
    clock.advance(3000);
    expect(motion.state.position).toBe(4);
  });

  it('a gentle release moving backward lands on the previous volume', () => {
    const { motion, fire } = setup({ initial: 5 });
    fire('pointerdown', { x: 500, t: 0 });
    fire('pointermove', { x: 530, t: 1000 });
    fire('pointermove', { x: 540, t: 1033 });
    expect(motion.state.position).toBeCloseTo(4.6, 10);
    fire('pointerup', { x: 540, t: 1040 });
    expect(motion.state.target).toBe(4);
  });

  it('a release that rested on the pointer still snaps to the nearest volume', () => {
    const { motion, fire } = setup();
    fire('pointerdown', { x: 500, t: 0 });
    fire('pointermove', { x: 160, t: 1000 });
    fire('pointerup', { x: 160, t: 1500 });
    expect(motion.state.target).toBe(3);
  });

  it('a fast flick moves at least one volume in its direction', () => {
    const { clock, motion, fire } = setup({ initial: 5 });
    fire('pointerdown', { x: 500, t: 0 });
    fire('pointermove', { x: 485, t: 30 });
    fire('pointermove', { x: 470, t: 60 });
    fire('pointerup', { x: 470, t: 60 });
    expect(motion.state.target).toBeGreaterThanOrEqual(6);
    clock.advance(3000);
    expect(Number.isInteger(motion.state.position)).toBe(true);
    expect(motion.state.position).toBe(motion.state.target);
  });

  it('a flick right moves at least one volume right, which is lower', () => {
    const { motion, fire } = setup({ initial: 5 });
    fire('pointerdown', { x: 500, t: 0 });
    fire('pointermove', { x: 515, t: 30 });
    fire('pointermove', { x: 530, t: 60 });
    fire('pointerup', { x: 530, t: 60 });
    expect(motion.state.target).toBeLessThanOrEqual(4);
  });

  it('still moves one volume when the projected flick lands on the start', () => {
    const clock = createManualClock();
    const motion = createShelfMotion({ count: 12, clock });
    const element = document.createElement('div');
    element.setPointerCapture = vi.fn();
    motion.attach(element, { pxPerItem: () => 1000 });
    const fire = (type: string, init: PointerInit): void => {
      element.dispatchEvent(pointer(type, init));
    };
    fire('pointerdown', { x: 500, t: 0 });
    fire('pointermove', { x: 485, t: 30 });
    fire('pointermove', { x: 470, t: 60 });
    fire('pointerup', { x: 470, t: 60 });
    expect(motion.state.target).toBe(1);
  });

  it('a very fast flick moves at most six volumes', () => {
    const { motion, fire } = setup();
    fire('pointerdown', { x: 900, t: 0 });
    fire('pointermove', { x: 600, t: 10 });
    fire('pointermove', { x: 300, t: 20 });
    fire('pointerup', { x: 300, t: 20 });
    expect(motion.state.target).toBe(6);
  });

  it('a pointercancel returns to the nearest whole index without a flick', () => {
    const { clock, motion, drag, fire } = setup();
    drag(-140);
    fire('pointercancel', { x: 360, t: 400 });
    expect(motion.state.target).toBe(1);
    expect(motion.state.velocity).toBe(0);
    clock.advance(2000);
    expect(motion.state.position).toBe(1);
  });

  it('with loop false, resists dragging past the start and settles back inside', () => {
    const { clock, motion, drag, fire } = setup({ loop: false });
    drag(2 * PITCH);
    expect(motion.state.position).toBeLessThan(0);
    expect(motion.state.position).toBeGreaterThan(-1);
    expect(motion.state.target).toBe(0);
    fire('pointerup', { x: 700, t: 1000 });
    clock.advance(2000);
    expect(motion.state.position).toBe(0);
  });

  it('with loop false, resists dragging past the end and settles back inside', () => {
    const { clock, motion, drag, fire } = setup({ loop: false, count: 5, initial: 4 });
    drag(-3 * PITCH);
    // Raw travel would be 7. The rubber band keeps 35 percent of the overshoot.
    expect(motion.state.position).toBeCloseTo(4 + 3 * 0.35, 10);
    expect(motion.state.target).toBe(4);
    fire('pointerup', { x: 200, t: 1000 });
    clock.advance(2000);
    expect(motion.state.position).toBe(4);
  });

  it('with loop true, dragging past index 0 is not resisted', () => {
    const { motion, drag } = setup({ loop: true });
    drag(2 * PITCH);
    expect(motion.state.position).toBeCloseTo(-2, 10);
    expect(motion.state.focus).toBe(10);
  });

  it('enabled returning false blocks drag', () => {
    const { motion, drag } = setup({}, () => false);
    drag(-PITCH);
    expect(motion.state.position).toBe(0);
    expect(motion.state.dragging).toBe(false);
  });

  it('blocks drag while a book is open', () => {
    const { motion, drag } = setup();
    void motion.setOpen(true, { immediate: true });
    drag(-PITCH);
    expect(motion.state.position).toBe(0);
  });

  it('blocks drag on an empty shelf', () => {
    const { motion, drag } = setup({ count: 0 });
    drag(-PITCH);
    expect(motion.state.dragging).toBe(false);
  });

  it('keeps touch-action pan-y while attached and restores it after detach', () => {
    const { element, detach } = setup();
    expect(element.style.touchAction).toBe('pan-y');
    detach();
    expect(element.style.touchAction).toBe('');
  });
});

describe('motion.attach wheel', () => {
  function wheel(element: HTMLElement, init: WheelEventInit): WheelEvent {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
    Object.defineProperty(event, 'shiftKey', { value: init.shiftKey === true });
    element.dispatchEvent(event);
    return event;
  }

  it('moves the shelf on a horizontal wheel and prevents the page scroll', () => {
    const { motion, element } = setup();
    const event = wheel(element, { deltaX: PITCH, deltaY: 0 });
    expect(event.defaultPrevented).toBe(true);
    expect(motion.state.position).toBeCloseTo(1, 10);
  });

  it('leaves a plain vertical wheel to the page', () => {
    const { motion, element } = setup();
    const event = wheel(element, { deltaX: 0, deltaY: PITCH });
    expect(event.defaultPrevented).toBe(false);
    expect(motion.state.position).toBe(0);
  });

  it('treats shift plus vertical wheel as sideways', () => {
    const { motion, element } = setup();
    const event = wheel(element, { deltaY: PITCH, shiftKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(motion.state.position).toBeCloseTo(1, 10);
  });

  it('settles on a whole index shortly after the wheel stops', () => {
    vi.useFakeTimers();
    const { clock, motion, element } = setup();
    wheel(element, { deltaX: 130 });
    expect(motion.state.dragging).toBe(true);
    vi.advanceTimersByTime(200);
    expect(motion.state.dragging).toBe(false);
    expect(motion.state.target).toBe(1);
    clock.advance(2000);
    expect(motion.state.position).toBe(1);
  });

  it('ignores the wheel when disabled or detached', () => {
    const disabled = setup({}, () => false);
    expect(wheel(disabled.element, { deltaX: PITCH }).defaultPrevented).toBe(false);

    const attached = setup();
    attached.detach();
    expect(wheel(attached.element, { deltaX: PITCH }).defaultPrevented).toBe(false);
    expect(attached.motion.state.position).toBe(0);
  });
});

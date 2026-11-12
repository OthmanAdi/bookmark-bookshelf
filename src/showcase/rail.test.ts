import { describe, expect, it } from 'vitest';
import { railLayout, rangeOf, TICK_MIN, TICK_PITCH, tickName, tickOf } from './rail';

describe('rail compression', () => {
  it('gives every book its own tick at full pitch while there is room', () => {
    expect(railLayout(15, 600)).toEqual({ group: 1, ticks: 15, pitch: TICK_PITCH });
  });

  it('draws the ticks closer when the row grows', () => {
    const layout = railLayout(100, 600);
    expect(layout.group).toBe(1);
    expect(layout.ticks).toBe(100);
    expect(layout.pitch).toBe(6);
  });

  it('never draws them closer than three px, and groups books past that', () => {
    const layout = railLayout(1000, 600);
    expect(layout.pitch).toBeGreaterThanOrEqual(TICK_MIN);
    expect(layout.group).toBe(5);
    expect(layout.ticks).toBe(200);
    expect(layout.ticks * layout.pitch).toBeLessThanOrEqual(600);
  });

  it('covers every book whatever the count', () => {
    for (const count of [1, 2, 199, 200, 201, 777, 5000]) {
      const layout = railLayout(count, 480);
      expect(layout.pitch).toBeGreaterThanOrEqual(TICK_MIN);
      expect(layout.ticks * layout.group).toBeGreaterThanOrEqual(count);
      expect(rangeOf(layout.ticks - 1, layout, count)[1]).toBe(count - 1);
      expect(tickOf(count - 1, layout)).toBe(layout.ticks - 1);
    }
  });

  it('has no ticks for an empty row', () => {
    expect(railLayout(0, 600).ticks).toBe(0);
  });

  it('names a tick by its book, or by the books it stands for', () => {
    const titles = ['One', 'Two', 'Three', 'Four', 'Five'];
    expect(tickName(2, { group: 1, ticks: 5, pitch: 14 }, titles)).toBe('3 of 5: Three');
    expect(tickName(1, { group: 2, ticks: 3, pitch: 3 }, titles)).toBe('3 to 4 of 5: Three to Four');
    expect(tickName(2, { group: 2, ticks: 3, pitch: 3 }, titles)).toBe('5 of 5: Five');
  });
});

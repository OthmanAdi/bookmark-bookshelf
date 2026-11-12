import { describe, expect, it } from 'vitest';
import { bendLeaf, leafGeometry, leafLine, LEAF_SEGMENTS } from './leaf';

const lengthOf = (line: { x: number[]; z: number[] }) => {
  let total = 0;
  for (let i = 1; i < line.x.length; i++) total += Math.hypot(line.x[i]! - line.x[i - 1]!, line.z[i]! - line.z[i - 1]!);
  return total;
};

describe('a bent leaf', () => {
  it('lies flat against the block when shut', () => {
    const line = leafLine(200, { angle: 0, curl: 0 });
    expect(line.x.every((x) => Math.abs(x) < 1e-9)).toBe(true);
    expect(line.z.at(-1)).toBeCloseTo(-200, 6);
  });

  it('stands straight out from the spine at a quarter turn', () => {
    const line = leafLine(200, { angle: Math.PI / 2, curl: 0 });
    expect(line.x.at(-1)).toBeCloseTo(200, 6);
    expect(line.z.at(-1)).toBeCloseTo(0, 6);
  });

  it('keeps its length however it bends', () => {
    for (const shape of [{ angle: 0.4, curl: 1.2 }, { angle: 1.2, curl: -0.9 }, { angle: 2.6, curl: 0.5 }]) {
      expect(lengthOf(leafLine(180, shape))).toBeCloseTo(180, 0);
    }
  });

  it('writes unit normals and both edges of the leaf', () => {
    const geometry = leafGeometry();
    bendLeaf(geometry, 150, 300, { angle: 0.8, curl: 0.6 });
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    expect(position.count).toBe((LEAF_SEGMENTS + 1) * 2);
    expect(position.getY(1)).toBe(300);
    for (let k = 0; k < normal.count; k++) {
      expect(Math.hypot(normal.getX(k), normal.getY(k), normal.getZ(k))).toBeCloseTo(1, 5);
    }
  });
});

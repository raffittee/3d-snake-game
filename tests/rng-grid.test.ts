import { describe, expect, it } from 'vitest';
import { cellToWorld, makeGrid, worldToCell } from '../src/sim/grid';
import { createRng } from '../src/sim/rng';

describe('rng', () => {
  it('gives the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
  });

  it('gives different sequences for different seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('int(n) stays in range', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
  });
});

describe('grid', () => {
  const g = makeGrid(28, 2);

  it('is centered on the origin', () => {
    expect(g.half).toBe(28);
    expect(cellToWorld(g, 0)).toBe(-27);
    expect(cellToWorld(g, 27)).toBe(27);
  });

  it('maps world coordinates back to the same cell', () => {
    for (let i = 0; i < g.size; i++) expect(worldToCell(g, cellToWorld(g, i))).toBe(i);
  });

  it('clamps coordinates outside the arena', () => {
    expect(worldToCell(g, -999)).toBe(0);
    expect(worldToCell(g, 999)).toBe(g.size - 1);
  });
});

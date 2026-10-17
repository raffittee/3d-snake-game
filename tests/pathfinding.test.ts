import { describe, expect, it } from 'vitest';
import { Pathfinder, stepOffset } from '../src/sim/pathfinding';
import { createRng } from '../src/sim/rng';

const make = (size = 8) => new Pathfinder(size, createRng(1));

describe('Pathfinder.firstStep', () => {
  it('steps straight toward a target on an open grid', () => {
    const pf = make();
    const [dx, dz] = stepOffset(pf.firstStep(1, 1, 6, 1));
    expect([dx, dz]).toEqual([1, 0]);
  });

  it('returns the move onto an adjacent target', () => {
    const pf = make();
    expect(stepOffset(pf.firstStep(3, 3, 3, 4))).toEqual([0, 1]);
  });

  it('routes around a wall', () => {
    const pf = make();
    // A vertical wall at x = 3 with a gap only at z = 7.
    for (let z = 0; z < 7; z++) pf.blocked[z * 8 + 3] = 1;
    // Follow the first step repeatedly: it must reach the target by the shortest route
    // (down 7 to the gap, across 4, up 7 = 18 steps) and never enter the wall.
    let x = 1;
    let z = 0;
    let steps = 0;
    while ((x !== 5 || z !== 0) && steps < 40) {
      const dir = pf.firstStep(x, z, 5, 0);
      expect(dir).toBeGreaterThanOrEqual(0);
      const [dx, dz] = stepOffset(dir);
      x += dx;
      z += dz;
      steps++;
      if (x !== 5 || z !== 0) expect(pf.free(x, z)).toBe(true);
    }
    expect(steps).toBe(18);
  });

  it('returns -1 when the target is walled off', () => {
    const pf = make();
    for (let z = 0; z < 8; z++) pf.blocked[z * 8 + 3] = 1;
    expect(pf.firstStep(1, 1, 6, 1)).toBe(-1);
  });

  it('can target a blocked cell (the player may stand next to the body)', () => {
    const pf = make();
    pf.blocked[1 * 8 + 4] = 1;
    expect(stepOffset(pf.firstStep(3, 1, 4, 1))).toEqual([1, 0]);
  });
});

describe('Pathfinder.roomFrom', () => {
  it('counts reachable free cells, capped at 250', () => {
    const pf = make(20);
    expect(pf.roomFrom(0, 0)).toBe(250);
  });

  it('is small inside a sealed pocket', () => {
    const pf = make();
    for (const [x, z] of [[2, 1], [1, 2], [0, 2], [2, 0]]) pf.blocked[z * 8 + x] = 1;
    expect(pf.roomFrom(0, 0)).toBe(4);
  });
});

describe('Pathfinder cost on big maps', () => {
  it('a corner-to-corner search on 64x64 stays far below one frame', () => {
    // Snake steps happen a few times a second; one search must be cheap even on the biggest
    // single-player map. The bound is loose so slow CI machines do not flake.
    const pf = new Pathfinder(64, createRng(2));
    const runs = 500;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) pf.firstStep(0, 0, 63, 63);
    const perSearchMs = (performance.now() - t0) / runs;
    expect(perSearchMs).toBeLessThan(2);
  });
});

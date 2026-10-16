import { describe, expect, it } from 'vitest';
import { level01 } from '../src/levels/level01';
import { landmarkCells } from '../src/sim/pillars';
import { createWorld } from '../src/sim/world';

const idx = (n: number, x: number, z: number) => z * n + x;

describe('landmarks', () => {
  it('level 1 has a tower and a tree to find your way by', () => {
    expect(level01.landmarks.map((l) => l.kind).sort()).toEqual(['tower', 'tree']);
  });

  it('a landmark covers size x size cells centered on its cell', () => {
    expect(landmarkCells({ kind: 'tree', cell: { x: 5, z: 5 }, size: 1 })).toEqual([{ x: 5, z: 5 }]);
    const big = landmarkCells({ kind: 'tower', cell: { x: 5, z: 5 }, size: 3 });
    expect(big).toHaveLength(9);
    expect(big).toContainEqual({ x: 4, z: 4 });
    expect(big).toContainEqual({ x: 6, z: 6 });
  });

  it('every landmark cell is solid in every arena', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const w = createWorld(level01, seed);
      for (const l of level01.landmarks) for (const c of landmarkCells(l)) expect(w.pillars[idx(w.grid.size, c.x, c.z)]).toBe(1);
    }
  });

  it('no random pillar touches a landmark footprint', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const w = createWorld(level01, seed);
      const n = w.grid.size;
      for (const l of level01.landmarks) {
        const own = new Set(landmarkCells(l).map((c) => idx(n, c.x, c.z)));
        for (const c of landmarkCells(l)) {
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              const i = idx(n, c.x + dx, c.z + dz);
              if (!own.has(i)) expect(w.pillars[i]).toBe(0);
            }
          }
        }
      }
    }
  });

  it('landmarks keep clear of the start point, the snake spawn and the walls', () => {
    for (const l of level01.landmarks) {
      for (const c of landmarkCells(l)) {
        expect(Math.abs(c.x - level01.start.x) > 2 || Math.abs(c.z - level01.start.z) > 2).toBe(true);
        expect(c.z <= level01.snake.spawn.z + 3 && c.x <= level01.snake.spawn.x + 4).toBe(false);
        expect(c.x >= 2 && c.z >= 2 && c.x < level01.size - 2 && c.z < level01.size - 2).toBe(true);
      }
    }
  });

  it('the start cell is never solid', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const w = createWorld(level01, seed);
      expect(w.pillars[idx(w.grid.size, level01.start.x, level01.start.z)]).toBe(0);
    }
  });
});

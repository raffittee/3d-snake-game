import type { Grid } from './grid';
import type { Rng } from './rng';
import type { Landmark, LevelConfig } from '../levels/types';
import type { Cell } from './types';

/** The cells a landmark covers: size x size, centered on its cell. */
export function landmarkCells(l: Landmark): Cell[] {
  const r = (l.size - 1) / 2;
  const cells: Cell[] = [];
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) cells.push({ x: l.cell.x + dx, z: l.cell.z + dz });
  return cells;
}

/**
 * The level's solid cells: its landmarks, then scattered single-cell pillars. Nothing solid
 * touches anything else solid (not even diagonally), and pillars keep clear of the snake's
 * starting lane and the player's start point.
 */
export function generatePillars(grid: Grid, level: LevelConfig, rng: Rng): Uint8Array {
  const n = grid.size;
  const pillars = new Uint8Array(n * n);
  for (const l of level.landmarks) for (const c of landmarkCells(l)) pillars[c.z * n + c.x] = 1;
  const { spawn } = level.snake;
  const { start } = level;
  let placed = 0;
  let tries = 0;
  while (placed < level.pillarCount && tries < 3000) {
    tries++;
    const x = 2 + rng.int(n - 4);
    const z = 2 + rng.int(n - 4);
    if (z <= spawn.z + 3 && x <= spawn.x + 4) continue;
    if (Math.abs(x - start.x) <= 2 && Math.abs(z - start.z) <= 2) continue;
    let ok = true;
    for (let dz = -1; dz <= 1 && ok; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (pillars[(z + dz) * n + x + dx]) {
          ok = false;
          break;
        }
      }
    }
    if (!ok) continue;
    pillars[z * n + x] = 1;
    placed++;
  }
  return pillars;
}

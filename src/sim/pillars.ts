import type { Grid } from './grid';
import type { Rng } from './rng';
import type { LevelConfig } from '../levels/types';

/**
 * Scatter single-cell pillars. They never touch each other (not even diagonally), and
 * keep clear of the snake's starting lane and the player's spawn at the arena center.
 */
export function generatePillars(grid: Grid, level: LevelConfig, rng: Rng): Uint8Array {
  const n = grid.size;
  const pillars = new Uint8Array(n * n);
  const { spawn } = level.snake;
  const mid = n / 2;
  let placed = 0;
  let tries = 0;
  while (placed < level.pillarCount && tries < 3000) {
    tries++;
    const x = 2 + rng.int(n - 4);
    const z = 2 + rng.int(n - 4);
    if (z <= spawn.z + 3 && x <= spawn.x + 4) continue;
    if (Math.abs(x - mid) <= 2 && Math.abs(z - mid) <= 2) continue;
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

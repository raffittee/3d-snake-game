import { BALANCE } from '../config/balance';
import { cellToWorld, worldToCell } from './grid';
import type { SnakeState, World } from './types';
import { preyOf } from './hunt';

/**
 * Burrow (Level 7): a snake on the surface that has cooled down and is far enough from you dives
 * under the sand (`down`), travels underground faster toward where you are heading, and once its
 * head is close to you (or it has been under long enough) it stops and the sand starts to heave
 * (`rising`, a warning), then it breaks the surface (`up`) and hunts as Predict. Underground parts
 * of it cannot touch you. Returns true while it must hold still (rising).
 */
export function updateBurrow(world: World, snake: SnakeState, dt: number): boolean {
  // A steered snake burrows when its pilot says so (sim/pilot.ts).
  if (world.level.snake.behavior !== 'burrow' || snake.pilot !== null) return false;
  const cfg = BALANCE.ai;
  const b = snake.burrow;
  const head = snake.cells[0];
  const prey = preyOf(world, snake);
  const gap = Math.hypot(head.x - worldToCell(world.grid, prey.x), head.z - worldToCell(world.grid, prey.z));
  const at = { x: cellToWorld(world.grid, head.x), z: cellToWorld(world.grid, head.z) };
  if (b.mode === 'up') {
    b.t += dt;
    if (b.t >= cfg.burrowCooldown && gap >= cfg.burrowMinGapCells) {
      b.mode = 'down';
      b.t = 0;
      world.events.push({ type: 'snakeBurrowed', ...at });
    }
    return false;
  }
  if (b.mode === 'down') {
    b.t += dt;
    if (gap <= cfg.burrowSurfaceCells || b.t >= cfg.burrowMaxSeconds) {
      b.mode = 'rising';
      b.t = cfg.burrowRiseSeconds;
      world.events.push({ type: 'snakeRising', ...at });
    }
    return false;
  }
  b.t -= dt;
  if (b.t > 0) return true;
  // It breaks the surface: the head is up; the body follows it out cell by cell.
  b.mode = 'up';
  b.t = 0;
  snake.under[0] = false;
  world.events.push({ type: 'snakeSurfaced', ...at });
  return false;
}

import { BALANCE } from '../config/balance';
import { inBounds, worldToCell } from './grid';
import { jumpableTail } from './perks';
import { isShutDoor, tileHeight } from './tiles';
import { hasTail, isUnder, segmentHalfWidth, segmentHeight } from './snake';
import type { PlayerState, SnakeState, World } from './types';

/** What a point (a stone, a blade) is touching. */
export type Probe =
  | { kind: 'head'; snake: SnakeState }
  | { kind: 'body'; snake: SnakeState; seg: number }
  | { kind: 'solid' }
  | { kind: 'wall' }
  | { kind: 'ground' };

/** What a sphere of radius `r` at (x, y, z) touches. Snake heads are checked before bodies. */
export function probeAt(world: World, x: number, y: number, z: number, r: number): Probe | null {
  const { grid } = world;
  if (y <= 0) return { kind: 'ground' };
  if (Math.abs(x) > grid.half || Math.abs(z) > grid.half) return { kind: 'wall' };
  for (const snake of world.snakes) {
    const head = snake.pos[0];
    const hh = BALANCE.snake.headHalfWidth + r;
    // Under the sand (Burrow): stones and blades pass over it.
    if (isUnder(snake, 0)) continue;
    if (Math.abs(x - head.x) <= hh && Math.abs(z - head.z) <= hh && y <= segmentHeight(0, snake.pos.length)) return { kind: 'head', snake };
  }
  const jump = jumpableTail(world);
  for (const snake of world.snakes) {
    const len = snake.pos.length;
    const tail = hasTail(snake);
    for (let i = 1; i < len; i++) {
      if (isUnder(snake, i)) continue;
      const p = snake.pos[i];
      const h = segmentHalfWidth(i, len, tail) + r;
      if (Math.abs(x - p.x) <= h && Math.abs(z - p.z) <= h && y <= segmentHeight(i, len, tail, jump)) return { kind: 'body', snake, seg: i };
    }
  }
  const cx = worldToCell(grid, x);
  const cz = worldToCell(grid, z);
  if (inBounds(grid, cx, cz) && world.pillars[cz * grid.size + cx] && y <= BALANCE.arena.solidHeight) return { kind: 'solid' };
  if (inBounds(grid, cx, cz) && y <= tileHeight(world.tiles[cz * grid.size + cx])) return { kind: 'solid' };
  if (inBounds(grid, cx, cz) && isShutDoor(world, cz * grid.size + cx) && y <= BALANCE.house.wallHeight) return { kind: 'solid' };
  return null;
}

/** March along a ray from `player`'s eye (view direction) up to `reach`, returning the first thing it touches. */
export function probeView(world: World, player: PlayerState, reach: number, r: number): Probe | null {
  const cp = Math.cos(player.pitch);
  const dx = -Math.sin(player.yaw) * cp;
  const dy = Math.sin(player.pitch);
  const dz = -Math.cos(player.yaw) * cp;
  const y0 = BALANCE.player.eyeHeight + player.y;
  const step = 0.1;
  for (let d = step; d <= reach + 1e-6; d += step) {
    const hit = probeAt(world, player.x + dx * d, y0 + dy * d, player.z + dz * d, r);
    if (hit) return hit;
  }
  return null;
}

/**
 * Whether something taller than a person stands on the straight line between two points (a rock,
 * a full-height wall, corn, a shut door). Low walls and water do not count. Used for proximity
 * voice: a voice behind a wall sounds muffled.
 */
export function wallBetween(world: World, ax: number, az: number, bx: number, bz: number): boolean {
  const { grid } = world;
  const d = Math.hypot(bx - ax, bz - az);
  const steps = Math.ceil(d / (grid.cell * 0.5));
  for (let k = 1; k < steps; k++) {
    const t = k / steps;
    const cx = worldToCell(grid, ax + (bx - ax) * t);
    const cz = worldToCell(grid, az + (bz - az) * t);
    if (!inBounds(grid, cx, cz)) continue;
    const i = cz * grid.size + cx;
    if (world.pillars[i] || tileHeight(world.tiles[i]) >= BALANCE.player.eyeHeight || isShutDoor(world, i)) return true;
  }
  return false;
}

import { BALANCE } from '../config/balance';
import { inBounds, worldToCell } from './grid';
import { jumpableTail } from './perks';
import { tileHeight } from './tiles';
import { hasTail, segmentHalfWidth, segmentHeight } from './snake';
import type { SnakeState, World } from './types';

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
    if (Math.abs(x - head.x) <= hh && Math.abs(z - head.z) <= hh && y <= segmentHeight(0, snake.pos.length)) return { kind: 'head', snake };
  }
  const jump = jumpableTail(world);
  for (const snake of world.snakes) {
    const len = snake.pos.length;
    const tail = hasTail(snake);
    for (let i = 1; i < len; i++) {
      const p = snake.pos[i];
      const h = segmentHalfWidth(i, len, tail) + r;
      if (Math.abs(x - p.x) <= h && Math.abs(z - p.z) <= h && y <= segmentHeight(i, len, tail, jump)) return { kind: 'body', snake, seg: i };
    }
  }
  const cx = worldToCell(grid, x);
  const cz = worldToCell(grid, z);
  if (inBounds(grid, cx, cz) && world.pillars[cz * grid.size + cx] && y <= BALANCE.arena.solidHeight) return { kind: 'solid' };
  if (inBounds(grid, cx, cz) && y <= tileHeight(world.tiles[cz * grid.size + cx])) return { kind: 'solid' };
  return null;
}

/** March along a ray from the player's eye (view direction) up to `reach`, returning the first thing it touches. */
export function probeView(world: World, reach: number, r: number): Probe | null {
  const { player } = world;
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

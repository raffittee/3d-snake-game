import type { BehaviorId } from '../levels/types';
import type { Cell, SnakeState, World } from '../sim/types';
import { BALANCE } from '../config/balance';
import { inBounds, worldToCell } from '../sim/grid';
import { blocksSnake } from '../sim/tiles';

/** A behavior decides which grid cell a snake is heading for. Pathfinding does the rest. */
export type Behavior = (world: World, snake: SnakeState) => Cell;

/** Shortest path to wherever the player is standing right now. */
const chase: Behavior = (world) => ({
  x: worldToCell(world.grid, world.player.x),
  z: worldToCell(world.grid, world.player.z),
});

/**
 * Heads for where the player will be about a second from now (their current velocity carried
 * forward). Falls back to the player's own cell when that spot is a wall or off the map.
 */
const predict: Behavior = (world, snake) => {
  const { grid, player } = world;
  const t = BALANCE.ai.predictSeconds;
  const x = Math.round((player.x + player.vx * t + grid.half) / grid.cell - 0.5);
  const z = Math.round((player.z + player.vz * t + grid.half) / grid.cell - 0.5);
  if (inBounds(grid, x, z) && !world.pillars[z * grid.size + x] && !blocksSnake(world.tiles[z * grid.size + x])) return { x, z };
  return chase(world, snake);
};

export const BEHAVIORS: Record<BehaviorId, Behavior> = { chase, predict };

import type { BehaviorId } from '../levels/types';
import type { Cell, World } from '../sim/types';
import { worldToCell } from '../sim/grid';

/** A behavior decides which grid cell the snake is heading for. Pathfinding does the rest. */
export type Behavior = (world: World) => Cell;

/** Shortest path to wherever the player is standing right now. */
const chase: Behavior = (world) => ({
  x: worldToCell(world.grid, world.player.x),
  z: worldToCell(world.grid, world.player.z),
});

export const BEHAVIORS: Record<BehaviorId, Behavior> = { chase };

import { BALANCE } from '../config/balance';
import { inBounds, worldToCell } from './grid';
import type { World } from './types';

/**
 * Ground types beside the solid `pillars` grid (pillars and landmarks stay solid for everything).
 * - LowWall: blocks you on foot (jump it), blocks stones below its top, the snake goes around.
 * - Crumble: blocks you and stones; the snake smashes through it, which turns it into Open.
 * - Water / Bridge: Level 3 (deep water needs the swim ring; bridges cross it).
 * - Grass: Level 4, shoulder-high grass. Walkable for everyone; it hides what is in it.
 * - Corn: Level 5, the maze walls. Taller than you (it blocks sight), blocks you, stones and the snake.
 * - Mud / Log / Pad: Level 6. Mud (shallow swamp water over mud) slows you, not the snake; fallen
 *   logs and lily pads across it are firm paths at full speed.
 * - Ice / CrackedIce / Hole: Level 8. You slide on ice (both kinds); cracked ice breaks under a long
 *   snake and becomes a Hole (open water) that blocks everyone.
 * - HouseWall / Door / Closet: Level 9. Full-height walls; doors that are open, shut (a wall) or
 *   broken (open for good), their state in `world.doorState`; closets you hide in.
 * - CaveWall: Level 10, rock up to the cave's ceiling: blocks everyone and everything.
 */
export const Tile = {
  Open: 0,
  LowWall: 1,
  Crumble: 2,
  Water: 3,
  Bridge: 4,
  Grass: 5,
  Corn: 6,
  Mud: 7,
  Log: 8,
  Pad: 9,
  Ice: 10,
  CrackedIce: 11,
  Hole: 12,
  HouseWall: 13,
  Door: 14,
  Closet: 15,
  CaveWall: 16,
} as const;

/** `world.doorState` values for Door cells. */
export const DoorState = { Open: 0, Shut: 1, Broken: 2 } as const;

export type TileId = (typeof Tile)[keyof typeof Tile];

/** How tall a tile stands for collisions with you and with stones (0 = nothing there). */
export function tileHeight(t: number): number {
  if (t === Tile.LowWall) return BALANCE.arena.lowWallHeight;
  if (t === Tile.Crumble) return BALANCE.arena.crumbleHeight;
  if (t === Tile.Corn) return BALANCE.arena.cornHeight;
  if (t === Tile.HouseWall) return BALANCE.house.wallHeight;
  if (t === Tile.CaveWall) return BALANCE.cave.ceiling;
  return 0;
}

/**
 * The snake cannot path through this tile (it goes around low walls, corn, house walls and holes in
 * the ice; it smashes crumbling walls; it plans through doors, and bashes a shut one down).
 */
export const blocksSnake = (t: number): boolean => t === Tile.LowWall || t === Tile.Corn || t === Tile.Hole || t === Tile.HouseWall || t === Tile.CaveWall;

/** A shut door at cell `i` (a wall for you, stones, and the snake until it breaks it). */
export const isShutDoor = (world: Pick<World, 'tiles' | 'doorState'>, i: number): boolean => world.tiles[i] === Tile.Door && world.doorState[i] === DoorState.Shut;

/** Pellets, drops and relics only land on plain ground (grass and ice count: they are ground too). */
export const isOpenGround = (t: number): boolean => t === Tile.Open || t === Tile.Grass || t === Tile.Ice || t === Tile.CrackedIce;

/** You slide on it (Frozen lake). */
export const isIce = (t: number): boolean => t === Tile.Ice || t === Tile.CrackedIce;

/** The tile under a point in world units, or Open off the map. */
export function tileAtWorld(world: Pick<World, 'grid' | 'tiles'>, x: number, z: number): number {
  const cx = worldToCell(world.grid, x);
  const cz = worldToCell(world.grid, z);
  return inBounds(world.grid, cx, cz) ? world.tiles[cz * world.grid.size + cx] : Tile.Open;
}

/** Whether a point (world units) is inside tall grass, where the snake cannot be seen. */
export const hiddenInGrass = (world: Pick<World, 'grid' | 'tiles'>, x: number, z: number): boolean => tileAtWorld(world, x, z) === Tile.Grass;

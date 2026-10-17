import { BALANCE } from '../config/balance';

/**
 * Ground types beside the solid `pillars` grid (pillars and landmarks stay solid for everything).
 * - LowWall: blocks you on foot (jump it), blocks stones below its top, the snake goes around.
 * - Crumble: blocks you and stones; the snake smashes through it, which turns it into Open.
 * - Water / Bridge: Level 3 (deep water needs the swim ring; bridges cross it).
 */
export const Tile = {
  Open: 0,
  LowWall: 1,
  Crumble: 2,
  Water: 3,
  Bridge: 4,
} as const;

export type TileId = (typeof Tile)[keyof typeof Tile];

/** How tall a tile stands for collisions with you and with stones (0 = nothing there). */
export function tileHeight(t: number): number {
  if (t === Tile.LowWall) return BALANCE.arena.lowWallHeight;
  if (t === Tile.Crumble) return BALANCE.arena.crumbleHeight;
  return 0;
}

/** The snake cannot path through this tile (it goes around low walls; it smashes crumbling ones). */
export const blocksSnake = (t: number): boolean => t === Tile.LowWall;

/** Pellets, drops and relics only land on plain ground. */
export const isOpenGround = (t: number): boolean => t === Tile.Open;

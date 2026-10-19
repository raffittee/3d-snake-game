import { BALANCE } from '../config/balance';
import { cellToWorld } from './grid';
import { isAnySnakeCell } from './snake';
import { Tile, isOpenGround } from './tiles';
import type { World } from './types';
import { minDistanceToPlayers } from './hunt';

/** Place one pellet on a free cell away from every player. Gives up quietly if none is found. */
export function spawnPellet(world: World): void {
  const { grid, rng } = world;
  for (let k = 0; k < 300; k++) {
    const x = 1 + rng.int(grid.size - 2);
    const z = 1 + rng.int(grid.size - 2);
    const tile = world.tiles[z * grid.size + x];
    if (world.pillars[z * grid.size + x] || !isOpenGround(tile)) continue;
    if (world.level.pelletsIn === 'grass' && tile !== Tile.Grass) continue;
    if (world.relics.some((r) => r.x === x && r.z === z)) continue;
    if (isAnySnakeCell(world, x, z)) continue;
    if (world.pellets.some((p) => p.x === x && p.z === z)) continue;
    if (minDistanceToPlayers(world, cellToWorld(grid, x), cellToWorld(grid, z)) < BALANCE.pellets.minSpawnDistance) continue;
    world.pellets.push({ id: world.nextPelletId++, x, z });
    return;
  }
}

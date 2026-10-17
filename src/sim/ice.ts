import { BALANCE } from '../config/balance';
import { cutSnake, fallThrough } from './cut';
import { cellToWorld, worldToCell } from './grid';
import { Tile } from './tiles';
import type { World } from './types';

/** The patch of cracked ice joined (side by side) to cell `start`: the cells that go down together. */
function patchOf(world: World, start: number): number[] {
  const n = world.grid.size;
  const out = [start];
  const seen = new Set(out);
  for (let h = 0; h < out.length; h++) {
    const x = out[h] % n;
    const z = (out[h] / n) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      const ni = nz * n + nx;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n || seen.has(ni) || world.tiles[ni] !== Tile.CrackedIce) continue;
      seen.add(ni);
      out.push(ni);
    }
  }
  return out;
}

/**
 * Cracked ice (Level 8). A snake at least `breakLength` long that puts its head on a cracked cell
 * starts it giving way; as its body slides over, the cracks spread, and once the segment `breakAt`
 * behind the head is on that cell the whole patch of cracked ice around it breaks into open water.
 * Whatever lies over the patch falls through: each snake is cut at its first segment there, losing
 * the segments over the hole (the front keeps going; the piece behind becomes its own snake or
 * withers, as with a machete); a head over it takes its whole snake down. Returns true when you were
 * standing on the patch (you fell in).
 */
export function updateIce(world: World, _dt: number): boolean {
  const cfg = BALANCE.ice;
  const { grid, tiles } = world;
  const n = grid.size;
  for (const snake of world.snakes) {
    if (snake.cells.length < cfg.breakLength) continue;
    const h = snake.cells[0];
    const i = h.z * n + h.x;
    if (tiles[i] !== Tile.CrackedIce || world.cracking.some((c) => c.i === i)) continue;
    world.cracking.push({ i, t: 0 });
    world.events.push({ type: 'iceCracking', x: cellToWorld(grid, h.x), z: cellToWorld(grid, h.z) });
  }
  let fell = false;
  for (let k = world.cracking.length - 1; k >= 0; k--) {
    const c = world.cracking[k];
    const x = c.i % n;
    const z = (c.i / n) | 0;
    // How far behind its head is the body lying on this cell? That is how far the cracks have spread.
    let deepest = -1;
    for (const snake of world.snakes) {
      const seg = snake.cells.findIndex((q) => q.x === x && q.z === z);
      if (seg >= 0) deepest = Math.max(deepest, seg);
    }
    if (deepest < 0) continue;
    c.t = Math.max(c.t, Math.min(1, deepest / cfg.breakAt));
    if (deepest < cfg.breakAt) continue;
    world.cracking.splice(k, 1);
    const patch = new Set(patchOf(world, c.i));
    for (const i of patch) {
      tiles[i] = Tile.Hole;
      world.events.push({ type: 'iceBroke', x: cellToWorld(grid, i % n), z: cellToWorld(grid, (i / n) | 0) });
    }
    // Any other cracks in progress on this patch are gone with it.
    world.cracking = world.cracking.filter((o) => !patch.has(o.i));
    for (const snake of [...world.snakes]) {
      const over = snake.cells.map((q, s) => (patch.has(q.z * n + q.x) ? s : -1)).filter((s) => s >= 0);
      if (!over.length) continue;
      if (over[0] === 0) fallThrough(world, snake);
      else cutSnake(world, snake, over[0], over[over.length - 1] - over[0] + 1);
    }
    if (world.player.y <= 0 && patch.has(worldToCell(grid, world.player.z) * n + worldToCell(grid, world.player.x))) fell = true;
    k = Math.min(k, world.cracking.length);
  }
  return fell;
}

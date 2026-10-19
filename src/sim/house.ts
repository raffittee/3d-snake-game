import { BALANCE } from '../config/balance';
import { cellToWorld, worldToCell } from './grid';
import { hasPerk } from './perks';
import { DoorState, Tile } from './tiles';
import type { PlayerInput, PlayerState, SnakeState, World } from './types';

/** The Door cells of the doorway cell `i` belongs to (a doorway is one or two cells wide). They open, shut and break together. */
export function doorGroup(world: Pick<World, 'grid' | 'tiles'>, i: number): number[] {
  const n = world.grid.size;
  const out = [i];
  for (let h = 0; h < out.length && out.length < 4; h++) {
    const x = out[h] % n;
    const z = (out[h] / n) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      const ni = nz * n + nx;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n || out.includes(ni) || world.tiles[ni] !== Tile.Door) continue;
      out.push(ni);
    }
  }
  return out;
}

/** Shut some doorways at the start (seeded). Uses no randomness on levels without doors. */
export function initDoors(world: World): void {
  const done = new Set<number>();
  for (let i = 0; i < world.tiles.length; i++) {
    if (world.tiles[i] !== Tile.Door || done.has(i)) continue;
    const group = doorGroup(world, i);
    const state = world.rng.next() < BALANCE.house.shutShare ? DoorState.Shut : DoorState.Open;
    for (const c of group) {
      done.add(c);
      world.doorState[c] = state;
    }
  }
}

/** The door `player` would open or shut: the nearest Door cell within reach, preferring one in front of them. */
export function doorInReach(world: World, player: PlayerState): { i: number; state: number } | null {
  const { grid } = world;
  const n = grid.size;
  const reach = BALANCE.house.doorReach;
  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);
  const cx = worldToCell(grid, player.x);
  const cz = worldToCell(grid, player.z);
  let best: { i: number; state: number } | null = null;
  let bestScore = Infinity;
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx;
      const z = cz + dz;
      if (x < 0 || z < 0 || x >= n || z >= n) continue;
      const i = z * n + x;
      if (world.tiles[i] !== Tile.Door) continue;
      const ox = cellToWorld(grid, x) - player.x;
      const oz = cellToWorld(grid, z) - player.z;
      const d = Math.hypot(ox, oz);
      if (d > reach) continue;
      // Behind you counts as farther away.
      const facing = d > 1e-3 ? (ox * fx + oz * fz) / d : 1;
      const score = d + (1 - facing) * 1.5;
      if (score < bestScore) {
        bestScore = score;
        best = { i, state: world.doorState[i] };
      }
    }
  }
  return best;
}

/**
 * Each update in the house: open or shut the door in reach (R), whether you are hidden in a closet,
 * and how far your noise carries (footsteps, louder sprinting, none standing still or hidden;
 * Light feet quieter; a slammed door very loud for a moment).
 */
export function updateHouse(world: World, player: PlayerState, input: PlayerInput, dt: number): void {
  const { grid } = world;
  const n = grid.size;
  if (input.interact) {
    const d = doorInReach(world, player);
    if (d && d.state !== DoorState.Broken) {
      const group = doorGroup(world, d.i);
      const at = { x: cellToWorld(grid, d.i % n), z: cellToWorld(grid, (d.i / n) | 0) };
      if (d.state === DoorState.Shut) {
        for (const c of group) world.doorState[c] = DoorState.Open;
        world.events.push({ type: 'doorOpened', ...at });
      } else {
        // It will not shut on you, or on a snake lying in the doorway.
        const r = BALANCE.player.radius + grid.cell / 2;
        const onYou = world.players.some((p) => !p.out && group.some((c) => Math.abs(cellToWorld(grid, c % n) - p.x) < r && Math.abs(cellToWorld(grid, (c / n) | 0) - p.z) < r));
        const onSnake = world.snakes.some((s) => s.cells.some((q) => group.includes(q.z * n + q.x)));
        if (!onYou && !onSnake) {
          for (const c of group) world.doorState[c] = DoorState.Shut;
          player.slam = BALANCE.noise.slamSeconds;
          world.events.push({ type: 'doorShut', ...at });
        }
      }
    }
  }
  player.hidden = world.tiles[worldToCell(grid, player.z) * n + worldToCell(grid, player.x)] === Tile.Closet;
  player.slam = Math.max(0, player.slam - dt);
  const steps = player.moving && player.y <= 0 ? (player.sprinting ? BALANCE.noise.sprint : BALANCE.noise.walk) * (hasPerk(world, 'lightFeet') ? BALANCE.perks.lightFeetNoise : 1) : 0;
  player.noise = Math.max(player.hidden ? 0 : steps, player.slam > 0 ? BALANCE.noise.slam : 0);
}

/**
 * The snake's next step is into a shut door: it bashes at it instead of moving. After
 * `doorBreakSeconds` of bashing the doorway breaks open for good.
 */
export function bashDoor(world: World, snake: SnakeState, i: number, interactive: boolean): void {
  const { grid } = world;
  const n = grid.size;
  const group = doorGroup(world, i);
  for (const c of group) world.doorDamage[c] += snake.interval;
  const at = { x: cellToWorld(grid, i % n), z: cellToWorld(grid, (i / n) | 0) };
  if (world.doorDamage[i] >= BALANCE.house.doorBreakSeconds) {
    for (const c of group) world.doorState[c] = DoorState.Broken;
    if (interactive) world.events.push({ type: 'doorBroken', ...at });
  } else if (interactive) {
    world.events.push({ type: 'doorBash', ...at });
  }
}

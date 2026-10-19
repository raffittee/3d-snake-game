import type { BehaviorId } from '../levels/types';
import type { Cell, SnakeState, World } from '../sim/types';
import { BALANCE } from '../config/balance';
import { inBounds, worldToCell } from '../sim/grid';
import { Tile, blocksSnake } from '../sim/tiles';
import { preyOf } from '../sim/hunt';

/** Where a snake is heading. `cover`: it may only move through tall grass to get there (Stalk). */
export interface Target extends Cell {
  cover?: boolean;
}

/** A behavior decides which grid cell a snake is heading for. Pathfinding does the rest. */
export type Behavior = (world: World, snake: SnakeState) => Target;

/** Shortest path to wherever its prey (sim/hunt.ts) is standing right now. */
const chase: Behavior = (world, snake) => {
  const p = preyOf(world, snake);
  return { x: worldToCell(world.grid, p.x), z: worldToCell(world.grid, p.z) };
};

/**
 * Heads for where the player will be about a second from now (their current velocity carried
 * forward). Falls back to the player's own cell when that spot is a wall or off the map.
 */
const predict: Behavior = (world, snake) => ahead(world, snake, BALANCE.ai.predictSeconds);

/** The cell you will be on `t` seconds from now at your current velocity; your own cell if that one is blocked. */
function ahead(world: World, snake: SnakeState, t: number): Target {
  const { grid } = world;
  const player = preyOf(world, snake);
  const x = Math.round((player.x + player.vx * t + grid.half) / grid.cell - 0.5);
  const z = Math.round((player.z + player.vz * t + grid.half) / grid.cell - 0.5);
  if (inBounds(grid, x, z) && !world.pillars[z * grid.size + x] && !blocksSnake(world.tiles[z * grid.size + x])) return { x, z };
  return chase(world, snake);
}

/**
 * Burrow: on the surface it hunts like Predict; under the sand (sim/burrow.ts decides when) it heads
 * for where you will be a little further ahead, to come up in your path.
 */
const burrow: Behavior = (world, snake) => ahead(world, snake, snake.burrow.mode === 'down' ? BALANCE.ai.burrowLeadSeconds : BALANCE.ai.predictSeconds);

const isGrass = (world: World, x: number, z: number): boolean => world.tiles[z * world.grid.size + x] === Tile.Grass;

/** The grass cell closest to `from`, or null when the level has no grass. */
function nearestGrass(world: World, from: Cell): Cell | null {
  const n = world.grid.size;
  let best: Cell | null = null;
  let bestD = Infinity;
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      if (!isGrass(world, x, z) || world.pillars[z * n + x]) continue;
      const d = (x - from.x) ** 2 + (z - from.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { x, z };
      }
    }
  }
  return best;
}

let patchSeen = new Uint8Array(0);
let patchQueue = new Int32Array(0);

/** Of the grass patch `from` stands in (cells joined side by side), the cell nearest (tx, tz). */
function patchCellNearest(world: World, from: Cell, tx: number, tz: number): Cell {
  const n = world.grid.size;
  if (patchSeen.length !== n * n) {
    patchSeen = new Uint8Array(n * n);
    patchQueue = new Int32Array(n * n);
  }
  patchSeen.fill(0);
  let qh = 0;
  let qt = 0;
  const start = from.z * n + from.x;
  patchQueue[qt++] = start;
  patchSeen[start] = 1;
  let best = start;
  let bestD = Infinity;
  while (qh < qt) {
    const id = patchQueue[qh++];
    const x = id % n;
    const z = (id / n) | 0;
    const d = (x - tx) ** 2 + (z - tz) ** 2;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const nid = nz * n + nx;
      if (patchSeen[nid] || !isGrass(world, nx, nz) || world.pillars[nid]) continue;
      patchSeen[nid] = 1;
      patchQueue[qt++] = nid;
    }
  }
  return { x: best % n, z: (best / n) | 0 };
}

/**
 * Stays inside tall grass and creeps toward you through it: to your cell when you are in its grass,
 * else to the edge of its patch nearest you, where it lurks. Once you are within
 * `stalkStrikeCells` it breaks cover and charges, until you get `stalkReleaseCells` away. Out of
 * the grass (after a strike) it heads back into the nearest cover; with no grass at all it chases.
 */
const stalk: Behavior = (world, snake) => {
  const you = chase(world, snake);
  const head = snake.cells[0];
  const gap = Math.hypot(head.x - you.x, head.z - you.z);
  snake.striking = gap <= (snake.striking ? BALANCE.ai.stalkReleaseCells : BALANCE.ai.stalkStrikeCells);
  if (snake.striking) return you;
  if (!isGrass(world, head.x, head.z)) return nearestGrass(world, head) ?? you;
  return { ...patchCellNearest(world, head, you.x, you.z), cover: true };
};

/** A cell a snake can stand on: in the arena, no pillar, nothing it must go around. */
const walkable = (world: World, x: number, z: number): boolean =>
  inBounds(world.grid, x, z) && !world.pillars[z * world.grid.size + x] && !blocksSnake(world.tiles[z * world.grid.size + x]);

/**
 * Two snakes working together. The first (lowest id) chases you. Every other one heads for the spot
 * `flankAheadCells` ahead of where you are running, or (when you stand still) on your far side from
 * the chaser, to cut you off. That spot is pulled back toward you until it is a cell it can reach.
 * Once it is within `flankCloseCells` of you it simply chases. Alone, a flanker just chases.
 */
const flank: Behavior = (world, snake) => {
  const you = chase(world, snake);
  const lead = world.snakes.reduce((a, b) => (b.id < a.id ? b : a), snake);
  const head = snake.cells[0];
  if (lead === snake || Math.hypot(head.x - you.x, head.z - you.z) <= BALANCE.ai.flankCloseCells) return you;
  const player = preyOf(world, snake);
  let dx = player.vx;
  let dz = player.vz;
  if (Math.hypot(dx, dz) < 0.5) {
    const l = lead.cells[0];
    dx = you.x - l.x;
    dz = you.z - l.z;
  }
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return you;
  for (let k = BALANCE.ai.flankAheadCells; k >= 1; k--) {
    const x = Math.round(you.x + (dx / len) * k);
    const z = Math.round(you.z + (dz / len) * k);
    if (walkable(world, x, z)) return { x, z };
  }
  return you;
};

/**
 * Where an Ambush snake lies in wait: something you will come for (a pellet, an item, the key, a
 * doorway), not too near you, nearest to the snake with a little seeded randomness so it varies.
 */
function lurkSpot(world: World, snake: SnakeState, you: Cell): Cell | null {
  const n = world.grid.size;
  const head = snake.cells[0];
  const spots: Cell[] = [...world.pellets, ...world.drops, ...world.relics];
  for (let i = 0; i < world.tiles.length; i++) if (world.tiles[i] === Tile.Door) spots.push({ x: i % n, z: (i / n) | 0 });
  let best: Cell | null = null;
  let bestScore = Infinity;
  for (const c of spots) {
    if (Math.hypot(c.x - you.x, c.z - you.z) < BALANCE.ai.ambushSpotFromYou) continue;
    const score = Math.hypot(c.x - head.x, c.z - head.z) + world.rng.next() * 8;
    if (score < bestScore) {
      bestScore = score;
      best = { x: c.x, z: c.z };
    }
  }
  return best;
}

/**
 * Ambush: it lies in wait near something you will come for, and strikes when it hears you (your
 * noise reaches it, a player's `noise` in cells) or sees you right beside it, until you get away or hide.
 * In a closet you are hidden from it unless it is right next to you.
 */
const ambush: Behavior = (world, snake) => {
  const you = chase(world, snake);
  const head = snake.cells[0];
  const gap = Math.hypot(head.x - you.x, head.z - you.z);
  const beside = Math.max(Math.abs(head.x - you.x), Math.abs(head.z - you.z)) <= 1;
  const prey = preyOf(world, snake);
  const hidden = prey.hidden && !beside;
  // Anyone's noise wakes it, but it goes for its prey.
  const heard = world.players.some((p) => Math.hypot(head.x - worldToCell(world.grid, p.x), head.z - worldToCell(world.grid, p.z)) <= p.noise);
  const notices = !hidden && (heard || gap <= BALANCE.ai.ambushSightCells);
  const keeps = snake.striking && !hidden && gap <= BALANCE.ai.ambushReleaseCells;
  if (notices && !snake.striking) world.events.push({ type: 'snakeNoticed', x: snake.pos[0].x, z: snake.pos[0].z });
  snake.striking = notices || keeps;
  if (snake.striking) {
    snake.lurk = null;
    return you;
  }
  // Its spot is gone (a pellet eaten, an item taken) or it has none: pick a new one.
  const gone = snake.lurk && ![...world.pellets, ...world.drops, ...world.relics].some((c) => c.x === snake.lurk?.x && c.z === snake.lurk?.z) && world.tiles[snake.lurk.z * world.grid.size + snake.lurk.x] !== Tile.Door;
  if (!snake.lurk || gone) snake.lurk = lurkSpot(world, snake, you) ?? you;
  return snake.lurk;
};

/**
 * Coil (boss only: the Mother Snake's last stand). Close to you, it heads for a point on a ring
 * around you a little ahead of where its head is, so it circles you; sim/boss.ts pulls the ring in
 * over time until its body squeezes you. Cut your way out, or stun it (a stunned snake does not
 * tighten). Farther away it closes in like Chase.
 */
const coil: Behavior = (world, snake) => {
  const you = chase(world, snake);
  const head = snake.cells[0];
  if (Math.hypot(head.x - you.x, head.z - you.z) > BALANCE.ai.coilReach) return you;
  const a = Math.atan2(head.z - you.z, head.x - you.x) + BALANCE.ai.coilLead;
  const x = Math.round(you.x + Math.cos(a) * snake.coil);
  const z = Math.round(you.z + Math.sin(a) * snake.coil);
  return walkable(world, x, z) ? { x, z } : you;
};

export const BEHAVIORS: Record<BehaviorId, Behavior> = { chase, predict, stalk, flank, burrow, ambush, coil };

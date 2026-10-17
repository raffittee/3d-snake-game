import { BEHAVIORS } from '../ai';
import { BALANCE } from '../config/balance';
import type { LevelConfig } from '../levels/types';
import { overlapDepth, pushOut } from './collision';
import { cellToWorld, inBounds, makeGrid, worldToCell } from './grid';
import { goalMet } from './goals';
import { createInventory, updateItems } from './items';
import { hasPerk, inventorySlots, jumpableTail } from './perks';
import type { PerkId } from './perks';
import { updateProjectiles } from './projectiles';
import { generatePillars } from './pillars';
import { Pathfinder } from './pathfinding';
import { spawnPellet } from './pellets';
import { createPlayer, updatePlayer } from './player';
import { createRng } from './rng';
import { updateGrowthSplit } from './cut';
import { advanceSnake, createSnake, hasTail, segmentHalfWidth, segmentHeight } from './snake';
import type { DeathCause, PlayerInput, SimEvent, SnakeState, World } from './types';

/** Build a fresh game for `level`. The same level and seed always give the same arena. */
export function createWorld(level: LevelConfig, seed: number, perks: PerkId[] = []): World {
  const grid = makeGrid(level.size, BALANCE.cellSize);
  const rng = createRng(seed);
  const world = {
    level,
    grid,
    rng,
    pathfinder: new Pathfinder(grid.size, rng),
    pillars: generatePillars(grid, level, rng),
    player: createPlayer(grid, level.start),
    pellets: [],
    nextPelletId: 1,
    pelletRespawn: 0,
    elapsed: 0,
    pelletsCollected: 0,
    perks: [...perks],
    xpGained: 0,
    secondWindUsed: false,
    inventory: createInventory(inventorySlots(perks)),
    selectedSlot: 0,
    drops: [],
    projectiles: [],
    snakes: [],
    nextSnakeId: 1,
    severed: [],
    killerId: null,
    nextDropId: 1,
    dropTimer: level.items.firstDropAfter,
    lives: BALANCE.lives.perLevel,
    graceTimer: 0,
    status: 'playing',
    deathCause: null,
    invulnerable: false,
    events: [],
  } as unknown as World;
  world.snakes.push(createSnake(world));
  faceSnake(world);
  for (let i = 0; i < level.pelletCount; i++) spawnPellet(world);
  return world;
}

export const scoreOf = (world: World): number =>
  Math.floor(world.elapsed * BALANCE.score.pointsPerSecond) + world.pelletsCollected * BALANCE.pellets.points;

/** The snake whose head is nearest the player (the one to worry about), or null when none is left. */
export function nearestSnake(world: World): SnakeState | null {
  let best: SnakeState | null = null;
  let bestD = Infinity;
  for (const s of world.snakes) {
    const h = s.pos[0];
    const d = Math.hypot(h.x - world.player.x, h.z - world.player.z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** Distance in world units from the nearest snake head to the player, minus the head's size. Never negative. */
export function gapToSnake(world: World): number {
  const s = nearestSnake(world);
  if (!s) return Infinity;
  const head = s.pos[0];
  return Math.max(0, Math.hypot(head.x - world.player.x, head.z - world.player.z) - BALANCE.danger.gapOffset);
}

/** 0 when the snake is far away, 1 when it is on top of you. Drives the red screen edge. */
export function dangerLevel(gap: number): number {
  return Math.min(1, Math.max(0, 1 - (gap - 1) / BALANCE.danger.range));
}

/** Hand back everything that happened since the last call. */
export function drainEvents(world: World): SimEvent[] {
  const events = world.events;
  world.events = [];
  return events;
}

function faceSnake(world: World): void {
  const s = nearestSnake(world);
  if (!s) return;
  const head = s.pos[0];
  world.player.yaw = Math.atan2(-(head.x - world.player.x), -(head.z - world.player.z));
  world.player.pitch = 0;
}

/** Lose a life. With lives left, respawn at the start point and leave the snakes as they are. */
function kill(world: World, cause: DeathCause, by: SnakeState | null): void {
  if (world.invulnerable || world.graceTimer > 0) return;
  if (by && hasPerk(world, 'secondWind') && !world.secondWindUsed) {
    // Knocked back instead: thrown away from the snake's head, a moment of grace, no life lost.
    world.secondWindUsed = true;
    const head = by.pos[0];
    const dx = world.player.x - head.x;
    const dz = world.player.z - head.z;
    const d = Math.hypot(dx, dz) || 1;
    const kb = BALANCE.perks.secondWindKnockback;
    const lim = world.grid.half - BALANCE.player.radius;
    world.player.x = Math.min(lim, Math.max(-lim, world.player.x + (dx / d) * kb));
    world.player.z = Math.min(lim, Math.max(-lim, world.player.z + (dz / d) * kb));
    world.graceTimer = BALANCE.perks.secondWindGrace;
    world.events.push({ type: 'secondWind' });
    return;
  }
  world.killerId = by ? by.id : null;
  world.lives = Math.max(0, world.lives - 1);
  if (world.lives > 0) {
    world.player = createPlayer(world.grid, world.level.start);
    faceSnake(world);
    world.graceTimer = BALANCE.lives.respawnGrace;
    world.events.push({ type: 'lifeLost', cause, livesLeft: world.lives });
    return;
  }
  world.status = 'dead';
  world.deathCause = cause;
  world.events.push({ type: 'died', cause });
}

/** Push the player out of every snake body and the pillars, then decide whether they died. */
function resolveCollisions(world: World): void {
  const { player, grid, pillars } = world;
  const r = BALANCE.player.radius;
  const jump = jumpableTail(world);
  // Height-aware: a segment only blocks you while your feet are below its top.
  for (const snake of world.snakes) {
    const len = snake.pos.length;
    const tail = hasTail(snake);
    for (let i = 1; i < len; i++) if (player.y < segmentHeight(i, len, tail, jump)) pushOut(player, r, snake.pos[i].x, snake.pos[i].z, segmentHalfWidth(i, len, tail));
  }
  const pcx = worldToCell(grid, player.x);
  const pcz = worldToCell(grid, player.z);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = pcx + dx;
      const z = pcz + dz;
      if (inBounds(grid, x, z) && pillars[z * grid.size + x]) pushOut(player, r, cellToWorld(grid, x), cellToWorld(grid, z), grid.cell / 2);
    }
  }
  player.x = Math.min(Math.max(player.x, -grid.half + r), grid.half - r);
  player.z = Math.min(Math.max(player.z, -grid.half + r), grid.half - r);

  for (const snake of world.snakes) {
    const len = snake.pos.length;
    const tail = hasTail(snake);
    const below = (i: number): boolean => player.y < segmentHeight(i, len, tail, jump);
    const head = snake.pos[0];
    if (below(0) && overlapDepth(player, r, head.x, head.z, BALANCE.snake.headHalfWidth) > 0) return kill(world, 'caught', snake);
    for (let i = 1; i < len; i++) {
      if (below(i) && overlapDepth(player, r, snake.pos[i].x, snake.pos[i].z, segmentHalfWidth(i, len, tail)) > BALANCE.snake.crushOverlap) return kill(world, 'crushed', snake);
    }
  }
}

/** Advance the whole game by `dt` seconds. Does nothing once the player has died or the level is complete. */
export function updateWorld(world: World, input: PlayerInput, dt: number): void {
  if (world.status !== 'playing') return;
  world.elapsed += dt;
  world.graceTimer = Math.max(0, world.graceTimer - dt);
  updatePlayer(world, input, dt);

  const cfg = world.level.snake;
  // A copy: a growth split adds a snake mid-loop, and it should first move next update.
  for (const snake of [...world.snakes]) {
    snake.interval = Math.max(cfg.minInterval, cfg.baseInterval - world.elapsed * cfg.rampPerSecond);
    if (snake.stunTimer > 0) {
      // Stunned (or dazed after splitting off): frozen, no steps and no growth. Its body still blocks.
      snake.stunTimer = Math.max(0, snake.stunTimer - dt);
      continue;
    }
    snake.growTimer += dt;
    if (snake.growTimer >= cfg.growEverySeconds) {
      snake.growTimer -= cfg.growEverySeconds;
      if (snake.cells.length + snake.pendingGrow < cfg.maxLength) snake.pendingGrow++;
    }
    const target = BEHAVIORS[cfg.behavior](world, snake);
    advanceSnake(world, snake, dt, target.x, target.z, true);
    updateGrowthSplit(world, snake, dt);
  }
  for (let i = world.severed.length - 1; i >= 0; i--) {
    world.severed[i].life -= dt;
    if (world.severed[i].life <= 0) world.severed.splice(i, 1);
  }

  resolveCollisions(world);
  if (world.status !== 'playing') return;

  const pickup = BALANCE.pellets.pickupRadius;
  for (let i = world.pellets.length - 1; i >= 0; i--) {
    const p = world.pellets[i];
    if (Math.hypot(cellToWorld(world.grid, p.x) - world.player.x, cellToWorld(world.grid, p.z) - world.player.z) < pickup) {
      world.pellets.splice(i, 1);
      world.pelletsCollected++;
      world.xpGained += BALANCE.xp.perPellet;
      world.events.push({ type: 'pelletCollected' });
      spawnPellet(world);
    }
  }
  if (world.pellets.length < world.level.pelletCount) {
    world.pelletRespawn -= dt;
    if (world.pelletRespawn <= 0) {
      spawnPellet(world);
      world.pelletRespawn = BALANCE.pellets.respawnRetry;
    }
  }

  updateItems(world, input, dt);
  updateProjectiles(world, dt);
  if (world.status !== 'playing') return;

  if (goalMet(world.level.goal, world)) {
    world.status = 'complete';
    world.events.push({ type: 'levelComplete' });
  }
}

/** Title-screen demo: the first snake wanders toward (tx, tz) with no player interaction. */
export function updateDemo(world: World, dt: number, tx: number, tz: number): void {
  const snake = world.snakes[0];
  if (!snake) return;
  snake.interval = 0.22;
  if (snake.cells.length < 16) snake.pendingGrow = 1;
  advanceSnake(world, snake, dt, tx, tz, false);
}

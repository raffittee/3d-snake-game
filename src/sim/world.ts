import { BEHAVIORS } from '../ai';
import { BALANCE } from '../config/balance';
import type { LevelConfig } from '../levels/types';
import { overlapDepth, pushOut } from './collision';
import { cellToWorld, inBounds, makeGrid, worldToCell } from './grid';
import { generatePillars } from './pillars';
import { Pathfinder } from './pathfinding';
import { spawnPellet } from './pellets';
import { createPlayer, updatePlayer } from './player';
import { createRng } from './rng';
import { advanceSnake, createSnake, segmentHalfWidth } from './snake';
import type { DeathCause, PlayerInput, SimEvent, World } from './types';

/** Build a fresh game for `level`. The same level and seed always give the same arena. */
export function createWorld(level: LevelConfig, seed: number): World {
  const grid = makeGrid(level.size, BALANCE.cellSize);
  const rng = createRng(seed);
  const world = {
    level,
    grid,
    rng,
    pathfinder: new Pathfinder(grid.size, rng),
    pillars: generatePillars(grid, level, rng),
    player: createPlayer(grid),
    pellets: [],
    nextPelletId: 1,
    pelletRespawn: 0,
    elapsed: 0,
    pelletsCollected: 0,
    status: 'playing',
    deathCause: null,
    invulnerable: false,
    events: [],
  } as unknown as World;
  world.snake = createSnake(world);
  const head = world.snake.pos[0];
  world.player.yaw = Math.atan2(-(head.x - world.player.x), -(head.z - world.player.z));
  for (let i = 0; i < level.pelletCount; i++) spawnPellet(world);
  return world;
}

export const scoreOf = (world: World): number =>
  Math.floor(world.elapsed * BALANCE.score.pointsPerSecond) + world.pelletsCollected * BALANCE.pellets.points;

/** Distance in world units between the snake's head and the player, minus the head's size. Never negative. */
export function gapToSnake(world: World): number {
  const head = world.snake.pos[0];
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

function kill(world: World, cause: DeathCause): void {
  if (world.invulnerable) return;
  world.status = 'dead';
  world.deathCause = cause;
  world.events.push({ type: 'died', cause });
}

/** Push the player out of the snake body and pillars, then decide whether they died. */
function resolveCollisions(world: World): void {
  const { player, snake, grid, pillars } = world;
  const r = BALANCE.player.radius;
  const len = snake.pos.length;
  for (let i = 1; i < len; i++) pushOut(player, r, snake.pos[i].x, snake.pos[i].z, segmentHalfWidth(i, len));
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

  const head = snake.pos[0];
  if (overlapDepth(player, r, head.x, head.z, BALANCE.snake.headHalfWidth) > 0) return kill(world, 'caught');
  for (let i = 1; i < len; i++) {
    if (overlapDepth(player, r, snake.pos[i].x, snake.pos[i].z, segmentHalfWidth(i, len)) > BALANCE.snake.crushOverlap) return kill(world, 'crushed');
  }
}

/** Advance the whole game by `dt` seconds. Does nothing once the player has died. */
export function updateWorld(world: World, input: PlayerInput, dt: number): void {
  if (world.status !== 'playing') return;
  world.elapsed += dt;
  updatePlayer(world, input, dt);

  const cfg = world.level.snake;
  const { snake } = world;
  snake.interval = Math.max(cfg.minInterval, cfg.baseInterval - world.elapsed * cfg.rampPerSecond);
  snake.growTimer += dt;
  if (snake.growTimer >= cfg.growEverySeconds) {
    snake.growTimer -= cfg.growEverySeconds;
    if (snake.cells.length + snake.pendingGrow < cfg.maxLength) snake.pendingGrow++;
  }
  const target = BEHAVIORS[cfg.behavior](world);
  advanceSnake(world, dt, target.x, target.z, true);

  resolveCollisions(world);
  if (world.status !== 'playing') return;

  const pickup = BALANCE.pellets.pickupRadius;
  for (let i = world.pellets.length - 1; i >= 0; i--) {
    const p = world.pellets[i];
    if (Math.hypot(cellToWorld(world.grid, p.x) - world.player.x, cellToWorld(world.grid, p.z) - world.player.z) < pickup) {
      world.pellets.splice(i, 1);
      world.pelletsCollected++;
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
}

/** Title-screen demo: the snake wanders toward (tx, tz) with no player interaction. */
export function updateDemo(world: World, dt: number, tx: number, tz: number): void {
  const { snake } = world;
  snake.interval = 0.22;
  if (snake.cells.length < 16) snake.pendingGrow = 1;
  advanceSnake(world, dt, tx, tz, false);
}

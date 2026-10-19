import { BEHAVIORS } from '../ai';
import { BALANCE } from '../config/balance';
import type { LevelConfig } from '../levels/types';
import { overlapDepth, pushOut } from './collision';
import { cellToWorld, inBounds, makeGrid, worldToCell } from './grid';
import { goalMet } from './goals';
import { spawnDrops, updateItems } from './items';
import { hasPerk, inventorySlots, jumpableTail } from './perks';
import type { PerkId } from './perks';
import { updateFirecrackers, updateProjectiles } from './projectiles';
import { updateBurrow } from './burrow';
import { updateMongooses } from './mongoose';
import { stormWarningWave } from './weather';
import { generateLayout } from './layouts';
import { MODES } from './modes';
import { pilotTarget } from './pilot';
import { generatePillars } from './pillars';
import { Tile, isIce, isOpenGround, isShutDoor, tileHeight } from './tiles';
import { initDoors, updateHouse } from './house';
import { initBoss, updateBoss } from './boss';
import { updateIce } from './ice';
import { Pathfinder } from './pathfinding';
import { spawnPellet } from './pellets';
import { NO_INPUT, createPlayer, placePlayer, updatePlayer } from './player';
import { catchable, choosePrey, onFoot } from './hunt';
import { createRng } from './rng';
import { updateGrowthSplit } from './cut';
import { advanceSnake, createSnake, hasTail, isUnder, segmentHalfWidth, segmentHeight } from './snake';
import type { DeathCause, PlayerInput, PlayerState, SimEvent, SnakeState, World } from './types';

/**
 * Build a fresh game for `level` with `playerCount` players (all on the start point). The same
 * level and seed always give the same arena, so a multiplayer client can build the server's arena
 * itself and only receive what moves.
 */
export function createWorld(level: LevelConfig, seed: number, perks: PerkId[] = [], playerCount = 1): World {
  const grid = makeGrid(level.size, BALANCE.cellSize);
  const rng = createRng(seed);
  const layout = generateLayout(level, grid, rng);
  const n = grid.size;
  const gate = layout.exit ?? level.gate ?? { x: -10, z: -10 };
  const avoid = (x: number, z: number): boolean =>
    x >= 0 && z >= 0 && x < n && z < n &&
    (!isOpenGround(layout.tiles[z * n + x]) || layout.relics.some((r) => r.x === x && r.z === z) || (Math.abs(x - gate.x) <= 2 && Math.abs(z - gate.z) <= 3));
  const world = {
    level,
    grid,
    rng,
    pathfinder: new Pathfinder(grid.size, rng),
    pillars: generatePillars(grid, level, rng, avoid),
    tiles: layout.tiles,
    relics: layout.relics,
    relicsFound: 0,
    relicsTaken: [],
    boosts: [],
    gate,
    gateOpen: false,
    players: Array.from({ length: playerCount }, (_, id) => createPlayer(grid, level.start, id, inventorySlots(perks))),
    pellets: [],
    nextPelletId: 1,
    pelletRespawn: 0,
    elapsed: 0,
    pelletsCollected: 0,
    perks: [...perks],
    xpGained: 0,
    drops: [],
    projectiles: [],
    firecrackers: [],
    smokes: [],
    mongooses: [],
    nextMongooseId: 1,
    stormWarned: -1,
    cracking: [],
    doorState: new Uint8Array(n * n),
    doorDamage: new Float32Array(n * n),
    bossPhase: 0,
    bossStartLength: 0,
    snakes: [],
    nextSnakeId: 1,
    severed: [],
    nextDropId: 1,
    dropTimer: level.items.firstDropAfter,
    match: null,
    status: 'playing',
    deathCause: null,
    invulnerable: false,
    events: [],
  } as unknown as World;
  Object.defineProperty(world, 'player', { get: () => world.players[0], enumerable: false, configurable: true });
  initDoors(world);
  initBoss(world);
  world.snakes.push(createSnake(world));
  for (const spawn of level.snake.extraSpawns ?? []) world.snakes.push(createSnake(world, spawn));
  for (const p of world.players) faceSnake(world, p);
  for (let i = 0; i < level.pelletCount; i++) spawnPellet(world);
  return world;
}

export const scoreOf = (world: World): number =>
  Math.floor(world.elapsed * BALANCE.score.pointsPerSecond) + world.pelletsCollected * BALANCE.pellets.points;

/** The snake whose head is nearest player `p` (the one to worry about), or null when none is left. A snake `p` steers does not count. */
export function nearestSnake(world: World, p: PlayerState): SnakeState | null {
  let best: SnakeState | null = null;
  let bestD = Infinity;
  for (const s of world.snakes) {
    if (s.pilot === p.id) continue;
    const h = s.pos[0];
    const d = Math.hypot(h.x - p.x, h.z - p.z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** Distance in world units from the nearest snake head to player `p`, minus the head's size. Never negative. */
export function gapToSnake(world: World, p: PlayerState): number {
  const s = nearestSnake(world, p);
  if (!s) return Infinity;
  const head = s.pos[0];
  return Math.max(0, Math.hypot(head.x - p.x, head.z - p.z) - BALANCE.danger.gapOffset);
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

export function faceSnake(world: World, p: PlayerState): void {
  const s = nearestSnake(world, p);
  if (!s) return;
  const head = s.pos[0];
  p.yaw = Math.atan2(-(head.x - p.x), -(head.z - p.z));
  p.pitch = 0;
}

/**
 * Player `p` was caught (or drowned, or fell in). Multiplayer modes decide what that means
 * (sim/modes.ts). In the campaign: lose a life, and with lives left respawn at the start point and
 * leave the snakes as they are.
 */
export function kill(world: World, p: PlayerState, cause: DeathCause, by: SnakeState | null): void {
  if (world.invulnerable || p.graceTimer > 0) return;
  if (by && hasPerk(world, 'secondWind') && !p.secondWindUsed) {
    // Knocked back instead: thrown away from the snake's head, a moment of grace, no life lost.
    p.secondWindUsed = true;
    const head = by.pos[0];
    const dx = p.x - head.x;
    const dz = p.z - head.z;
    const d = Math.hypot(dx, dz) || 1;
    const kb = BALANCE.perks.secondWindKnockback;
    const lim = world.grid.half - BALANCE.player.radius;
    p.x = Math.min(lim, Math.max(-lim, p.x + (dx / d) * kb));
    p.z = Math.min(lim, Math.max(-lim, p.z + (dz / d) * kb));
    p.graceTimer = BALANCE.perks.secondWindGrace;
    world.events.push({ type: 'secondWind', pid: p.id });
    return;
  }
  p.killerId = by ? by.id : null;
  if (world.match) {
    MODES[world.match.mode].caught(world, p, cause, by);
    return;
  }
  p.lives = Math.max(0, p.lives - 1);
  if (p.lives > 0) {
    respawn(world, p);
    world.events.push({ type: 'lifeLost', pid: p.id, cause, livesLeft: p.lives });
    return;
  }
  world.status = 'dead';
  world.deathCause = cause;
  world.events.push({ type: 'died', pid: p.id, cause });
}

/** Back on the start point, facing the nearest snake, with a moment of grace. Keeps items and lives. */
export function respawn(world: World, p: PlayerState): void {
  placePlayer(p, world.grid, world.match?.spawns[p.id] ?? world.level.start);
  faceSnake(world, p);
  p.graceTimer = BALANCE.lives.respawnGrace;
}

/**
 * Push `player` out of every snake body, wall and pillar, and update what they stand in. Pure
 * movement: nobody is caught here, so a multiplayer client can run it to predict its own player.
 */
export function collidePlayer(world: World, player: PlayerState): void {
  const { grid, pillars } = world;
  const r = BALANCE.player.radius;
  const jump = jumpableTail(world);
  // Deep water: a wall unless you carry a swim ring with time left.
  const canSwim = swimRingSlot(player) >= 0;
  const wcx = worldToCell(grid, player.x);
  const wcz = worldToCell(grid, player.z);
  // A hole in the ice (Frozen lake) is open water you cannot swim in: always a wall.
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = wcx + dx;
      const z = wcz + dz;
      if (!inBounds(grid, x, z)) continue;
      const t = world.tiles[z * grid.size + x];
      if ((t === Tile.Water && !canSwim) || t === Tile.Hole) pushOut(player, r, cellToWorld(grid, x), cellToWorld(grid, z), grid.cell / 2);
    }
  }
  const here = world.tiles[worldToCell(grid, player.z) * grid.size + worldToCell(grid, player.x)];
  player.swimming = here === Tile.Water;
  player.inMud = here === Tile.Mud;
  player.onIce = isIce(here);
  // Walls (Ruins): a crumbling wall always blocks; a low wall only while you are below its top.
  const tcx = worldToCell(grid, player.x);
  const tcz = worldToCell(grid, player.z);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = tcx + dx;
      const z = tcz + dz;
      if (!inBounds(grid, x, z)) continue;
      // A shut door (Broken house) is a wall too.
      const i = z * grid.size + x;
      const h = isShutDoor(world, i) ? BALANCE.house.wallHeight : tileHeight(world.tiles[i]);
      if (h > 0 && player.y < h) pushOut(player, r, cellToWorld(grid, x), cellToWorld(grid, z), grid.cell / 2);
    }
  }
  // Height-aware: a segment only blocks you while your feet are below its top.
  for (const snake of world.snakes) {
    const len = snake.pos.length;
    const tail = hasTail(snake);
    for (let i = 1; i < len; i++) {
      if (player.y < segmentHeight(i, len, tail, jump) && !isUnder(snake, i)) pushOut(player, r, snake.pos[i].x, snake.pos[i].z, segmentHalfWidth(i, len, tail));
    }
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
}

/** Whether a snake head has caught `player`, or a body squeezed them against something. A snake does not catch its own pilot. */
function catchPlayer(world: World, player: PlayerState): void {
  const r = BALANCE.player.radius;
  const jump = jumpableTail(world);
  for (const snake of world.snakes) {
    if (snake.pilot === player.id) continue;
    const len = snake.pos.length;
    const tail = hasTail(snake);
    // Under the sand (Burrow) it can't touch you.
    const below = (i: number): boolean => player.y < segmentHeight(i, len, tail, jump) && !isUnder(snake, i);
    const head = snake.pos[0];
    if (below(0) && overlapDepth(player, r, head.x, head.z, BALANCE.snake.headHalfWidth) > 0) return kill(world, player, 'caught', snake);
    for (let i = 1; i < len; i++) {
      if (below(i) && overlapDepth(player, r, snake.pos[i].x, snake.pos[i].z, segmentHalfWidth(i, len, tail)) > BALANCE.snake.crushOverlap) return kill(world, player, 'crushed', snake);
    }
  }
}

/**
 * Advance the whole game by `dt` seconds. `input` is one input for single player, or one per player
 * (by id; a missing one means no input). Does nothing once the game is over.
 */
export function updateWorld(world: World, input: PlayerInput | readonly PlayerInput[], dt: number): void {
  if (world.status !== 'playing') return;
  const inputs: readonly PlayerInput[] = Array.isArray(input) ? input : [input as PlayerInput];
  const inputOf = (p: PlayerState): PlayerInput => inputs[p.id] ?? NO_INPUT;
  world.elapsed += dt;
  for (const p of world.players) {
    p.graceTimer = Math.max(0, p.graceTimer - dt);
    if (!onFoot(p)) continue;
    updatePlayer(world, p, inputOf(p), dt);
    // Doors (R), hiding in closets, and how far your noise carries (Broken house; noise counts anywhere).
    updateHouse(world, p, inputOf(p), dt);
  }
  if (world.match) MODES[world.match.mode].beforeSnakes(world, inputs, dt);

  const cfg = world.level.snake;
  // A copy: a growth split adds a snake mid-loop, and it should first move next update.
  for (const snake of [...world.snakes]) {
    snake.interval = Math.max(cfg.minInterval, cfg.baseInterval - world.elapsed * cfg.rampPerSecond);
    if (world.match) snake.interval *= world.match.speedScale;
    // It swims too, but slower.
    const head = snake.cells[0];
    if (world.tiles[head.z * world.grid.size + head.x] === Tile.Water) snake.interval *= BALANCE.river.snakeSwimSlow;
    // Burrowing: faster under the sand.
    if (snake.burrow.mode === 'down') snake.interval *= BALANCE.ai.burrowSpeed;
    // Dashing (a steered snake's ability): faster still.
    if (snake.dash > 0) snake.interval *= BALANCE.pilot.dashSpeed;
    // A lure (firecracker, smoke bomb) runs out on its own clock, stunned or not; so does a grudge.
    if (snake.lure && (snake.lure.time -= dt) <= 0) snake.lure = null;
    if (snake.aggro && (snake.aggro.time -= dt) <= 0) snake.aggro = null;
    if (snake.stunTimer > 0) {
      // Stunned (or dazed after splitting off, or pinned by a mongoose): frozen, no steps and no growth. Its body still blocks.
      snake.stunTimer = Math.max(0, snake.stunTimer - dt);
      continue;
    }
    // Who it hunts: whoever hit it last, else the nearest player it can catch.
    snake.prey = choosePrey(world, snake);
    // About to break the surface (Burrow): it holds still while the sand heaves.
    if (updateBurrow(world, snake, dt)) continue;
    snake.growTimer += dt;
    if (snake.growTimer >= cfg.growEverySeconds) {
      snake.growTimer -= cfg.growEverySeconds;
      if (snake.cells.length + snake.pendingGrow < maxLength(world)) snake.pendingGrow++;
    }
    // A steered snake goes where its pilot points. A firecracker's bang (or a smoke bomb) beats any
    // behavior: it goes there, out of cover if it has to. The Mother Snake's last stand (boss phase 3) coils.
    const target = snake.pilot !== null
      ? pilotTarget(world, snake, inputs[snake.pilot] ?? NO_INPUT, dt)
      : snake.lure ?? BEHAVIORS[world.bossPhase === 3 ? 'coil' : cfg.behavior](world, snake);
    advanceSnake(world, snake, dt, target.x, target.z, true, 'cover' in target && !!target.cover);
    updateGrowthSplit(world, snake, dt);
  }
  for (let i = world.severed.length - 1; i >= 0; i--) {
    world.severed[i].life -= dt;
    if (world.severed[i].life <= 0) world.severed.splice(i, 1);
  }

  for (const p of world.players) if (onFoot(p)) collidePlayer(world, p);
  for (const p of world.players) if (catchable(p) && world.status === 'playing') catchPlayer(world, p);
  if (world.status !== 'playing') return;

  const pickup = BALANCE.pellets.pickupRadius;
  for (let i = world.pellets.length - 1; i >= 0; i--) {
    const pellet = world.pellets[i];
    const by = world.players.find((p) => onFoot(p) && Math.hypot(cellToWorld(world.grid, pellet.x) - p.x, cellToWorld(world.grid, pellet.z) - p.z) < pickup);
    if (!by) continue;
    world.pellets.splice(i, 1);
    world.pelletsCollected++;
    by.pellets++;
    world.xpGained += BALANCE.xp.perPellet;
    if (world.level.pelletBoost) world.boosts.push(world.level.pelletBoost.seconds);
    world.events.push({ type: 'pelletCollected', pid: by.id });
    if (world.match) MODES[world.match.mode].pellet(world, by);
    spawnPellet(world);
  }
  if (world.pellets.length < world.level.pelletCount) {
    world.pelletRespawn -= dt;
    if (world.pelletRespawn <= 0) {
      spawnPellet(world);
      world.pelletRespawn = BALANCE.pellets.respawnRetry;
    }
  }

  for (const p of world.players) if (onFoot(p)) updateItems(world, p, inputOf(p), dt);
  spawnDrops(world, dt);
  updateProjectiles(world, dt);
  updateFirecrackers(world, dt);
  updateMongooses(world, dt);
  // Frozen lake: cracked ice gives way under a long snake; standing on it when it goes, you fall in.
  for (const p of updateIce(world, dt)) if (world.status === 'playing') kill(world, p, 'fell', null);
  if (world.status !== 'playing') return;
  // Dark cave: the flashlight's battery, and the Mother Snake's phases.
  updateBoss(world, dt);
  // Desert: the wind rises a few seconds before each sandstorm.
  const wave = stormWarningWave(world.level, world.elapsed);
  if (wave >= 0 && wave > world.stormWarned) {
    world.stormWarned = wave;
    world.events.push({ type: 'stormWarning' });
  }
  for (let i = world.smokes.length - 1; i >= 0; i--) if ((world.smokes[i].time -= dt) <= 0) world.smokes.splice(i, 1);
  for (const p of world.players) if (onFoot(p)) pickUpRelics(world, p);
  for (const p of world.players) if (onFoot(p) && world.status === 'playing') updateSwimming(world, p, dt);
  if (world.status !== 'playing') return;
  for (let i = world.boosts.length - 1; i >= 0; i--) {
    world.boosts[i] -= dt;
    if (world.boosts[i] <= 0) world.boosts.splice(i, 1);
  }

  if (world.match) {
    MODES[world.match.mode].after(world, dt);
    return;
  }
  if (goalMet(world.level.goal, world)) {
    world.status = 'complete';
    world.events.push({ type: 'levelComplete' });
  }
}

/** How long a snake may grow: the level's cap, raised in multiplayer by the match. */
const maxLength = (world: World): number => world.level.snake.maxLength + (world.match?.extraLength ?? 0);

/** The first inventory slot holding a swim ring with time left, or -1. */
function swimRingSlot(p: PlayerState): number {
  return p.inventory.findIndex((h) => h !== null && h.item === 'swimRing' && h.uses > 0);
}

/**
 * While you swim, the swim ring's seconds drain. Run out in deep water and you drown (a life).
 * A spent ring is gone; with no ring left, the water pushes you back next update.
 */
function updateSwimming(world: World, p: PlayerState, dt: number): void {
  if (!p.swimming) return;
  const slot = swimRingSlot(p);
  if (slot < 0) {
    kill(world, p, 'drowned', null);
    return;
  }
  const ring = p.inventory[slot];
  if (!ring) return;
  ring.uses = Math.max(0, ring.uses - dt);
  if (ring.uses <= 0) {
    p.inventory[slot] = null;
    world.events.push({ type: 'itemSpoiled', pid: p.id, slot, item: 'swimRing' });
    if (swimRingSlot(p) < 0) kill(world, p, 'drowned', null);
  }
}

/**
 * Relics (Ruins): walk over one to pick it up; the last one opens the gate. The corn maze's map is
 * the same thing with a count of one: it opens the exit (and the HUD turns the minimap on).
 */
function pickUpRelics(world: World, p: PlayerState): void {
  const goal = world.level.goal;
  if (goal.kind !== 'relicsThenGate' && goal.kind !== 'mapThenExit') return;
  const needed = goal.kind === 'relicsThenGate' ? goal.relics : 1;
  for (let i = world.relics.length - 1; i >= 0; i--) {
    const c = world.relics[i];
    if (Math.hypot(cellToWorld(world.grid, c.x) - p.x, cellToWorld(world.grid, c.z) - p.z) > BALANCE.arena.relicPickupRadius) continue;
    world.relics.splice(i, 1);
    world.relicsTaken.push(c);
    world.relicsFound++;
    if (goal.kind === 'mapThenExit') world.events.push({ type: 'mapFound' });
    else world.events.push({ type: 'relicFound', left: Math.max(0, needed - world.relicsFound) });
    if (!world.gateOpen && world.relicsFound >= needed) {
      world.gateOpen = true;
      world.events.push({ type: 'gateOpened' });
    }
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

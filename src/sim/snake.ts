import { BALANCE } from '../config/balance';
import { minDistanceToPlayers } from './hunt';
import { stepOffset } from './pathfinding';
import { cellToWorld } from './grid';
import { lerp } from './math';
import { bashDoor } from './house';
import { blocksSnake, isShutDoor, Tile } from './tiles';
import type { Cell, SnakeState, World } from './types';

/** A snake on `cells` (head first), not yet placed in the world. */
export function makeSnake(world: Pick<World, 'grid' | 'level' | 'elapsed'>, id: number, cells: Cell[]): SnakeState {
  const snake: SnakeState = {
    id,
    cells,
    prev: cells.map((c) => ({ ...c })),
    pos: [],
    timer: 0,
    interval: world.level.snake.baseInterval,
    pendingGrow: 0,
    growTimer: 0,
    steps: 0,
    stunTimer: 0,
    stump: 0,
    splitWarn: 0,
    bornAt: world.elapsed,
    striking: false,
    lure: null,
    under: cells.map(() => false),
    burrow: { mode: 'up', t: 0 },
    lurk: null,
    coil: BALANCE.ai.coilStartRadius,
    prey: 0,
    aggro: null,
    pilot: null,
    heading: 0,
    dash: 0,
    cooldowns: { dash: 0, burrow: 0, whip: 0 },
  };
  computeSegmentPositions(snake, world.grid, 0);
  return snake;
}

/** A starting snake: its head on `spawn` (the level's spawn by default), the body trailing toward -x. */
export function createSnake(world: Pick<World, 'grid' | 'level' | 'elapsed' | 'nextSnakeId'>, spawn: Cell = world.level.snake.spawn): SnakeState {
  const cfg = world.level.snake;
  const cells: Cell[] = [];
  for (let i = 0; i < cfg.startLength; i++) cells.push({ x: spawn.x - i, z: spawn.z });
  return makeSnake(world, world.nextSnakeId++, cells);
}

export function isSnakeCell(snake: SnakeState, x: number, z: number): boolean {
  return snake.cells.some((c) => c.x === x && c.z === z);
}

/** Whether any snake occupies the cell. */
export function isAnySnakeCell(world: World, x: number, z: number): boolean {
  return world.snakes.some((s) => isSnakeCell(s, x, z));
}

/** Segment `i` is under the sand (Burrow): no collision, stones pass over, hidden. */
export const isUnder = (snake: SnakeState, i: number): boolean => snake.under[i] === true;

/** It ends in its tapered, jumpable tail (not a stump from a cut). */
export const hasTail = (snake: SnakeState): boolean => snake.stump <= 0;

/** Half-width of segment `i` of `length`: full size, tapering over the last few segments of a real tail. */
export function segmentHalfWidth(i: number, length: number, tail = true): number {
  const { bodyHalfWidth, taperSegments, taperMinScale } = BALANCE.snake;
  const taper = tail && i > length - taperSegments ? taperMinScale + (1 - taperMinScale) * ((length - i) / taperSegments) : 1;
  return bodyHalfWidth * taper;
}

/**
 * How tall segment `i` of `length` stands. The last `jumpable` segments of a real tail are low enough
 * to jump (BALANCE.snake.jumpableTail, one more with Spring legs); a stump is not.
 */
export function segmentHeight(i: number, length: number, tail = true, jumpable: number = BALANCE.snake.jumpableTail): number {
  if (i === 0) return BALANCE.snake.headHeight;
  return tail && i >= length - jumpable ? BALANCE.snake.tailHeight : BALANCE.snake.bodyHeight;
}

/** Fill `snake.pos` by blending each segment between its previous and current cell. */
export function computeSegmentPositions(snake: SnakeState, grid: World['grid'], t: number): void {
  const length = snake.cells.length;
  snake.pos.length = length;
  for (let i = 0; i < length; i++) {
    const a = snake.prev[i] ?? snake.cells[i];
    const b = snake.cells[i];
    snake.pos[i] = { x: lerp(cellToWorld(grid, a.x), cellToWorld(grid, b.x), t), z: lerp(cellToWorld(grid, a.z), cellToWorld(grid, b.z), t) };
  }
}

/**
 * One grid step toward (tx, tz). Pillars, its own body and every other snake's body are walls.
 * `interactive` is false for the title-screen demo, where pellets are ignored and no events are emitted.
 * `cover`: it may only move through tall grass (Stalk), so everything else counts as a wall too.
 */
export function stepSnake(world: World, snake: SnakeState, tx: number, tz: number, interactive: boolean, cover = false): void {
  const { pathfinder, pillars, grid } = world;
  const grow = snake.pendingGrow > 0;
  pathfinder.blocked.set(pillars);
  // It goes around low walls (and later deep obstacles); crumbling walls it smashes, so they stay free.
  const { tiles } = world;
  for (let i = 0; i < tiles.length; i++) if (blocksSnake(tiles[i]) || (cover && tiles[i] !== Tile.Grass)) pathfinder.blocked[i] = 1;
  const length = snake.cells.length;
  for (let i = 0; i < length - (grow ? 0 : 1); i++) {
    const c = snake.cells[i];
    pathfinder.blocked[c.z * grid.size + c.x] = 1;
  }
  for (const other of world.snakes) {
    if (other === snake) continue;
    for (const c of other.cells) pathfinder.blocked[c.z * grid.size + c.x] = 1;
  }
  const head = snake.cells[0];
  let dir = pathfinder.firstStep(head.x, head.z, tx, tz);
  // BFS may step straight onto its target even when the target cell is blocked. Never step into a
  // blocked cell: that is what let a snake overlap itself (or another snake) when it chased a cell
  // its own body held.
  if (dir >= 0) {
    const [dx, dz] = stepOffset(dir);
    if (!pathfinder.free(head.x + dx, head.z + dz)) dir = -1;
  }
  if (dir < 0) {
    // No path: head for whichever neighbor has the most open room. Directions are tried in
    // random order so ties (open ground) do not always send the snake the same way, which
    // used to walk it into a wall and coil it up.
    let bestRoom = -1;
    for (const k of pathfinder.shuffledDirs()) {
      const [dx, dz] = stepOffset(k);
      const nx = head.x + dx;
      const nz = head.z + dz;
      if (!pathfinder.free(nx, nz)) continue;
      const room = pathfinder.roomFrom(nx, nz);
      if (room > bestRoom) {
        bestRoom = room;
        dir = k;
      }
    }
  }
  // Boxed in by its cover (a patch too small for it): step out of the grass rather than shed its tail.
  if (dir < 0 && cover) {
    stepSnake(world, snake, tx, tz, interactive, false);
    return;
  }
  // Its way on is a shut door (Broken house): it bashes at it instead of moving.
  if (dir >= 0) {
    const [bx, bz] = stepOffset(dir);
    const bi = (head.z + bz) * grid.size + head.x + bx;
    if (isShutDoor(world, bi)) {
      bashDoor(world, snake, bi, interactive);
      return;
    }
  }
  const old = snake.cells.map((c) => ({ ...c }));
  if (dir < 0) {
    // Completely boxed in: shed the tail.
    if (snake.cells.length > 4) snake.cells.splice(-3);
    snake.under.length = snake.cells.length;
    snake.prev = snake.cells.map((c) => ({ ...c }));
    return;
  }
  const [dx, dz] = stepOffset(dir);
  const newHead: Cell = { x: head.x + dx, z: head.z + dz };
  snake.cells.unshift(newHead);
  // Burrowing: the head goes on under the sand; the body follows it down (or up) cell by cell.
  const underNow = snake.burrow.mode === 'down';
  snake.under.unshift(underNow);
  const hi = newHead.z * grid.size + newHead.x;
  if (world.tiles[hi] === Tile.Crumble) {
    world.tiles[hi] = Tile.Open;
    if (interactive) world.events.push({ type: 'wallSmashed', x: cellToWorld(grid, newHead.x), z: cellToWorld(grid, newHead.z) });
  }
  if (grow) {
    snake.pendingGrow--;
    // A stump regrows its tail as the snake grows.
    if (snake.stump > 0) snake.stump--;
  } else snake.cells.pop();
  snake.under.length = snake.cells.length;
  snake.prev = old;
  if (grow) snake.prev.push({ ...old[old.length - 1] });

  if (!interactive) return;
  const pi = underNow ? -1 : world.pellets.findIndex((p) => p.x === newHead.x && p.z === newHead.z);
  if (pi >= 0) {
    world.pellets.splice(pi, 1);
    snake.pendingGrow += BALANCE.snake.pelletGrowth;
    world.pelletRespawn = BALANCE.pellets.respawnAfterSnakeEats;
    world.events.push({ type: 'snakeAtePellet' });
  }
  snake.steps++;
  const x = cellToWorld(grid, newHead.x);
  const z = cellToWorld(grid, newHead.z);
  const distance = minDistanceToPlayers(world, x, z);
  world.events.push({ type: 'snakeStep', step: snake.steps, distance, x, z, hidden: world.tiles[hi] === Tile.Grass || underNow });
}

/** Advance the snake's clock by `dt`, taking grid steps when due, and refresh segment positions. */
export function advanceSnake(world: World, snake: SnakeState, dt: number, tx: number, tz: number, interactive: boolean, cover = false): void {
  snake.timer += dt;
  let steps = 0;
  while (snake.timer >= snake.interval && steps < 4) {
    snake.timer -= snake.interval;
    stepSnake(world, snake, tx, tz, interactive, cover);
    steps++;
  }
  if (snake.timer >= snake.interval) snake.timer = 0;
  computeSegmentPositions(snake, world.grid, snake.timer / snake.interval);
}

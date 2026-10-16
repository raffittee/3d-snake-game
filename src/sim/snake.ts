import { BALANCE } from '../config/balance';
import { stepOffset } from './pathfinding';
import { cellToWorld } from './grid';
import { lerp } from './math';
import type { Cell, SnakeState, World } from './types';

export function createSnake(world: Pick<World, 'grid' | 'level'>): SnakeState {
  const cfg = world.level.snake;
  const cells: Cell[] = [];
  for (let i = 0; i < cfg.startLength; i++) cells.push({ x: cfg.spawn.x - i, z: cfg.spawn.z });
  const snake: SnakeState = {
    cells,
    prev: cells.map((c) => ({ ...c })),
    pos: [],
    timer: 0,
    interval: cfg.baseInterval,
    pendingGrow: 0,
    growTimer: 0,
    steps: 0,
  };
  computeSegmentPositions(snake, world.grid, 0);
  return snake;
}

export function isSnakeCell(snake: SnakeState, x: number, z: number): boolean {
  return snake.cells.some((c) => c.x === x && c.z === z);
}

/** Half-width of segment `i` of `length`: full size, tapering over the last few segments. */
export function segmentHalfWidth(i: number, length: number): number {
  const { bodyHalfWidth, taperSegments, taperMinScale } = BALANCE.snake;
  const taper = i > length - taperSegments ? taperMinScale + (1 - taperMinScale) * ((length - i) / taperSegments) : 1;
  return bodyHalfWidth * taper;
}

/** How tall segment `i` of `length` stands. The last `jumpableTail` segments are low enough to jump. */
export function segmentHeight(i: number, length: number): number {
  if (i === 0) return BALANCE.snake.headHeight;
  return i >= length - BALANCE.snake.jumpableTail ? BALANCE.snake.tailHeight : BALANCE.snake.bodyHeight;
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
 * One grid step toward (tx, tz). `interactive` is false for the title-screen demo,
 * where pellets are ignored and no events are emitted.
 */
export function stepSnake(world: World, tx: number, tz: number, interactive: boolean): void {
  const { snake, pathfinder, pillars, grid } = world;
  const grow = snake.pendingGrow > 0;
  pathfinder.blocked.set(pillars);
  const length = snake.cells.length;
  for (let i = 0; i < length - (grow ? 0 : 1); i++) {
    const c = snake.cells[i];
    pathfinder.blocked[c.z * grid.size + c.x] = 1;
  }
  const head = snake.cells[0];
  let dir = pathfinder.firstStep(head.x, head.z, tx, tz);
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
  const old = snake.cells.map((c) => ({ ...c }));
  if (dir < 0) {
    // Completely boxed in: shed the tail.
    if (snake.cells.length > 4) snake.cells.splice(-3);
    snake.prev = snake.cells.map((c) => ({ ...c }));
    return;
  }
  const [dx, dz] = stepOffset(dir);
  const newHead: Cell = { x: head.x + dx, z: head.z + dz };
  snake.cells.unshift(newHead);
  if (grow) snake.pendingGrow--;
  else snake.cells.pop();
  snake.prev = old;
  if (grow) snake.prev.push({ ...old[old.length - 1] });

  if (!interactive) return;
  const pi = world.pellets.findIndex((p) => p.x === newHead.x && p.z === newHead.z);
  if (pi >= 0) {
    world.pellets.splice(pi, 1);
    snake.pendingGrow += BALANCE.snake.pelletGrowth;
    world.pelletRespawn = BALANCE.pellets.respawnAfterSnakeEats;
    world.events.push({ type: 'snakeAtePellet' });
  }
  snake.steps++;
  const distance = Math.hypot(cellToWorld(grid, newHead.x) - world.player.x, cellToWorld(grid, newHead.z) - world.player.z);
  world.events.push({ type: 'snakeStep', step: snake.steps, distance });
}

/** Advance the snake's clock by `dt`, taking grid steps when due, and refresh segment positions. */
export function advanceSnake(world: World, dt: number, tx: number, tz: number, interactive: boolean): void {
  const { snake } = world;
  snake.timer += dt;
  let steps = 0;
  while (snake.timer >= snake.interval && steps < 4) {
    snake.timer -= snake.interval;
    stepSnake(world, tx, tz, interactive);
    steps++;
  }
  if (snake.timer >= snake.interval) snake.timer = 0;
  computeSegmentPositions(snake, world.grid, snake.timer / snake.interval);
}

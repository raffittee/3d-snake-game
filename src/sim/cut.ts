import { BALANCE } from '../config/balance';
import { computeSegmentPositions, hasTail, makeSnake } from './snake';
import type { Cell, CutResult, SnakeState, Vec2, World } from './types';

/** Keep a cut-off piece around briefly so it can twitch and wither on screen. */
function sever(world: World, pos: Vec2[], tail: boolean): void {
  if (pos.length === 0) return;
  const life = BALANCE.snake.severedLife;
  world.severed.push({ id: world.nextSnakeId++, pos: pos.map((p) => ({ ...p })), life, total: life, hasTail: tail });
}

function removeSnake(world: World, snake: SnakeState): void {
  const i = world.snakes.indexOf(snake);
  if (i >= 0) world.snakes.splice(i, 1);
}

/** A whole snake goes down through the ice (its head was on the cell that broke): gone, as if defeated. */
export function fallThrough(world: World, snake: SnakeState): void {
  sever(world, snake.pos, hasTail(snake));
  removeSnake(world, snake);
  world.events.push({ type: 'snakeDefeated' });
}

/**
 * Cut `count` segments out of `snake` starting at segment `seg` (the head, 0, cannot be cut).
 * - Levels where the snake can be beaten: a front piece under 3 segments means it is defeated.
 * - Elsewhere a cut that would leave the front under the level's floor bounces off.
 * - The piece behind the cut becomes a new snake when it has at least `minSplitLength` segments
 *   (it grows a head and is dazed for a moment); shorter pieces wither.
 * The front keeps a stump (no jumpable tail) until it regrows one.
 */
export function cutSnake(world: World, snake: SnakeState, seg: number, count = 1): CutResult {
  const len = snake.cells.length;
  const cfg = world.level.snake;
  if (seg <= 0 || seg >= len) return 'bounce';
  const end = Math.min(len, seg + count);
  const front: Cell[] = snake.cells.slice(0, seg);
  const back: Cell[] = snake.cells.slice(end);
  const at = snake.pos[seg];
  const report = (result: CutResult): CutResult => {
    world.events.push({ type: 'snakeCut', result, x: at.x, z: at.z });
    return result;
  };

  if (cfg.defeatable && front.length < 3) {
    sever(world, snake.pos, hasTail(snake));
    removeSnake(world, snake);
    world.events.push({ type: 'snakeDefeated' });
    return report('defeated');
  }
  if (!cfg.defeatable && front.length < cfg.floor) return report('bounce');

  const backPos = snake.pos.slice(end);
  const backPrev = snake.prev.slice(end);
  const backUnder = snake.under.slice(end);
  const tail = hasTail(snake);
  const stumpLeft = snake.stump;

  snake.cells = front;
  snake.prev = snake.prev.slice(0, seg);
  snake.pos = snake.pos.slice(0, seg);
  snake.under = snake.under.slice(0, seg);
  snake.stump = BALANCE.snake.jumpableTail;
  // Growth already owed stays with the front piece.

  // The Mother Snake (boss): what is cut off never grows a head of its own; it withers.
  if (back.length >= BALANCE.snake.minSplitLength && !cfg.boss) {
    const born = makeSnake(world, world.nextSnakeId++, back);
    born.prev = backPrev.map((c) => ({ ...c }));
    born.under = backUnder;
    born.timer = snake.timer;
    born.interval = snake.interval;
    born.stump = stumpLeft;
    born.stunTimer = BALANCE.snake.splitDazeSeconds;
    computeSegmentPositions(born, world.grid, born.interval > 0 ? born.timer / born.interval : 0);
    world.snakes.push(born);
    return report('split');
  }
  sever(world, backPos, tail);
  return report('shrunk');
}

/**
 * Growth split (Level 3): a snake past the level's `splitAt` length flashes for `splitWarnSeconds`,
 * then splits in half by itself. Called once per snake per update.
 */
export function updateGrowthSplit(world: World, snake: SnakeState, dt: number): void {
  const at = world.level.snake.splitAt;
  if (!at) return;
  if (snake.splitWarn > 0) {
    snake.splitWarn = Math.max(0, snake.splitWarn - dt);
    if (snake.splitWarn === 0 && snake.cells.length >= 2 * BALANCE.snake.minSplitLength) splitInHalf(world, snake);
    return;
  }
  if (snake.cells.length >= at) {
    snake.splitWarn = BALANCE.snake.splitWarnSeconds;
    world.events.push({ type: 'snakeSplitWarning', snakeId: snake.id });
  }
}

/** Split without destroying a segment: the back half grows a head (the growth split, and the Mother Snake's split). */
export function splitInHalf(world: World, snake: SnakeState): void {
  const mid = Math.floor(snake.cells.length / 2);
  const back = snake.cells.slice(mid);
  const born = makeSnake(world, world.nextSnakeId++, back);
  born.prev = snake.prev.slice(mid).map((c) => ({ ...c }));
  born.under = snake.under.slice(mid);
  born.timer = snake.timer;
  born.interval = snake.interval;
  born.stump = snake.stump;
  born.stunTimer = BALANCE.snake.splitDazeSeconds;
  computeSegmentPositions(born, world.grid, born.interval > 0 ? born.timer / born.interval : 0);
  const at = snake.pos[mid];
  snake.cells = snake.cells.slice(0, mid);
  snake.prev = snake.prev.slice(0, mid);
  snake.pos = snake.pos.slice(0, mid);
  snake.under = snake.under.slice(0, mid);
  snake.stump = BALANCE.snake.jumpableTail;
  world.snakes.push(born);
  world.events.push({ type: 'snakeCut', result: 'split', x: at.x, z: at.z });
}

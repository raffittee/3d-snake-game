import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { level01 } from '../src/levels/level01';
import type { LevelConfig } from '../src/levels/types';
import { cutSnake } from '../src/sim/cut';
import { cellToWorld } from '../src/sim/grid';
import { NO_INPUT } from '../src/sim/player';
import { computeSegmentPositions, hasTail, makeSnake, segmentHeight } from '../src/sim/snake';
import { createWorld, drainEvents, updateWorld } from '../src/sim/world';
import type { Cell, SnakeState, World } from '../src/sim/types';

/** A world whose only snake lies straight along z = 20, head at x = 30, `length` segments long. */
function world(length: number, level: LevelConfig = level01): World {
  const w = createWorld(level, 3);
  w.invulnerable = true;
  w.pillars.fill(0);
  w.pellets = [];
  w.dropTimer = 1e9;
  const cells: Cell[] = [];
  for (let i = 0; i < length; i++) cells.push({ x: 30 - i, z: 20 });
  w.snakes = [makeSnake(w, 1, cells)];
  w.nextSnakeId = 2;
  // Park the player far from the snakes.
  w.player.x = cellToWorld(w.grid, 4);
  w.player.z = cellToWorld(w.grid, 44);
  return w;
}

const connected = (s: SnakeState) => s.cells.every((c, i) => i === 0 || Math.abs(c.x - s.cells[i - 1].x) + Math.abs(c.z - s.cells[i - 1].z) === 1);

describe('cutting the snake', () => {
  it('starts as one snake', () => {
    const w = createWorld(level01, 1);
    expect(w.snakes).toHaveLength(1);
  });

  it('a cut near the tail shrinks it; the cut-off piece withers', () => {
    const w = world(12);
    const result = cutSnake(w, w.snakes[0], 10);
    expect(result).toBe('shrunk');
    expect(w.snakes).toHaveLength(1);
    expect(w.snakes[0].cells).toHaveLength(10);
    expect(w.severed).toHaveLength(1);
    expect(w.severed[0].pos).toHaveLength(1);
    expect(drainEvents(w).some((e) => e.type === 'snakeCut' && e.result === 'shrunk')).toBe(true);
  });

  it('a mid-body cut splits it: the back half becomes a second snake with its own head', () => {
    const w = world(16);
    const result = cutSnake(w, w.snakes[0], 7);
    expect(result).toBe('split');
    expect(w.snakes).toHaveLength(2);
    const [front, back] = w.snakes;
    expect(front.cells).toHaveLength(7);
    expect(back.cells).toHaveLength(8);
    // The cut segment is gone; the new head is the segment right behind the cut.
    expect(back.cells[0]).toEqual({ x: 30 - 8, z: 20 });
    expect(back.id).not.toBe(front.id);
    expect(connected(front) && connected(back)).toBe(true);
    // The new snake is dazed while it grows its head.
    expect(back.stunTimer).toBeCloseTo(BALANCE.snake.splitDazeSeconds);
  });

  it('a piece shorter than the split length withers instead of becoming a snake', () => {
    const w = world(12);
    cutSnake(w, w.snakes[0], 12 - BALANCE.snake.minSplitLength);
    expect(w.snakes).toHaveLength(1);
    expect(w.severed).toHaveLength(1);
  });

  it('bounces off the head', () => {
    const w = world(12);
    expect(cutSnake(w, w.snakes[0], 0)).toBe('bounce');
    expect(w.snakes[0].cells).toHaveLength(12);
  });

  it('bounces off at the floor on levels where it cannot be beaten', () => {
    const w = world(9);
    // Cutting at segment 4 would leave a 4-long front, under the floor of 5.
    expect(cutSnake(w, w.snakes[0], level01.snake.floor - 1)).toBe('bounce');
    expect(w.snakes[0].cells).toHaveLength(9);
    // At the floor exactly it still cuts.
    expect(cutSnake(w, w.snakes[0], level01.snake.floor)).toBe('shrunk');
    expect(w.snakes[0].cells).toHaveLength(level01.snake.floor);
  });

  it('is defeated under 3 segments where the level allows it', () => {
    const beatable: LevelConfig = { ...level01, snake: { ...level01.snake, defeatable: true } };
    const w = world(8, beatable);
    expect(cutSnake(w, w.snakes[0], 2)).toBe('defeated');
    expect(w.snakes).toHaveLength(0);
    expect(drainEvents(w).some((e) => e.type === 'snakeDefeated')).toBe(true);
  });

  it('a cut leaves a stump: nothing low to jump until the tail regrows', () => {
    const w = world(14);
    const s = w.snakes[0];
    cutSnake(w, s, 10);
    expect(hasTail(s)).toBe(false);
    const len = s.cells.length;
    expect(segmentHeight(len - 1, len, hasTail(s))).toBe(BALANCE.snake.bodyHeight);
    // Each growth step regrows a little; after `jumpableTail` of them the tail is back.
    s.pendingGrow = BALANCE.snake.jumpableTail;
    for (let i = 0; i < 60 && s.pendingGrow > 0; i++) updateWorld(w, NO_INPUT, s.interval);
    expect(hasTail(s)).toBe(true);
  });

  it('a severed piece withers away', () => {
    const w = world(12);
    cutSnake(w, w.snakes[0], 10);
    for (let t = 0; t < BALANCE.snake.severedLife + 0.2; t += 0.1) updateWorld(w, NO_INPUT, 0.1);
    expect(w.severed).toHaveLength(0);
  });
});

describe('several snakes', () => {
  it('each snake paths around the other snakes and never steps into one', () => {
    const w = world(6);
    // A wall of a second snake between the first snake and the player.
    const wall: Cell[] = [];
    for (let z = 12; z <= 30; z++) wall.push({ x: 22, z });
    const blocker = makeSnake(w, 9, wall);
    blocker.stunTimer = 1e9;
    w.snakes.push(blocker);
    w.player.x = cellToWorld(w.grid, 18);
    w.player.z = cellToWorld(w.grid, 20);
    const chaser = w.snakes[0];
    for (let t = 0; t < 12; t += 0.05) {
      updateWorld(w, NO_INPUT, 0.05);
      for (const c of chaser.cells) expect(blocker.cells.some((b) => b.x === c.x && b.z === c.z)).toBe(false);
      expect(connected(chaser)).toBe(true);
    }
    // It found its way around the wall toward the player.
    expect(chaser.cells[0].x).toBeLessThan(22);
  });

  it('a split-off snake can catch you too', () => {
    const w = world(16);
    w.invulnerable = false;
    w.player.lives = 1;
    cutSnake(w, w.snakes[0], 7);
    const born = w.snakes[1];
    w.player.x = born.pos[0].x;
    w.player.z = born.pos[0].z;
    updateWorld(w, NO_INPUT, 0.01);
    expect(w.status).toBe('dead');
    expect(w.player.killerId).toBe(born.id);
  });

  it('a stone stuns only the snake it hits', () => {
    const w = world(16);
    cutSnake(w, w.snakes[0], 7);
    const [front, back] = w.snakes;
    back.stunTimer = 0;
    // Stand south of the front snake's head and shoot straight at it.
    const head = front.pos[0];
    w.player.x = head.x;
    w.player.z = head.z + 12;
    w.player.yaw = 0;
    w.player.pitch = 0;
    w.player.inventory[0] = { item: 'slingshot', tier: 'white', uses: 3, spoilLeft: 40, spoilTotal: 40 };
    updateWorld(w, { ...NO_INPUT, useItem: true }, 0.01);
    for (let i = 0; i < 60 && w.projectiles.length; i++) updateWorld(w, NO_INPUT, 0.02);
    expect(front.stunTimer).toBeGreaterThan(0);
    expect(back.stunTimer).toBe(0);
  });
});

describe('growth split', () => {
  const splitting: LevelConfig = { ...level01, snake: { ...level01.snake, splitAt: 14 } };

  it('past the set length the body warns, then the snake splits in half', () => {
    const w = world(14, splitting);
    updateWorld(w, NO_INPUT, 0.01);
    const warned = drainEvents(w).some((e) => e.type === 'snakeSplitWarning');
    expect(warned).toBe(true);
    expect(w.snakes[0].splitWarn).toBeGreaterThan(0);
    expect(w.snakes).toHaveLength(1);
    for (let t = 0; t < BALANCE.snake.splitWarnSeconds + 0.2; t += 0.05) updateWorld(w, NO_INPUT, 0.05);
    expect(w.snakes).toHaveLength(2);
    const total = w.snakes[0].cells.length + w.snakes[1].cells.length;
    expect(total).toBeGreaterThanOrEqual(14);
    for (const s of w.snakes) expect(connected(s)).toBe(true);
  });

  it('never splits without a set length', () => {
    const w = world(30);
    for (let t = 0; t < 4; t += 0.05) updateWorld(w, NO_INPUT, 0.05);
    expect(w.snakes).toHaveLength(1);
  });

  it('a new snake from a split keeps its segment positions consistent', () => {
    const w = world(16);
    cutSnake(w, w.snakes[0], 7);
    const back = w.snakes[1];
    computeSegmentPositions(back, w.grid, 0);
    expect(back.pos).toHaveLength(back.cells.length);
  });
});

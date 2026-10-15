import { describe, expect, it } from 'vitest';
import { level01 } from '../src/levels/level01';
import { createWorld } from '../src/sim/world';
import { advanceSnake, segmentHalfWidth, stepSnake } from '../src/sim/snake';
import { BALANCE } from '../src/config/balance';

const world = () => createWorld(level01, 123);

describe('snake', () => {
  it('starts with the configured length, head first, trailing to -x', () => {
    const w = world();
    expect(w.snake.cells).toHaveLength(level01.snake.startLength);
    expect(w.snake.cells[0]).toEqual(level01.snake.spawn);
    expect(w.snake.cells[1].x).toBe(level01.snake.spawn.x - 1);
  });

  it('moves one cell per step and keeps its length', () => {
    const w = world();
    const before = w.snake.cells[0];
    stepSnake(w, 20, 3, true);
    const after = w.snake.cells[0];
    expect(Math.abs(after.x - before.x) + Math.abs(after.z - before.z)).toBe(1);
    expect(w.snake.cells).toHaveLength(level01.snake.startLength);
  });

  it('grows when growth is pending', () => {
    const w = world();
    w.snake.pendingGrow = 2;
    stepSnake(w, 20, 3, true);
    stepSnake(w, 20, 3, true);
    expect(w.snake.cells).toHaveLength(level01.snake.startLength + 2);
    expect(w.snake.pendingGrow).toBe(0);
  });

  it('eats a pellet it steps onto, and queues growth', () => {
    const w = world();
    const h = w.snake.cells[0];
    w.pellets = [{ id: 99, x: h.x + 1, z: h.z }];
    stepSnake(w, h.x + 10, h.z, true);
    expect(w.pellets).toHaveLength(0);
    expect(w.snake.pendingGrow).toBe(BALANCE.snake.pelletGrowth);
    expect(w.events.some((e) => e.type === 'snakeAtePellet')).toBe(true);
  });

  it('ignores pellets and emits nothing in demo mode', () => {
    const w = world();
    const h = w.snake.cells[0];
    w.pellets = [{ id: 99, x: h.x + 1, z: h.z }];
    stepSnake(w, h.x + 10, h.z, false);
    expect(w.pellets).toHaveLength(1);
    expect(w.events).toHaveLength(0);
  });

  it('sheds its tail when completely boxed in', () => {
    const w = world();
    const h = w.snake.cells[0];
    // Wall off every free neighbor of the head with pillars.
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) w.pillars[(h.z + dz) * w.grid.size + h.x + dx] = 1;
    const before = w.snake.cells.length;
    stepSnake(w, 20, 20, true);
    expect(w.snake.cells.length).toBe(before - 3);
  });

  it('takes a step when its timer passes the interval', () => {
    const w = world();
    const head = { ...w.snake.cells[0] };
    advanceSnake(w, w.snake.interval + 0.01, 20, 3, true);
    expect(w.snake.cells[0]).not.toEqual(head);
  });

  it('tapers the last segments', () => {
    expect(segmentHalfWidth(0, 20)).toBe(BALANCE.snake.bodyHalfWidth);
    expect(segmentHalfWidth(19, 20)).toBeLessThan(BALANCE.snake.bodyHalfWidth);
  });
});

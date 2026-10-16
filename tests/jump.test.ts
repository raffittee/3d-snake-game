import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { level01 } from '../src/levels/level01';
import { cellToWorld } from '../src/sim/grid';
import { NO_INPUT, updatePlayer } from '../src/sim/player';
import { computeSegmentPositions, segmentHeight } from '../src/sim/snake';
import { createWorld, updateWorld } from '../src/sim/world';
import type { PlayerInput, World } from '../src/sim/types';

const input = (over: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...over });
const JUMP = input({ jump: true });
const { jumpSpeed, gravity, jumpStaminaCost } = BALANCE.player;
const apex = (jumpSpeed * jumpSpeed) / (2 * gravity);

/** A 10-segment snake lying along z = 10, head at x = 20, tail at x = 11, not about to step. */
function worldWithLongSnake(): World {
  const w = createWorld(level01, 9);
  w.invulnerable = true;
  w.pillars.fill(0);
  const cells = [];
  for (let i = 0; i < 10; i++) cells.push({ x: 20 - i, z: 10 });
  w.snake.cells = cells;
  w.snake.prev = cells.map((c) => ({ ...c }));
  w.snake.pendingGrow = 0;
  w.snake.timer = 0;
  computeSegmentPositions(w.snake, w.grid, 0);
  return w;
}

/** Put the player in the air, slightly off-center over segment `i`. */
function hoverOver(w: World, i: number, y: number): void {
  const c = w.snake.cells[i];
  w.player.x = cellToWorld(w.grid, c.x);
  w.player.z = cellToWorld(w.grid, c.z) + 0.3;
  w.player.y = y;
  w.player.vy = 0;
}

describe('jumping', () => {
  it('rises, comes back down to the ground, and costs stamina', () => {
    const w = createWorld(level01, 1);
    updatePlayer(w, JUMP, 0.01);
    expect(w.player.y).toBeGreaterThan(0);
    expect(w.player.stamina).toBeCloseTo(1 - jumpStaminaCost);
    let peak = 0;
    for (let t = 0; t < 1.5; t += 0.01) {
      updatePlayer(w, NO_INPUT, 0.01);
      peak = Math.max(peak, w.player.y);
    }
    expect(peak).toBeCloseTo(apex, 1);
    expect(w.player.y).toBe(0);
    expect(w.player.vy).toBe(0);
  });

  it('cannot jump again in mid-air', () => {
    const w = createWorld(level01, 1);
    updatePlayer(w, JUMP, 0.05);
    const stamina = w.player.stamina;
    const vy = w.player.vy;
    updatePlayer(w, JUMP, 0.05);
    expect(w.player.vy).toBeLessThan(vy);
    expect(w.player.stamina).toBeGreaterThanOrEqual(stamina);
  });

  it('cannot jump without enough stamina or while tired', () => {
    const low = createWorld(level01, 1);
    low.player.stamina = jumpStaminaCost / 2;
    updatePlayer(low, JUMP, 0.01);
    expect(low.player.y).toBe(0);

    const tired = createWorld(level01, 1);
    tired.player.tired = true;
    tired.player.stamina = 0.3;
    updatePlayer(tired, JUMP, 0.01);
    expect(tired.player.y).toBe(0);
  });

  it('jumps high enough to clear the tail but never the rest of the body', () => {
    const w = worldWithLongSnake();
    const len = w.snake.cells.length;
    expect(apex).toBeGreaterThan(segmentHeight(len - 1, len) + 0.3);
    expect(apex).toBeLessThan(segmentHeight(len - BALANCE.snake.jumpableTail - 1, len));
  });

  it('the body towers over your eyes; the head is at least as tall', () => {
    const len = 12;
    for (let i = 1; i < len - BALANCE.snake.jumpableTail; i++) expect(segmentHeight(i, len)).toBeGreaterThanOrEqual(BALANCE.player.eyeHeight + 0.5);
    expect(segmentHeight(0, len)).toBeGreaterThanOrEqual(segmentHeight(1, len));
  });

  it('only the last few segments are low enough to jump', () => {
    const len = 10;
    for (let i = 1; i < len; i++) {
      const low = i >= len - BALANCE.snake.jumpableTail;
      expect(segmentHeight(i, len) < apex).toBe(low);
    }
  });

  it('an airborne player passes over a tail segment', () => {
    const w = worldWithLongSnake();
    hoverOver(w, 9, 1.0);
    const { x, z } = w.player;
    updateWorld(w, NO_INPUT, 0.001);
    expect(w.player.x).toBeCloseTo(x, 5);
    expect(w.player.z).toBeCloseTo(z, 5);
  });

  it('an airborne player at the same height is pushed out of a body segment', () => {
    const w = worldWithLongSnake();
    hoverOver(w, 3, 1.0);
    const { x, z } = w.player;
    updateWorld(w, NO_INPUT, 0.001);
    expect(Math.hypot(w.player.x - x, w.player.z - z)).toBeGreaterThan(0.1);
  });

  it('jumping onto a body segment is not a way to dodge a crush', () => {
    const w = worldWithLongSnake();
    w.invulnerable = false;
    w.lives = 1;
    // Deep inside a body segment while low in the air: still counts as being crushed.
    const c = w.snake.cells[3];
    w.player.x = cellToWorld(w.grid, c.x);
    w.player.z = cellToWorld(w.grid, c.z);
    w.player.y = 0.5;
    w.player.vy = 0;
    // Box it in with pillars on both sides so the push-out cannot free it.
    w.pillars[(c.z - 1) * w.grid.size + c.x] = 1;
    w.pillars[(c.z + 1) * w.grid.size + c.x] = 1;
    updateWorld(w, NO_INPUT, 0.001);
    expect(w.status).toBe('dead');
  });
});

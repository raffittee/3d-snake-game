import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { level01 } from '../src/levels/level01';
import type { PlayerInput, World } from '../src/sim/types';
import { createWorld, updateWorld } from '../src/sim/world';

/**
 * A simple runner: face away from the snake's head and run, sprinting when it is close.
 * It is not smart. Its job is to keep the sim busy for a few minutes so invariants can be checked.
 */
function botInput(w: World): PlayerInput {
  const head = w.snake.pos[0];
  const awayX = w.player.x - head.x;
  const awayZ = w.player.z - head.z;
  // Blend in a pull toward the arena center so the bot does not just hug a wall.
  const wantX = awayX - w.player.x * 0.4;
  const wantZ = awayZ - w.player.z * 0.4;
  const targetYaw = Math.atan2(-wantX, -wantZ);
  let d = targetYaw - w.player.yaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const dist = Math.hypot(awayX, awayZ);
  return { forward: 1, strafe: 0, sprint: dist < 10, jump: false, turn: 0, lookYaw: Math.max(-0.2, Math.min(0.2, d)), lookPitch: 0 };
}

function run(seed: number, seconds: number) {
  // Endless, so reaching Level 1's goal does not stop the stress run early.
  const w = createWorld({ ...level01, goal: { kind: 'endless' } }, seed);
  w.invulnerable = true;
  const dt = 1 / 60;
  let stuckFor = 0;
  let lastHead = { ...w.snake.cells[0] };
  let maxStuck = 0;
  let broken = 0;
  let peakLength = 0;
  for (let t = 0; t < seconds; t += dt) {
    updateWorld(w, botInput(w), dt);
    const h = w.snake.cells[0];
    if (h.x === lastHead.x && h.z === lastHead.z) stuckFor += dt;
    else stuckFor = 0;
    lastHead = { ...h };
    maxStuck = Math.max(maxStuck, stuckFor);
    // Every segment must touch the one before it.
    for (let i = 1; i < w.snake.cells.length; i++) {
      const a = w.snake.cells[i - 1];
      const b = w.snake.cells[i];
      if (Math.abs(a.x - b.x) + Math.abs(a.z - b.z) !== 1) broken++;
    }
    peakLength = Math.max(peakLength, w.snake.cells.length);
    w.events.length = 0;
  }
  return { w, maxStuck, broken, peakLength };
}

describe('headless bot run', () => {
  it('keeps the simulation healthy for 3 minutes', () => {
    const { w, maxStuck, broken, peakLength } = run(2024, 180);
    expect(Number.isFinite(w.player.x) && Number.isFinite(w.player.z)).toBe(true);
    expect(Math.abs(w.player.x)).toBeLessThanOrEqual(w.grid.half);
    expect(Math.abs(w.player.z)).toBeLessThanOrEqual(w.grid.half);
    // The snake grows while hunting. The bot is invulnerable, so the snake can end up sitting
    // on it and shedding its tail; the peak length shows that growth happened.
    expect(peakLength).toBeGreaterThan(level01.snake.startLength + 8);
    expect(w.snake.cells.length).toBeGreaterThanOrEqual(4);
    expect(w.snake.cells.length).toBeLessThanOrEqual(level01.snake.maxLength);
    // The snake keeps moving: it never sits still on one cell for long.
    expect(maxStuck).toBeLessThan(BALANCE.snake.baseInterval * 6);
    // Its body stays one connected chain.
    expect(broken).toBe(0);
  });

  it('is deterministic: same seed, same final state', () => {
    const a = run(77, 20).w;
    const b = run(77, 20).w;
    expect(a.player).toEqual(b.player);
    expect(a.snake.cells).toEqual(b.snake.cells);
    expect(a.pelletsCollected).toBe(b.pelletsCollected);
  });
});

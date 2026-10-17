import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { level01 } from '../src/levels/level01';
import { cellToWorld } from '../src/sim/grid';
import { NO_INPUT } from '../src/sim/player';
import { createWorld, drainEvents, updateWorld } from '../src/sim/world';
import type { World } from '../src/sim/types';

/** Put the player on the snake's head so the next update counts as a catch. */
function getCaught(w: World): void {
  const head = w.snakes[0].pos[0];
  w.player.x = head.x;
  w.player.z = head.z;
  updateWorld(w, NO_INPUT, 0.016);
}

/** Let the respawn grace run out without the snake reaching the player. */
function waitOutGrace(w: World): void {
  w.graceTimer = 0;
}

describe('lives', () => {
  it('a level starts with the configured lives and the player on the start point', () => {
    const w = createWorld(level01, 1);
    expect(w.lives).toBe(BALANCE.lives.perLevel);
    expect(w.player.x).toBeCloseTo(cellToWorld(w.grid, level01.start.x));
    expect(w.player.z).toBeCloseTo(cellToWorld(w.grid, level01.start.z));
  });

  it('a catch costs one life and respawns the player at the start point', () => {
    const w = createWorld(level01, 2);
    w.player.stamina = 0.2;
    getCaught(w);
    expect(w.status).toBe('playing');
    expect(w.lives).toBe(BALANCE.lives.perLevel - 1);
    expect(w.player.x).toBeCloseTo(cellToWorld(w.grid, level01.start.x));
    expect(w.player.z).toBeCloseTo(cellToWorld(w.grid, level01.start.z));
    expect(w.player.stamina).toBe(1);
    const lost = drainEvents(w).filter((e) => e.type === 'lifeLost');
    expect(lost).toEqual([{ type: 'lifeLost', cause: 'caught', livesLeft: BALANCE.lives.perLevel - 1 }]);
  });

  it('the snake stays as it was when the player respawns', () => {
    const w = createWorld(level01, 3);
    for (let i = 0; i < 30; i++) updateWorld(w, NO_INPUT, 0.05);
    const cells = w.snakes[0].cells.map((c) => ({ ...c }));
    const elapsed = w.elapsed;
    const head = w.snakes[0].pos[0];
    w.player.x = head.x;
    w.player.z = head.z;
    updateWorld(w, NO_INPUT, 0);
    expect(w.lives).toBe(BALANCE.lives.perLevel - 1);
    expect(w.snakes[0].cells).toEqual(cells);
    // Progress toward a survive goal is kept.
    expect(w.elapsed).toBe(elapsed);
  });

  it('after a respawn the player cannot be caught again until the grace runs out', () => {
    const w = createWorld(level01, 4);
    getCaught(w);
    expect(w.graceTimer).toBeCloseTo(BALANCE.lives.respawnGrace);
    getCaught(w);
    expect(w.lives).toBe(BALANCE.lives.perLevel - 1);
    waitOutGrace(w);
    getCaught(w);
    expect(w.lives).toBe(BALANCE.lives.perLevel - 2);
  });

  it('losing the last life ends the run', () => {
    const w = createWorld(level01, 5);
    for (let i = 0; i < BALANCE.lives.perLevel; i++) {
      waitOutGrace(w);
      getCaught(w);
    }
    expect(w.lives).toBe(0);
    expect(w.status).toBe('dead');
    expect(w.deathCause).toBe('caught');
    expect(drainEvents(w).filter((e) => e.type === 'died')).toHaveLength(1);
  });

  it('god mode never loses a life', () => {
    const w = createWorld(level01, 6);
    w.invulnerable = true;
    getCaught(w);
    expect(w.lives).toBe(BALANCE.lives.perLevel);
  });
});

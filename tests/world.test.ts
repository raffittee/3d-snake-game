import { describe, expect, it } from 'vitest';
import { level01 } from '../src/levels/level01';
import { BALANCE } from '../src/config/balance';
import { NO_INPUT } from '../src/sim/player';
import { cellToWorld } from '../src/sim/grid';
import { landmarkCells } from '../src/sim/pillars';
import { createWorld, dangerLevel, drainEvents, scoreOf, updateWorld } from '../src/sim/world';

describe('createWorld', () => {
  it('builds the same arena for the same seed', () => {
    const a = createWorld(level01, 99);
    const b = createWorld(level01, 99);
    expect(Array.from(a.pillars)).toEqual(Array.from(b.pillars));
    expect(a.pellets).toEqual(b.pellets);
  });

  it('places pillars apart from each other and clear of both spawns', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const w = createWorld(level01, seed);
      const n = w.grid.size;
      // Random pillars only; landmark footprints have their own tests (landmarks.test.ts).
      const landmark = new Set(level01.landmarks.flatMap(landmarkCells).map((c) => c.z * n + c.x));
      const cells: Array<[number, number]> = [];
      for (let i = 0; i < w.pillars.length; i++) if (w.pillars[i] && !landmark.has(i)) cells.push([i % n, (i / n) | 0]);
      expect(cells.length).toBeGreaterThan(0);
      expect(cells.length).toBeLessThanOrEqual(level01.pillarCount);
      for (const [x, z] of cells) {
        expect(x >= 2 && z >= 2 && x < n - 2 && z < n - 2).toBe(true);
        expect(z <= level01.snake.spawn.z + 3 && x <= level01.snake.spawn.x + 4).toBe(false);
        expect(Math.abs(x - level01.start.x) <= 2 && Math.abs(z - level01.start.z) <= 2).toBe(false);
        for (const [ox, oz] of cells) if (ox !== x || oz !== z) expect(Math.abs(ox - x) > 1 || Math.abs(oz - z) > 1).toBe(true);
      }
    }
  });

  it('spawns pellets away from the player, the snake and pillars', () => {
    const w = createWorld(level01, 3);
    expect(w.pellets).toHaveLength(level01.pelletCount);
    for (const p of w.pellets) {
      expect(w.pillars[p.z * w.grid.size + p.x]).toBe(0);
      expect(Math.hypot(cellToWorld(w.grid, p.x) - w.player.x, cellToWorld(w.grid, p.z) - w.player.z)).toBeGreaterThanOrEqual(BALANCE.pellets.minSpawnDistance);
    }
  });

  it('faces the player toward the snake', () => {
    const w = createWorld(level01, 3);
    const head = w.snakes[0].pos[0];
    const fx = -Math.sin(w.player.yaw);
    const fz = -Math.cos(w.player.yaw);
    const dx = head.x - w.player.x;
    const dz = head.z - w.player.z;
    const cos = (fx * dx + fz * dz) / Math.hypot(dx, dz);
    expect(cos).toBeGreaterThan(0.99);
  });
});

describe('updateWorld', () => {
  it('kills the player on their last life when the snake head reaches them', () => {
    const w = createWorld(level01, 4);
    w.lives = 1;
    const head = w.snakes[0].pos[0];
    w.player.x = head.x;
    w.player.z = head.z;
    updateWorld(w, NO_INPUT, 0.016);
    expect(w.status).toBe('dead');
    expect(w.deathCause).toBe('caught');
    expect(drainEvents(w).some((e) => e.type === 'died')).toBe(true);
  });

  it('does not kill an invulnerable player', () => {
    const w = createWorld(level01, 4);
    w.invulnerable = true;
    const head = w.snakes[0].pos[0];
    w.player.x = head.x;
    w.player.z = head.z;
    updateWorld(w, NO_INPUT, 0.016);
    expect(w.status).toBe('playing');
  });

  it('collects a pellet the player walks onto, scores it, and replaces it', () => {
    const w = createWorld(level01, 6);
    w.invulnerable = true;
    const p = w.pellets[0];
    w.player.x = cellToWorld(w.grid, p.x);
    w.player.z = cellToWorld(w.grid, p.z);
    updateWorld(w, NO_INPUT, 0.016);
    expect(w.pelletsCollected).toBe(1);
    expect(w.pellets).toHaveLength(level01.pelletCount);
    expect(scoreOf(w)).toBeGreaterThanOrEqual(BALANCE.pellets.points);
  });

  it('speeds the snake up over time, down to the minimum interval', () => {
    const w = createWorld(level01, 8);
    w.invulnerable = true;
    updateWorld(w, NO_INPUT, 0.016);
    const early = w.snakes[0].interval;
    w.elapsed = 1000;
    updateWorld(w, NO_INPUT, 0.016);
    expect(w.snakes[0].interval).toBeLessThan(early);
    expect(w.snakes[0].interval).toBe(level01.snake.minInterval);
  });

  it('adds a segment every growEverySeconds', () => {
    const w = createWorld(level01, 8);
    w.invulnerable = true;
    // Park the player far away so nothing else interferes, then run 8 seconds.
    for (let t = 0; t < 8; t += 0.05) updateWorld(w, NO_INPUT, 0.05);
    expect(w.snakes[0].cells.length + w.snakes[0].pendingGrow).toBeGreaterThanOrEqual(level01.snake.startLength + 1);
  });
});

describe('dangerLevel', () => {
  it('is 1 when touching and 0 when far', () => {
    expect(dangerLevel(0)).toBe(1);
    expect(dangerLevel(50)).toBe(0);
  });
});

describe('level 1 layout', () => {
  it('is a 48x48 arena with the start point inside it', () => {
    expect(level01.size).toBe(48);
    const w = createWorld(level01, 1);
    expect(w.grid.size).toBe(48);
    expect(level01.start.x).toBeGreaterThan(0);
    expect(level01.start.x).toBeLessThan(47);
    expect(level01.start.z).toBeGreaterThan(0);
    expect(level01.start.z).toBeLessThan(47);
  });
});

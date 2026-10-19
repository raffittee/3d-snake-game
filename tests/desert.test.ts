import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { level07 } from '../src/levels/level07';
import { LEVELS } from '../src/levels';
import { guideLines } from '../src/levels/guide';
import { cutSnake } from '../src/sim/cut';
import { cellToWorld, worldToCell } from '../src/sim/grid';
import { makeHeld } from '../src/sim/items';
import { NO_INPUT } from '../src/sim/player';
import { probeAt } from '../src/sim/probe';
import { makeSnake } from '../src/sim/snake';
import { Tile } from '../src/sim/tiles';
import { stormAt } from '../src/sim/weather';
import { createWorld, drainEvents, updateWorld } from '../src/sim/world';
import type { Cell, SimEvent, World } from '../src/sim/types';

const DT = 1 / 30;

/** Level 7 on an empty field: no rocks, no drops; one snake on `cells` (head first). */
function field(cells?: Cell[], seed = 3): World {
  const w = createWorld(level07, seed);
  w.invulnerable = true;
  w.dropTimer = 1e9;
  w.pillars.fill(0);
  w.tiles.fill(Tile.Open);
  w.pellets = [];
  if (cells) w.snakes = [makeSnake(w, 1, cells)];
  return w;
}

function line(head: Cell, length = 7): Cell[] {
  return Array.from({ length }, (_, i) => ({ x: head.x - i, z: head.z }));
}

function putPlayer(w: World, c: Cell): void {
  w.player.x = cellToWorld(w.grid, c.x);
  w.player.z = cellToWorld(w.grid, c.z);
}

function run(w: World, seconds: number, each?: (e: SimEvent[]) => void): void {
  for (let t = 0; t < seconds; t += DT) {
    updateWorld(w, NO_INPUT, DT);
    each?.(drainEvents(w));
  }
}

describe('desert layout', () => {
  it('is Level 7: 64x64 open sand with rocks; 3 flasks far from the start and from each other', () => {
    expect(LEVELS[6]).toBe(level07);
    for (let seed = 1; seed <= 8; seed++) {
      const w = createWorld(level07, seed);
      expect(w.grid.size).toBe(64);
      expect(Array.from(w.tiles).every((t) => t === Tile.Open)).toBe(true);
      expect(w.relics).toHaveLength(3);
      for (const r of w.relics) expect(Math.hypot(r.x - level07.start.x, r.z - level07.start.z)).toBeGreaterThanOrEqual(18);
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(Math.hypot(w.relics[i].x - w.relics[j].x, w.relics[i].z - w.relics[j].z)).toBeGreaterThanOrEqual(10);
    }
  });

  it('flasks, then the oasis', () => {
    const w = field();
    w.snakes[0].stunTimer = 1e9;
    expect(guideLines(w).progress).toBe('Flasks 0/3');
    for (const r of [...w.relics]) {
      putPlayer(w, r);
      updateWorld(w, NO_INPUT, DT);
    }
    expect(guideLines(w).progress).toBe('Reach the oasis');
    putPlayer(w, w.gate);
    updateWorld(w, NO_INPUT, DT);
    expect(w.status).toBe('complete');
  });
});

describe('sandstorms', () => {
  const s = level07.storm!;
  it('blow in waves: nothing before the first, full in the middle, ramping at the edges', () => {
    expect(stormAt(level07, s.first - 1)).toBe(0);
    expect(stormAt(level07, s.first + s.ramp / 2)).toBeCloseTo(0.5, 5);
    expect(stormAt(level07, s.first + s.length / 2)).toBe(1);
    expect(stormAt(level07, s.first + s.length + 1)).toBe(0);
    expect(stormAt(level07, s.first + s.every + s.length / 2)).toBe(1);
  });

  it('the wind rises a few seconds before each wave, once per wave', () => {
    const w = field();
    w.snakes[0].stunTimer = 1e9;
    const at: number[] = [];
    run(w, s.first + s.every + 1, (ev) => {
      if (ev.some((e) => e.type === 'stormWarning')) at.push(w.elapsed);
    });
    expect(at).toHaveLength(2);
    expect(at[0]).toBeCloseTo(s.first - s.warn, 1);
    expect(at[1]).toBeCloseTo(s.first + s.every - s.warn, 1);
  });
});

describe('burrow', () => {
  it('dives after its cooldown when you are far; underground it cannot touch you and stones pass over it', () => {
    const w = field(line({ x: 12, z: 30 }));
    putPlayer(w, { x: 50, z: 30 });
    let dove = false;
    run(w, BALANCE.ai.burrowCooldown + 0.2, (ev) => {
      if (ev.some((e) => e.type === 'snakeBurrowed')) dove = true;
    });
    expect(dove).toBe(true);
    const snake = w.snakes[0];
    expect(snake.burrow.mode).toBe('down');
    // Let it travel: its head and front go under.
    run(w, 1.2);
    expect(snake.under[0]).toBe(true);
    const h = snake.pos[0];
    expect(probeAt(w, h.x, 1, h.z, 0.1)).toBeNull();
    // Stand right on its head: nothing happens.
    w.invulnerable = false;
    w.player.x = h.x;
    w.player.z = h.z;
    const lives = w.player.lives;
    updateWorld(w, NO_INPUT, DT);
    expect(w.player.lives).toBe(lives);
  });

  it('comes up close to you after the sand heaves for a second, and is solid again', () => {
    const w = field(line({ x: 12, z: 30 }));
    putPlayer(w, { x: 40, z: 30 });
    // Cooldown already spent: it dives at once (28 cells away), rather than chasing on the surface first.
    w.snakes[0].burrow.t = BALANCE.ai.burrowCooldown;
    let risingAt: Cell | null = null;
    let gap = Infinity;
    let surfaced = false;
    let heldStill = true;
    run(w, BALANCE.ai.burrowMaxSeconds + 3, (ev) => {
      const s = w.snakes[0];
      if (ev.some((e) => e.type === 'snakeRising')) {
        risingAt = { ...s.cells[0] };
        gap = Math.hypot(risingAt.x - worldToCell(w.grid, w.player.x), risingAt.z - worldToCell(w.grid, w.player.z));
      }
      if (risingAt && !surfaced && (s.cells[0].x !== risingAt.x || s.cells[0].z !== risingAt.z)) heldStill = false;
      if (ev.some((e) => e.type === 'snakeSurfaced')) surfaced = true;
    });
    expect(risingAt).not.toBeNull();
    expect(gap).toBeLessThanOrEqual(BALANCE.ai.burrowSurfaceCells);
    expect(heldStill).toBe(true);
    expect(surfaced).toBe(true);
    expect(w.snakes[0].under[0]).toBe(false);
  });

  it('a cut keeps each piece knowing which of its segments are underground', () => {
    const w = field(line({ x: 30, z: 30 }, 12));
    const s = w.snakes[0];
    s.under = s.cells.map((_, i) => i >= 8);
    expect(cutSnake(w, s, 5)).toBe('split');
    expect(s.under).toEqual([false, false, false, false, false]);
    expect(w.snakes[1].under).toEqual([false, false, true, true, true, true]);
  });
});

describe('mongoose', () => {
  it('runs to the snake, pins it for 10 s, then leaves', () => {
    const w = field(line({ x: 30, z: 30 }));
    putPlayer(w, { x: 40, z: 30 });
    w.player.yaw = Math.PI / 2;
    w.player.inventory[0] = makeHeld('mongoose', 'white');
    w.player.selectedSlot = 0;
    updateWorld(w, { ...NO_INPUT, useItem: true }, DT);
    expect(drainEvents(w).some((e) => e.type === 'mongooseReleased')).toBe(true);
    expect(w.mongooses).toHaveLength(1);
    let fought = false;
    run(w, 2, (ev) => {
      if (ev.some((e) => e.type === 'mongooseFight')) fought = true;
    });
    expect(fought).toBe(true);
    const head = { ...w.snakes[0].cells[0] };
    run(w, 6);
    expect(w.snakes[0].cells[0]).toEqual(head);
    let gone = false;
    run(w, 3, (ev) => {
      if (ev.some((e) => e.type === 'mongooseGone')) gone = true;
    });
    expect(gone).toBe(true);
    expect(w.mongooses).toHaveLength(0);
    run(w, 2);
    expect(w.snakes[0].cells[0]).not.toEqual(head);
  });

  it('cannot reach a snake under the sand: it waits by you', () => {
    const w = field(line({ x: 30, z: 30 }));
    const s = w.snakes[0];
    s.under = s.cells.map(() => true);
    s.burrow = { mode: 'down', t: 0 };
    s.stunTimer = 1e9;
    putPlayer(w, { x: 10, z: 10 });
    w.player.inventory[0] = makeHeld('mongoose', 'white');
    w.player.selectedSlot = 0;
    updateWorld(w, { ...NO_INPUT, useItem: true }, DT);
    run(w, 2);
    const m = w.mongooses[0];
    expect(m.targetId).toBeNull();
    expect(Math.hypot(m.x - w.player.x, m.z - w.player.z)).toBeLessThan(3);
  });
});

import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { BEHAVIORS } from '../src/ai';
import { level10 } from '../src/levels/level10';
import { LEVELS } from '../src/levels';
import { guideLines } from '../src/levels/guide';
import { cutSnake } from '../src/sim/cut';
import { cellToWorld } from '../src/sim/grid';
import { makeHeld } from '../src/sim/items';
import { NO_INPUT } from '../src/sim/player';
import { makeSnake } from '../src/sim/snake';
import { Tile } from '../src/sim/tiles';
import { createWorld, drainEvents, updateWorld } from '../src/sim/world';
import type { Cell, SimEvent, World } from '../src/sim/types';

const DT = 1 / 30;

/** An open cave floor (no rock, no drops) with the Mother on `cells` (head first), frozen unless told. */
function hall(cells: Cell[], seed = 2): World {
  const w = createWorld(level10, seed);
  w.invulnerable = true;
  w.dropTimer = 1e9;
  w.tiles.fill(Tile.Open);
  w.pellets = [];
  w.snakes = [makeSnake(w, 1, cells)];
  w.snakes[0].stunTimer = 1e9;
  return w;
}

const line = (head: Cell, length: number): Cell[] => Array.from({ length }, (_, i) => ({ x: head.x - i, z: head.z }));

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

describe('dark cave layout', () => {
  it('is Level 10, the last: 64x64, one connected cave, the Mother 30 long and beatable', () => {
    expect(LEVELS[9]).toBe(level10);
    expect(LEVELS).toHaveLength(10);
    for (let seed = 1; seed <= 6; seed++) {
      const w = createWorld(level10, seed);
      const n = w.grid.size;
      expect(w.snakes[0].cells).toHaveLength(30);
      const rock = Array.from(w.tiles).filter((t) => t === Tile.CaveWall).length / w.tiles.length;
      expect(rock).toBeGreaterThan(0.3);
      expect(rock).toBeLessThan(0.75);
      // Every open cell can be walked to from the start; so can the snake's head.
      const seen = new Set<number>([level10.start.z * n + level10.start.x]);
      const q = [level10.start.z * n + level10.start.x];
      for (let h = 0; h < q.length; h++) {
        const x = q[h] % n;
        const z = (q[h] / n) | 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = (z + dz) * n + x + dx;
          if (w.tiles[ni] !== Tile.Open || seen.has(ni)) continue;
          seen.add(ni);
          q.push(ni);
        }
      }
      for (let i = 0; i < n * n; i++) if (w.tiles[i] === Tile.Open) expect(seen.has(i)).toBe(true);
      const h = w.snakes[0].cells[0];
      expect(seen.has(h.z * n + h.x)).toBe(true);
    }
  });
});

describe('the flashlight', () => {
  it('starts with 90 s of battery, runs out, and a battery adds 60 s', () => {
    const w = hall(line({ x: 40, z: 10 }, 30));
    expect(w.player.battery).toBe(BALANCE.cave.batteryStart);
    w.player.battery = 0.5;
    let dead = false;
    run(w, 1, (ev) => {
      if (ev.some((e) => e.type === 'batteryDead')) dead = true;
    });
    expect(dead).toBe(true);
    expect(w.player.battery).toBe(0);
    w.player.inventory[0] = makeHeld('battery', 'white');
    w.player.selectedSlot = 0;
    updateWorld(w, { ...NO_INPUT, useItem: true }, DT);
    expect(w.player.battery).toBeCloseTo(BALANCE.items.defs.battery.seconds, 0);
  });

  it('keeps its charge when you lose a life', () => {
    const w = hall(line({ x: 40, z: 10 }, 30));
    w.player.battery = 42;
    w.invulnerable = false;
    const s = w.snakes[0];
    w.player.x = s.pos[0].x;
    w.player.z = s.pos[0].z;
    updateWorld(w, NO_INPUT, DT);
    expect(w.player.lives).toBe(BALANCE.lives.perLevel - 1);
    expect(w.player.battery).toBeGreaterThan(41);
  });
});

describe('the Mother Snake', () => {
  it('phase 1: cut-off pieces wither, they never become snakes', () => {
    const w = hall(line({ x: 40, z: 20 }, 30));
    expect(w.bossPhase).toBe(1);
    expect(guideLines(w).progress).toBe('The Mother: length 30');
    expect(cutSnake(w, w.snakes[0], 25)).toBe('shrunk');
    expect(w.snakes).toHaveLength(1);
    expect(w.snakes[0].cells).toHaveLength(25);
  });

  it('at half her length she splits in two (phase 2); when one is left it coils (phase 3)', () => {
    const w = hall(line({ x: 40, z: 20 }, 30));
    putPlayer(w, { x: 40, z: 50 });
    cutSnake(w, w.snakes[0], 14);
    const phases: number[] = [];
    run(w, 0.1, (ev) => ev.forEach((e) => e.type === 'bossPhase' && phases.push(e.phase)));
    expect(phases).toEqual([2]);
    expect(w.snakes).toHaveLength(2);
    expect(w.snakes.map((s) => s.cells.length)).toEqual([7, 7]);
    expect(guideLines(w).progress).toBe('Split in two: 7 and 7');
    // Beat one of them: the other coils.
    w.snakes.splice(1, 1);
    run(w, 0.1, (ev) => ev.forEach((e) => e.type === 'bossPhase' && phases.push(e.phase)));
    expect(phases).toEqual([2, 3]);
    expect(guideLines(w).progress).toBe('It coils: cut your way out (7)');
  });

  it('a cut too deep to split goes straight to the last stand', () => {
    const w = hall(line({ x: 40, z: 20 }, 30));
    putPlayer(w, { x: 40, z: 50 });
    cutSnake(w, w.snakes[0], 6);
    run(w, 0.1);
    expect(w.bossPhase).toBe(3);
    expect(w.snakes).toHaveLength(1);
  });
});

describe('coil', () => {
  it('circles you on a ring and pulls it in while close (not while stunned)', () => {
    const w = hall(line({ x: 30, z: 30 }, 12));
    w.bossPhase = 3;
    putPlayer(w, { x: 30, z: 35 });
    const s = w.snakes[0];
    const t = BEHAVIORS.coil(w, s);
    const r = Math.hypot(t.x - 30, t.z - 35);
    expect(r).toBeGreaterThan(BALANCE.ai.coilStartRadius - 1.5);
    expect(r).toBeLessThan(BALANCE.ai.coilStartRadius + 1.5);
    // Stunned: the ring holds. Free: it tightens down to the minimum.
    run(w, 2);
    expect(s.coil).toBe(BALANCE.ai.coilStartRadius);
    s.stunTimer = 0;
    w.player.x = cellToWorld(w.grid, 30);
    let smallest = Infinity;
    run(w, 20, () => {
      smallest = Math.min(smallest, s.coil);
      putPlayer(w, { x: 30, z: 35 });
    });
    expect(smallest).toBe(BALANCE.ai.coilMinRadius);
  });

  it('far away it just closes in', () => {
    const w = hall(line({ x: 10, z: 10 }, 12));
    putPlayer(w, { x: 40, z: 40 });
    expect(BEHAVIORS.coil(w, w.snakes[0])).toEqual({ x: 40, z: 40 });
  });

  it('beating every snake wins the run', () => {
    const w = hall(line({ x: 30, z: 30 }, 12));
    w.snakes = [];
    updateWorld(w, NO_INPUT, DT);
    expect(w.status).toBe('complete');
  });
});

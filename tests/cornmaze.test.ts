import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { BEHAVIORS } from '../src/ai';
import { level05 } from '../src/levels/level05';
import { LEVELS } from '../src/levels';
import { guideLines } from '../src/levels/guide';
import { goalMet } from '../src/sim/goals';
import { cellToWorld, worldToCell } from '../src/sim/grid';
import { makeHeld } from '../src/sim/items';
import { NO_INPUT } from '../src/sim/player';
import { probeAt } from '../src/sim/probe';
import { makeSnake } from '../src/sim/snake';
import { Tile } from '../src/sim/tiles';
import { createWorld, drainEvents, updateWorld } from '../src/sim/world';
import type { Cell, World } from '../src/sim/types';

const DT = 1 / 30;
const tileAt = (w: World, c: Cell) => w.tiles[c.z * w.grid.size + c.x];

/** Walking distances from the start over cells you can stand on (no corn, no pillars). */
function walk(w: World): Int32Array {
  const n = w.grid.size;
  const dist = new Int32Array(n * n).fill(-1);
  const q = [w.level.start.z * n + w.level.start.x];
  dist[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const id = q[h];
    const x = id % n;
    const z = (id / n) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      const nid = nz * n + nx;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n || dist[nid] >= 0 || w.pillars[nid] || w.tiles[nid] === Tile.Corn) continue;
      dist[nid] = dist[id] + 1;
      q.push(nid);
    }
  }
  return dist;
}

function quiet(seed = 4): World {
  const w = createWorld(level05, seed);
  w.invulnerable = true;
  w.dropTimer = 1e9;
  for (const s of w.snakes) s.stunTimer = 1e9;
  return w;
}

function putPlayer(w: World, c: Cell): void {
  w.player.x = cellToWorld(w.grid, c.x);
  w.player.z = cellToWorld(w.grid, c.z);
}

describe('corn maze layout', () => {
  it('is Level 5: 64x64, corn walls around 2-cell corridors, two snakes', () => {
    expect(LEVELS[4]).toBe(level05);
    for (let seed = 1; seed <= 6; seed++) {
      const w = createWorld(level05, seed);
      expect(w.grid.size).toBe(64);
      const corn = Array.from(w.tiles).filter((t) => t === Tile.Corn).length / w.tiles.length;
      expect(corn).toBeGreaterThan(0.3);
      expect(corn).toBeLessThan(0.65);
      expect(w.snakes).toHaveLength(2);
      for (const s of w.snakes) for (const c of s.cells) expect(tileAt(w, c)).toBe(Tile.Open);
    }
  });

  it('you can walk from the start to the map and from there to the exit; the map is far away', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const w = createWorld(level05, seed);
      expect(w.relics).toHaveLength(1);
      const dist = walk(w);
      const n = w.grid.size;
      const map = w.relics[0];
      expect(dist[map.z * n + map.x]).toBeGreaterThan(40);
      expect(dist[w.gate.z * n + w.gate.x]).toBeGreaterThan(0);
      for (const s of w.snakes) expect(dist[s.cells[0].z * n + s.cells[0].x]).toBeGreaterThan(0);
    }
  });

  it('has loops: more openings than a maze with only dead ends', () => {
    const w = createWorld(level05, 3);
    const n = w.grid.size;
    let gaps = 0;
    const rooms = Math.floor((n - 1) / 3);
    for (let j = 0; j < rooms; j++) {
      for (let i = 0; i < rooms; i++) {
        if (i + 1 < rooms && w.tiles[(3 * j + 1) * n + 3 * (i + 1)] !== Tile.Corn) gaps++;
        if (j + 1 < rooms && w.tiles[3 * (j + 1) * n + 3 * i + 1] !== Tile.Corn) gaps++;
      }
    }
    // A tree over rooms x rooms has rooms^2 - 1 openings.
    expect(gaps).toBeGreaterThan(rooms * rooms - 1 + 20);
  });

  it('is the same maze for the same seed', () => {
    expect(Array.from(createWorld(level05, 8).tiles)).toEqual(Array.from(createWorld(level05, 8).tiles));
  });

  it('corn stops you and stones', () => {
    const w = quiet();
    const n = w.grid.size;
    let corn: Cell | null = null;
    for (let i = 0; i < n * n && !corn; i++) {
      const x = i % n;
      const z = (i / n) | 0;
      if (x > 2 && x < n - 3 && w.tiles[i] === Tile.Corn && w.tiles[z * n + x + 1] === Tile.Open) corn = { x, z };
    }
    expect(corn).not.toBeNull();
    const c = corn as Cell;
    expect(probeAt(w, cellToWorld(w.grid, c.x), 2, cellToWorld(w.grid, c.z), 0.1)?.kind).toBe('solid');
    // Walk west into it: you stop at its edge.
    putPlayer(w, { x: c.x + 1, z: c.z });
    w.player.yaw = Math.PI / 2;
    for (let t = 0; t < 1.5; t += DT) updateWorld(w, { ...NO_INPUT, forward: 1 }, DT);
    expect(worldToCell(w.grid, w.player.x)).toBe(c.x + 1);
  });
});

describe('the map and the exit', () => {
  it('the exit does not count before the map; the map opens it and the minimap', () => {
    const w = quiet();
    putPlayer(w, w.gate);
    updateWorld(w, NO_INPUT, DT);
    expect(goalMet(w.level.goal, w)).toBe(false);
    expect(w.status).toBe('playing');
    expect(guideLines(w).progress).toBe('Map not found');

    putPlayer(w, w.relics[0]);
    updateWorld(w, NO_INPUT, DT);
    const events = drainEvents(w);
    expect(events.some((e) => e.type === 'mapFound')).toBe(true);
    expect(events.some((e) => e.type === 'gateOpened')).toBe(true);
    expect(w.relicsFound).toBe(1);
    expect(guideLines(w).progress).toBe('Map found: reach the exit');

    putPlayer(w, w.gate);
    updateWorld(w, NO_INPUT, DT);
    expect(w.status).toBe('complete');
  });
});

describe('flank', () => {
  /** An open field: no corn, no pillars, the two snakes far apart. */
  function field(): World {
    const w = quiet();
    w.tiles.fill(Tile.Open);
    w.pillars.fill(0);
    return w;
  }

  it('the first snake chases; the second heads for where you are running', () => {
    const w = field();
    putPlayer(w, { x: 30, z: 30 });
    w.player.vx = BALANCE.player.walkSpeed;
    w.player.vz = 0;
    const [lead, wing] = w.snakes;
    expect(BEHAVIORS.flank(w, lead)).toEqual({ x: 30, z: 30 });
    const t = BEHAVIORS.flank(w, wing);
    expect(t.x).toBe(30 + BALANCE.ai.flankAheadCells);
    expect(t.z).toBe(30);
  });

  it('standing still, the second snake goes round to your far side from the chaser', () => {
    const w = field();
    putPlayer(w, { x: 30, z: 30 });
    const [lead, wing] = w.snakes;
    lead.cells = [{ x: 20, z: 30 }, { x: 19, z: 30 }];
    const t = BEHAVIORS.flank(w, wing);
    expect(t.x).toBeGreaterThan(30);
    expect(t.z).toBe(30);
  });

  it('the spot ahead is pulled back to a cell it can reach (not into corn)', () => {
    const w = field();
    const n = w.grid.size;
    for (let z = 0; z < n; z++) for (let x = 33; x < 40; x++) w.tiles[z * n + x] = Tile.Corn;
    putPlayer(w, { x: 30, z: 30 });
    w.player.vx = BALANCE.player.walkSpeed;
    const t = BEHAVIORS.flank(w, w.snakes[1]);
    expect(t.x).toBeLessThan(33);
  });

  it('close to you, or alone, it just chases', () => {
    const w = field();
    putPlayer(w, { x: 30, z: 30 });
    w.player.vx = BALANCE.player.walkSpeed;
    w.snakes[1].cells = [{ x: 31, z: 31 }, { x: 31, z: 32 }];
    expect(BEHAVIORS.flank(w, w.snakes[1])).toEqual({ x: 30, z: 30 });
    w.snakes = [makeSnake(w, 9, [{ x: 10, z: 10 }, { x: 9, z: 10 }])];
    expect(BEHAVIORS.flank(w, w.snakes[0])).toEqual({ x: 30, z: 30 });
  });
});

describe('smoke bomb', () => {
  it('every snake loses track of you for 6 s and wanders off toward a spot far from you', () => {
    const w = quiet();
    putPlayer(w, { x: 31, z: 58 });
    w.inventory[0] = makeHeld('smokeBomb', 'white');
    w.selectedSlot = 0;
    updateWorld(w, { ...NO_INPUT, useItem: true }, DT);
    const events = drainEvents(w);
    expect(events.some((e) => e.type === 'smokeBomb')).toBe(true);
    expect(w.inventory[0]).toBeNull();
    expect(w.smokes).toHaveLength(1);
    for (const s of w.snakes) {
      expect(s.lure).not.toBeNull();
      expect(s.lure!.time).toBeCloseTo(BALANCE.items.defs.smokeBomb.seconds, 1);
      expect(Math.hypot(s.lure!.x - 31, s.lure!.z - 58)).toBeGreaterThanOrEqual(BALANCE.items.defs.smokeBomb.wanderMinCells);
      expect(tileAt(w, s.lure!)).not.toBe(Tile.Corn);
    }
    for (let t = 0; t < 6.2; t += DT) updateWorld(w, NO_INPUT, DT);
    for (const s of w.snakes) expect(s.lure).toBeNull();
    expect(w.smokes).toHaveLength(0);
  });
});

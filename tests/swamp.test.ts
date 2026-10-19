import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { level06 } from '../src/levels/level06';
import { LEVELS } from '../src/levels';
import { guideLines } from '../src/levels/guide';
import { cellToWorld } from '../src/sim/grid';
import { makeHeld } from '../src/sim/items';
import { NO_INPUT } from '../src/sim/player';
import { Tile } from '../src/sim/tiles';
import { createWorld, drainEvents, updateWorld } from '../src/sim/world';
import type { Cell, World } from '../src/sim/types';

const DT = 1 / 30;
const tileAt = (w: World, c: Cell) => w.tiles[c.z * w.grid.size + c.x];
const firm = (t: number) => t === Tile.Open || t === Tile.Log || t === Tile.Pad;

function quiet(seed = 4): World {
  const w = createWorld(level06, seed);
  w.invulnerable = true;
  w.dropTimer = 1e9;
  for (const s of w.snakes) s.stunTimer = 1e9;
  return w;
}

function putPlayer(w: World, c: Cell): void {
  w.player.x = cellToWorld(w.grid, c.x);
  w.player.z = cellToWorld(w.grid, c.z);
}

/** Cells reachable from the start without setting foot in the mud. */
function dryWalk(w: World): Set<number> {
  const n = w.grid.size;
  const seen = new Set<number>([w.level.start.z * n + w.level.start.x]);
  const q: Cell[] = [w.level.start];
  while (q.length) {
    const c = q.shift() as Cell;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c.x + dx;
      const z = c.z + dz;
      const i = z * n + x;
      if (x < 0 || z < 0 || x >= n || z >= n || seen.has(i) || w.pillars[i] || !firm(w.tiles[i])) continue;
      seen.add(i);
      q.push({ x, z });
    }
  }
  return seen;
}

/** Walk straight east for `seconds` from cell `c` over the given tile; returns the distance covered. */
function walkOver(tile: number, seconds: number, sprint = false): number {
  const w = quiet();
  const n = w.grid.size;
  w.pillars.fill(0);
  for (let z = 28; z <= 32; z++) for (let x = 5; x < n - 5; x++) w.tiles[z * n + x] = tile;
  putPlayer(w, { x: 8, z: 30 });
  w.player.yaw = -Math.PI / 2;
  const x0 = w.player.x;
  for (let t = 0; t < seconds; t += DT) updateWorld(w, { ...NO_INPUT, forward: 1, sprint }, DT);
  return w.player.x - x0;
}

describe('swamp layout', () => {
  it('is Level 6: 64x64, islands in mud, logs and lily pads across it', () => {
    expect(LEVELS[5]).toBe(level06);
    for (let seed = 1; seed <= 6; seed++) {
      const w = createWorld(level06, seed);
      const count = (t: number) => Array.from(w.tiles).filter((v) => v === t).length;
      expect(w.grid.size).toBe(64);
      expect(count(Tile.Mud) / w.tiles.length).toBeGreaterThan(0.4);
      expect(count(Tile.Mud) / w.tiles.length).toBeLessThan(0.7);
      expect(count(Tile.Log) + count(Tile.Pad)).toBeGreaterThan(10);
      expect(tileAt(w, level06.start)).toBe(Tile.Open);
    }
  });

  it('every lantern and the boat can be reached without stepping in the mud', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const w = createWorld(level06, seed);
      const dry = dryWalk(w);
      const n = w.grid.size;
      expect(w.relics).toHaveLength(4);
      for (const r of w.relics) expect(dry.has(r.z * n + r.x)).toBe(true);
      expect(dry.has(w.gate.z * n + w.gate.x)).toBe(true);
    }
  });

  it('the lanterns stand apart and away from the start', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const w = createWorld(level06, seed);
      for (const r of w.relics) expect(Math.hypot(r.x - level06.start.x, r.z - level06.start.z)).toBeGreaterThanOrEqual(16);
      for (let i = 0; i < w.relics.length; i++) {
        for (let j = i + 1; j < w.relics.length; j++) expect(Math.hypot(w.relics[i].x - w.relics[j].x, w.relics[i].z - w.relics[j].z)).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('is the same swamp for the same seed', () => {
    expect(Array.from(createWorld(level06, 2).tiles)).toEqual(Array.from(createWorld(level06, 2).tiles));
  });
});

describe('mud', () => {
  it('halves your speed, walking and sprinting; logs and pads are full speed', () => {
    const open = walkOver(Tile.Open, 1);
    expect(walkOver(Tile.Mud, 1)).toBeCloseTo(open * BALANCE.swamp.mudSpeed, 0);
    expect(walkOver(Tile.Mud, 1, true)).toBeCloseTo(walkOver(Tile.Open, 1, true) * BALANCE.swamp.mudSpeed, 0);
    expect(walkOver(Tile.Log, 1)).toBeCloseTo(open, 0);
    expect(walkOver(Tile.Pad, 1)).toBeCloseTo(open, 0);
  });

  it('the snake moves at full speed in it', () => {
    const w = quiet();
    const s = w.snakes[0];
    s.stunTimer = 0;
    const n = w.grid.size;
    for (const c of s.cells) w.tiles[c.z * n + c.x] = Tile.Mud;
    updateWorld(w, NO_INPUT, DT);
    expect(s.interval).toBeCloseTo(Math.max(level06.snake.minInterval, level06.snake.baseInterval - w.elapsed * level06.snake.rampPerSecond), 6);
  });
});

describe('lanterns and the boat', () => {
  it('each lantern lights and stays standing; the last readies the boat; boarding ends the level', () => {
    const w = quiet();
    const lanterns = w.relics.map((r) => ({ ...r }));
    expect(guideLines(w).progress).toBe('Lanterns 0/4');
    lanterns.forEach((c, i) => {
      putPlayer(w, c);
      updateWorld(w, NO_INPUT, DT);
      expect(w.relicsFound).toBe(i + 1);
    });
    expect(w.relicsTaken).toEqual(lanterns);
    expect(w.gateOpen).toBe(true);
    expect(guideLines(w).progress).toBe('The boat is ready: board it');
    putPlayer(w, w.gate);
    updateWorld(w, NO_INPUT, DT);
    expect(w.status).toBe('complete');
  });
});

describe('energy drink', () => {
  it('fills your stamina and sprinting costs nothing for 5 s, then drains again', () => {
    const w = quiet();
    w.pillars.fill(0);
    w.tiles.fill(Tile.Open);
    putPlayer(w, { x: 10, z: 30 });
    w.player.yaw = -Math.PI / 2;
    w.player.stamina = 0.1;
    w.player.inventory[0] = makeHeld('energyDrink', 'white');
    w.player.selectedSlot = 0;
    updateWorld(w, { ...NO_INPUT, useItem: true }, DT);
    expect(drainEvents(w).some((e) => e.type === 'energyDrink')).toBe(true);
    expect(w.player.stamina).toBe(1);
    for (let t = 0; t < 4.5; t += DT) updateWorld(w, { ...NO_INPUT, forward: 1, sprint: true }, DT);
    expect(w.player.stamina).toBe(1);
    expect(w.player.sprinting).toBe(true);
    for (let t = 0; t < 1.5; t += DT) updateWorld(w, { ...NO_INPUT, forward: 1, sprint: true }, DT);
    expect(w.player.stamina).toBeLessThan(1);
  });
});

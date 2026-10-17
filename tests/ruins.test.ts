import { describe, expect, it } from 'vitest';
import { BEHAVIORS } from '../src/ai';
import { BALANCE } from '../src/config/balance';
import { level02 } from '../src/levels/level02';
import { cellToWorld, worldToCell } from '../src/sim/grid';
import { NO_INPUT } from '../src/sim/player';
import { makeSnake, stepSnake } from '../src/sim/snake';
import { Tile } from '../src/sim/tiles';
import { createWorld, drainEvents, updateWorld } from '../src/sim/world';
import type { Cell, World } from '../src/sim/types';

const at = (w: World, c: Cell) => w.tiles[c.z * w.grid.size + c.x];
const solid = (w: World, c: Cell) => w.pillars[c.z * w.grid.size + c.x] === 1;

/** Cells the player can walk to from the start: low walls can be jumped; crumbling walls and pillars block. */
function reachable(w: World): Set<number> {
  const n = w.grid.size;
  const seen = new Set<number>();
  const q: Cell[] = [w.level.start];
  seen.add(w.level.start.z * n + w.level.start.x);
  while (q.length) {
    const c = q.shift() as Cell;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c.x + dx;
      const z = c.z + dz;
      if (x < 0 || z < 0 || x >= n || z >= n) continue;
      const i = z * n + x;
      if (seen.has(i) || w.pillars[i] || w.tiles[i] === Tile.Crumble) continue;
      seen.add(i);
      q.push({ x, z });
    }
  }
  return seen;
}

describe('ruins layout', () => {
  it('builds the same ruins for the same seed', () => {
    const a = createWorld(level02, 5);
    const b = createWorld(level02, 5);
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
    expect(a.relics).toEqual(b.relics);
  });

  it('has low walls and crumbling walls', () => {
    const w = createWorld(level02, 5);
    const tiles = Array.from(w.tiles);
    expect(tiles.filter((t) => t === Tile.LowWall).length).toBeGreaterThan(20);
    expect(tiles.filter((t) => t === Tile.Crumble).length).toBeGreaterThan(10);
  });

  it('keeps the start, the snake lane and the gate clear', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const w = createWorld(level02, seed);
      const { start, snake } = level02;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) expect(at(w, { x: start.x + dx, z: start.z + dz })).toBe(Tile.Open);
      for (let i = 0; i < snake.startLength + 2; i++) expect(at(w, { x: snake.spawn.x - i, z: snake.spawn.z })).toBe(Tile.Open);
      expect(at(w, w.gate)).toBe(Tile.Open);
      expect(solid(w, w.gate)).toBe(false);
    }
  });

  it('places 5 relics on open ground, and you can walk (and jump) to every relic and to the gate', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const w = createWorld(level02, seed);
      expect(w.relics).toHaveLength(5);
      const ok = reachable(w);
      for (const r of w.relics) {
        expect(at(w, r)).toBe(Tile.Open);
        expect(solid(w, r)).toBe(false);
        expect(ok.has(r.z * w.grid.size + r.x)).toBe(true);
      }
      expect(ok.has(w.gate.z * w.grid.size + w.gate.x)).toBe(true);
    }
  });
});

describe('walls', () => {
  /** A world with one wall tile right north of the player, cleared around. */
  function wallAhead(tile: number): World {
    const w = createWorld(level02, 3);
    w.invulnerable = true;
    w.tiles.fill(Tile.Open);
    w.pillars.fill(0);
    w.snakes[0].stunTimer = 1e9;
    const pc = { x: worldToCell(w.grid, w.player.x), z: worldToCell(w.grid, w.player.z) };
    w.tiles[(pc.z - 2) * w.grid.size + pc.x] = tile;
    w.player.x = cellToWorld(w.grid, pc.x);
    w.player.yaw = 0;
    return w;
  }

  it('a crumbling wall blocks you', () => {
    const w = wallAhead(Tile.Crumble);
    const z0 = w.player.z;
    for (let i = 0; i < 60; i++) updateWorld(w, { ...NO_INPUT, forward: 1 }, 0.05);
    expect(z0 - w.player.z).toBeLessThan(BALANCE.cellSize * 1.5);
  });

  it('a low wall blocks you on foot but you can jump over it', () => {
    const w = wallAhead(Tile.LowWall);
    const z0 = w.player.z;
    for (let i = 0; i < 40; i++) updateWorld(w, { ...NO_INPUT, forward: 1 }, 0.05);
    expect(z0 - w.player.z).toBeLessThan(BALANCE.cellSize * 1.5);
    // Back off, then run and jump.
    w.player.z = z0;
    let jumped = false;
    for (let i = 0; i < 40; i++) {
      const jump = !jumped && z0 - w.player.z > 0.6;
      if (jump) jumped = true;
      updateWorld(w, { ...NO_INPUT, forward: 1, sprint: true, jump }, 0.05);
    }
    expect(z0 - w.player.z).toBeGreaterThan(BALANCE.cellSize * 3);
  });

  it('the snake goes around low walls but smashes through crumbling walls', () => {
    const w = createWorld(level02, 3);
    w.tiles.fill(Tile.Open);
    w.pillars.fill(0);
    const cells: Cell[] = [];
    for (let i = 0; i < 5; i++) cells.push({ x: 20 - i, z: 20 });
    const s = makeSnake(w, 1, cells);
    w.snakes = [s];
    // A crumbling wall right in front of its head, the player straight ahead.
    w.tiles[20 * w.grid.size + 21] = Tile.Crumble;
    stepSnake(w, s, 30, 20, true);
    expect(s.cells[0]).toEqual({ x: 21, z: 20 });
    expect(at(w, { x: 21, z: 20 })).toBe(Tile.Open);
    expect(drainEvents(w).some((e) => e.type === 'wallSmashed')).toBe(true);
    // A low wall in front: it steps around instead.
    w.tiles[20 * w.grid.size + 22] = Tile.LowWall;
    stepSnake(w, s, 30, 20, true);
    expect(s.cells[0]).not.toEqual({ x: 22, z: 20 });
    expect(at(w, { x: 22, z: 20 })).toBe(Tile.LowWall);
  });

  it('stones fly over a low wall and stop at a crumbling one', () => {
    const w = createWorld(level02, 3);
    w.tiles.fill(Tile.Open);
    w.pillars.fill(0);
    w.snakes[0].stunTimer = 1e9;
    const pc = { x: worldToCell(w.grid, w.player.x), z: worldToCell(w.grid, w.player.z) };
    w.player.x = cellToWorld(w.grid, pc.x);
    w.player.yaw = 0;
    w.player.pitch = 0;
    w.tiles[(pc.z - 3) * w.grid.size + pc.x] = Tile.LowWall;
    w.inventory[0] = { item: 'slingshot', tier: 'white', uses: 3, spoilLeft: 40, spoilTotal: 40 };
    updateWorld(w, { ...NO_INPUT, useItem: true }, 0.01);
    for (let i = 0; i < 6; i++) updateWorld(w, NO_INPUT, 0.02);
    expect(w.projectiles).toHaveLength(1);
    w.tiles[(pc.z - 8) * w.grid.size + pc.x] = Tile.Crumble;
    const hits: string[] = [];
    for (let i = 0; i < 60 && w.projectiles.length; i++) {
      updateWorld(w, NO_INPUT, 0.02);
      for (const e of drainEvents(w)) if (e.type === 'shotHit') hits.push(e.target);
    }
    expect(hits).toEqual(['solid']);
  });
});

describe('relics and the gate', () => {
  function walkTo(w: World, c: Cell): void {
    w.player.x = cellToWorld(w.grid, c.x);
    w.player.z = cellToWorld(w.grid, c.z);
    updateWorld(w, NO_INPUT, 0.01);
  }

  it('walking over a relic picks it up', () => {
    const w = createWorld(level02, 4);
    w.invulnerable = true;
    const r = w.relics[0];
    walkTo(w, r);
    expect(w.relicsFound).toBe(1);
    expect(w.relics).toHaveLength(4);
    expect(drainEvents(w).some((e) => e.type === 'relicFound')).toBe(true);
  });

  it('the gate does nothing until all 5 relics are found, then reaching it completes the level', () => {
    const w = createWorld(level02, 4);
    w.invulnerable = true;
    walkTo(w, w.gate);
    expect(w.status).toBe('playing');
    for (const r of [...w.relics]) walkTo(w, r);
    expect(w.relicsFound).toBe(5);
    expect(drainEvents(w).some((e) => e.type === 'gateOpened')).toBe(true);
    walkTo(w, w.gate);
    expect(w.status).toBe('complete');
  });
});

describe('predict', () => {
  it('heads for where you will be about a second from now', () => {
    const w = createWorld(level02, 6);
    w.tiles.fill(Tile.Open);
    w.pillars.fill(0);
    w.player.x = cellToWorld(w.grid, 24);
    w.player.z = cellToWorld(w.grid, 24);
    w.player.vx = BALANCE.player.walkSpeed;
    w.player.vz = 0;
    const target = BEHAVIORS.predict(w, w.snakes[0]);
    const ahead = Math.round((BALANCE.player.walkSpeed * BALANCE.ai.predictSeconds) / BALANCE.cellSize);
    expect(target.x).toBe(24 + ahead);
    expect(target.z).toBe(24);
  });

  it('falls back to your cell when the predicted one is blocked', () => {
    const w = createWorld(level02, 6);
    w.tiles.fill(Tile.Open);
    w.pillars.fill(0);
    w.player.x = cellToWorld(w.grid, 24);
    w.player.z = cellToWorld(w.grid, 24);
    w.player.vx = BALANCE.player.walkSpeed;
    w.player.vz = 0;
    const ahead = Math.round((BALANCE.player.walkSpeed * BALANCE.ai.predictSeconds) / BALANCE.cellSize);
    w.pillars[24 * w.grid.size + 24 + ahead] = 1;
    expect(BEHAVIORS.predict(w, w.snakes[0])).toEqual({ x: 24, z: 24 });
  });
});

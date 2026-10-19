import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { level04 } from '../src/levels/level04';
import { LEVELS } from '../src/levels';
import { cellToWorld, worldToCell } from '../src/sim/grid';
import { makeHeld } from '../src/sim/items';
import { NO_INPUT } from '../src/sim/player';
import { makeSnake } from '../src/sim/snake';
import { Tile, hiddenInGrass } from '../src/sim/tiles';
import { createWorld, drainEvents, updateWorld } from '../src/sim/world';
import type { Cell, SimEvent, World } from '../src/sim/types';

const DT = 1 / 30;
const tileAt = (w: World, c: Cell) => w.tiles[c.z * w.grid.size + c.x];

/** Level 4 cleared to plain ground (no pillars, no drops), with grass on the given rectangle. */
function field(grass: { x0: number; z0: number; x1: number; z1: number } | null, seed = 3): World {
  const w = createWorld(level04, seed);
  const n = w.grid.size;
  w.invulnerable = true;
  w.dropTimer = 1e9;
  w.pillars.fill(0);
  w.tiles.fill(Tile.Open);
  w.pellets = [];
  if (grass) for (let z = grass.z0; z <= grass.z1; z++) for (let x = grass.x0; x <= grass.x1; x++) w.tiles[z * n + x] = Tile.Grass;
  return w;
}

/** A snake with its head on `head`, the body trailing toward -x. */
function putSnake(w: World, head: Cell, length = 6, id = 1) {
  const cells: Cell[] = [];
  for (let i = 0; i < length; i++) cells.push({ x: head.x - i, z: head.z });
  const s = makeSnake(w, id, cells);
  return s;
}

function putPlayer(w: World, c: Cell): void {
  w.player.x = cellToWorld(w.grid, c.x);
  w.player.z = cellToWorld(w.grid, c.z);
}

/** Run the world with no input for `seconds`, calling `each` after every update. */
function run(w: World, seconds: number, each?: (events: SimEvent[]) => void): void {
  for (let t = 0; t < seconds; t += DT) {
    updateWorld(w, NO_INPUT, DT);
    const events = drainEvents(w);
    each?.(events);
  }
}

describe('tall grass layout', () => {
  it('is Level 4: 64x64, patches of grass with clearings between', () => {
    expect(LEVELS[3]).toBe(level04);
    for (let seed = 1; seed <= 8; seed++) {
      const w = createWorld(level04, seed);
      expect(w.grid.size).toBe(64);
      const grass = Array.from(w.tiles).filter((t) => t === Tile.Grass).length;
      expect(grass / w.tiles.length).toBeGreaterThan(0.3);
      expect(grass / w.tiles.length).toBeLessThan(0.75);
    }
  });

  it('keeps a clearing around the start, and the snake starts hidden in the grass', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const w = createWorld(level04, seed);
      const { start } = level04;
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) expect(tileAt(w, { x: start.x + dx, z: start.z + dz })).toBe(Tile.Open);
      for (const c of w.snakes[0].cells) expect(tileAt(w, c)).toBe(Tile.Grass);
    }
  });

  it('is the same map for the same seed', () => {
    expect(Array.from(createWorld(level04, 9).tiles)).toEqual(Array.from(createWorld(level04, 9).tiles));
  });

  it('hides its pellets in the grass', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const w = createWorld(level04, seed);
      expect(w.pellets.length).toBe(level04.pelletCount);
      for (const p of w.pellets) expect(tileAt(w, p)).toBe(Tile.Grass);
    }
  });

  it('says what is hidden: anything on a grass cell', () => {
    const w = field({ x0: 5, z0: 5, x1: 10, z1: 10 });
    expect(hiddenInGrass(w, cellToWorld(w.grid, 7), cellToWorld(w.grid, 7))).toBe(true);
    expect(hiddenInGrass(w, cellToWorld(w.grid, 20), cellToWorld(w.grid, 7))).toBe(false);
  });
});

describe('stalk', () => {
  const block = { x0: 5, z0: 5, x1: 25, z1: 25 };
  const inBlock = (c: Cell) => c.x >= block.x0 && c.x <= block.x1 && c.z >= block.z0 && c.z <= block.z1;

  it('stays inside the grass while you are out in the open, and lurks at the edge nearest you', () => {
    const w = field(block);
    w.snakes = [putSnake(w, { x: 15, z: 15 })];
    putPlayer(w, { x: 50, z: 50 });
    let nearCorner = Infinity;
    run(w, 30, () => {
      const h = w.snakes[0].cells[0];
      expect(inBlock(h)).toBe(true);
      nearCorner = Math.min(nearCorner, Math.max(Math.abs(h.x - block.x1), Math.abs(h.z - block.z1)));
    });
    expect(nearCorner).toBeLessThanOrEqual(2);
  });

  it('breaks cover and strikes once you are within 4 cells', () => {
    const w = field(block);
    w.snakes = [putSnake(w, { x: 15, z: 15 })];
    putPlayer(w, { x: block.x1 + BALANCE.ai.stalkStrikeCells, z: 15 });
    let left = false;
    run(w, 12, () => {
      if (!inBlock(w.snakes[0].cells[0])) left = true;
    });
    expect(left).toBe(true);
  });

  it('hunts you through the grass when you hide in it', () => {
    const w = field(block);
    w.snakes = [putSnake(w, { x: 11, z: 8 })];
    const target = { x: 22, z: 22 };
    putPlayer(w, target);
    let closest = Infinity;
    run(w, 25, () => {
      const h = w.snakes[0].cells[0];
      closest = Math.min(closest, Math.hypot(h.x - target.x, h.z - target.z));
    });
    expect(closest).toBeLessThanOrEqual(1.5);
  });

  it('with no grass at all it simply chases', () => {
    const w = field(null);
    w.snakes = [putSnake(w, { x: 15, z: 15 })];
    putPlayer(w, { x: 30, z: 15 });
    run(w, 6);
    expect(w.snakes[0].cells[0].x).toBeGreaterThan(20);
  });
});

describe('firecracker', () => {
  /** Plain field, player facing +x with a firecracker in hand, one snake near and one far away. */
  function armed(): World {
    const w = field(null);
    putPlayer(w, { x: 20, z: 14 });
    w.player.yaw = -Math.PI / 2;
    w.player.pitch = 0;
    w.player.inventory[0] = makeHeld('firecracker', 'white');
    w.player.selectedSlot = 0;
    w.snakes = [putSnake(w, { x: 12, z: 9 }, 6, 1), putSnake(w, { x: 60, z: 60 }, 6, 2)];
    for (const s of w.snakes) s.stunTimer = 1e9;
    return w;
  }

  it('is thrown in an arc, lands about 10 cells ahead, and bangs after its fuse', () => {
    const w = armed();
    updateWorld(w, { ...NO_INPUT, useItem: true }, DT);
    const events = drainEvents(w);
    expect(events.some((e) => e.type === 'itemUsed' && e.item === 'firecracker')).toBe(true);
    expect(w.projectiles).toHaveLength(1);
    expect(w.projectiles[0].kind).toBe('firecracker');
    expect(w.player.inventory[0]).toBeNull();

    let landedAt = -1;
    let bang: { x: number; z: number } | null = null;
    let t = 0;
    run(w, 4, (ev) => {
      t += DT;
      if (landedAt < 0 && w.firecrackers.length > 0) landedAt = t;
      const b = ev.find((e) => e.type === 'firecrackerBang');
      if (b && b.type === 'firecrackerBang') bang = { x: b.x, z: b.z };
    });
    expect(landedAt).toBeGreaterThan(0.5);
    expect(bang).not.toBeNull();
    const cells = (worldToCell(w.grid, bang!.x) - 20);
    expect(cells).toBeGreaterThan(7);
    expect(cells).toBeLessThan(14);
    expect(w.firecrackers).toHaveLength(0);
  });

  it('lures every snake within earshot to the bang for 5 s; a far one does not hear it', () => {
    const w = armed();
    updateWorld(w, { ...NO_INPUT, useItem: true }, DT);
    let banged = false;
    for (let t = 0; t < 4 && !banged; t += DT) {
      updateWorld(w, NO_INPUT, DT);
      banged = drainEvents(w).some((e) => e.type === 'firecrackerBang');
    }
    expect(banged).toBe(true);
    const [near, far] = w.snakes;
    expect(near.lure).not.toBeNull();
    expect(near.lure!.time).toBeCloseTo(BALANCE.items.defs.firecracker.lureSeconds, 1);
    expect(far.lure).toBeNull();

    // Let the near snake move: it heads for the bang, not for you.
    near.stunTimer = 0;
    const lure = { ...near.lure! };
    const d0 = Math.hypot(near.cells[0].x - lure.x, near.cells[0].z - lure.z);
    run(w, 3);
    const h = near.cells[0];
    expect(Math.hypot(h.x - lure.x, h.z - lure.z)).toBeLessThan(d0 - 4);
    run(w, 2.2);
    expect(near.lure).toBeNull();
  });

  it('a firecracker that hits a rock drops at its foot and still bangs', () => {
    const w = armed();
    const n = w.grid.size;
    for (let z = 10; z <= 18; z++) w.pillars[z * n + 23] = 1;
    updateWorld(w, { ...NO_INPUT, useItem: true }, DT);
    let bang: { x: number; z: number } | null = null;
    run(w, 4, (ev) => {
      const b = ev.find((e) => e.type === 'firecrackerBang');
      if (b && b.type === 'firecrackerBang') bang = { x: b.x, z: b.z };
    });
    expect(bang).not.toBeNull();
    expect(worldToCell(w.grid, bang!.x)).toBeLessThanOrEqual(23);
  });
});

import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { level03 } from '../src/levels/level03';
import { cellToWorld, worldToCell } from '../src/sim/grid';
import { makeHeld } from '../src/sim/items';
import { NO_INPUT, updatePlayer } from '../src/sim/player';
import { makeSnake } from '../src/sim/snake';
import { Tile } from '../src/sim/tiles';
import { createWorld, drainEvents, updateWorld } from '../src/sim/world';
import type { Cell, World } from '../src/sim/types';

const tileAt = (w: World, c: Cell) => w.tiles[c.z * w.grid.size + c.x];

/** Land and bridges you can walk on (no swimming), from the start. */
function walkable(w: World): Set<number> {
  const n = w.grid.size;
  const seen = new Set<number>([w.level.start.z * n + w.level.start.x]);
  const q: Cell[] = [w.level.start];
  while (q.length) {
    const c = q.shift() as Cell;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c.x + dx;
      const z = c.z + dz;
      if (x < 0 || z < 0 || x >= n || z >= n) continue;
      const i = z * n + x;
      if (seen.has(i) || w.pillars[i] || w.tiles[i] === Tile.Water) continue;
      seen.add(i);
      q.push({ x, z });
    }
  }
  return seen;
}

/** The first water cell straight north of the player, and the player placed just south of it. */
function atRiverEdge(w: World): Cell {
  const n = w.grid.size;
  const x = worldToCell(w.grid, w.player.x);
  let z = worldToCell(w.grid, w.player.z);
  while (z > 0 && w.tiles[z * n + x] !== Tile.Water) z--;
  w.pillars.fill(0);
  w.player.x = cellToWorld(w.grid, x);
  w.player.z = cellToWorld(w.grid, z + 2);
  w.player.yaw = 0;
  return { x, z };
}

function quietWorld(seed = 5): World {
  const w = createWorld(level03, seed);
  w.invulnerable = true;
  for (const s of w.snakes) s.stunTimer = 1e9;
  w.dropTimer = 1e9;
  return w;
}

describe('riverside layout', () => {
  it('is 64x64 with a river across it from west to east', () => {
    const w = quietWorld();
    expect(w.grid.size).toBe(64);
    const n = w.grid.size;
    for (let x = 0; x < n; x++) {
      let water = 0;
      for (let z = 0; z < n; z++) if (w.tiles[z * n + x] === Tile.Water || w.tiles[z * n + x] === Tile.Bridge) water++;
      expect(water).toBeGreaterThanOrEqual(BALANCE.river.minWidth);
    }
  });

  it('has bridges, and you can walk from the start to the dock over them', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const w = quietWorld(seed);
      expect(Array.from(w.tiles).filter((t) => t === Tile.Bridge).length).toBeGreaterThanOrEqual(level03.layout && level03.layout.kind === 'river' ? level03.layout.bridges * 4 : 1);
      const ok = walkable(w);
      expect(ok.has(w.gate.z * w.grid.size + w.gate.x)).toBe(true);
    }
  });

  it('the start is on the south bank and the dock on the north bank', () => {
    const w = quietWorld();
    expect(tileAt(w, w.level.start)).toBe(Tile.Open);
    expect(tileAt(w, w.gate)).not.toBe(Tile.Water);
    expect(w.level.start.z).toBeGreaterThan(w.gate.z);
  });
});

describe('water and the swim ring', () => {
  it('without a swim ring the water stops you', () => {
    const w = quietWorld();
    const edge = atRiverEdge(w);
    for (let i = 0; i < 60; i++) updateWorld(w, { ...NO_INPUT, forward: 1 }, 0.05);
    expect(worldToCell(w.grid, w.player.z)).toBeGreaterThan(edge.z);
  });

  it('with a swim ring you swim in, slower, and the ring drains only in the water', () => {
    const w = quietWorld();
    const edge = atRiverEdge(w);
    w.inventory[1] = makeHeld('swimRing', 'white');
    const full = w.inventory[1].uses;
    updateWorld(w, { ...NO_INPUT, forward: 1 }, 0.5);
    expect(w.inventory[1]?.uses).toBe(full);
    for (let i = 0; i < 30; i++) updateWorld(w, { ...NO_INPUT, forward: 1 }, 0.05);
    expect(worldToCell(w.grid, w.player.z)).toBeLessThanOrEqual(edge.z);
    expect(w.player.swimming).toBe(true);
    expect(w.inventory[1]?.uses ?? 0).toBeLessThan(full);
    // Swimming is slower than walking.
    const z0 = w.player.z;
    updateWorld(w, { ...NO_INPUT, forward: 1, sprint: true }, 1);
    expect(z0 - w.player.z).toBeLessThan(BALANCE.player.walkSpeed * BALANCE.river.swimSpeed + 0.01);
  });

  it('using the swim ring does nothing (it works on its own)', () => {
    const w = quietWorld();
    w.inventory[0] = makeHeld('swimRing', 'white');
    const uses = w.inventory[0].uses;
    updateWorld(w, { ...NO_INPUT, useItem: true }, 0.01);
    expect(w.inventory[0]?.uses).toBe(uses);
  });

  it('when the ring runs out in deep water you drown and lose a life', () => {
    const w = quietWorld();
    w.invulnerable = false;
    atRiverEdge(w);
    w.inventory[0] = makeHeld('swimRing', 'white');
    for (let i = 0; i < 30; i++) updateWorld(w, { ...NO_INPUT, forward: 1 }, 0.05);
    expect(w.player.swimming).toBe(true);
    (w.inventory[0] as { uses: number }).uses = 0.1;
    for (let i = 0; i < 10 && w.lives === BALANCE.lives.perLevel; i++) updateWorld(w, NO_INPUT, 0.05);
    expect(w.lives).toBe(BALANCE.lives.perLevel - 1);
    expect(drainEvents(w).some((e) => e.type === 'lifeLost' && e.cause === 'drowned')).toBe(true);
  });
});

describe('the snake in water', () => {
  it('swims slower than it moves on land', () => {
    const w = quietWorld();
    const n = w.grid.size;
    // Find a water cell with water to its east, put the head there.
    let head: Cell | null = null;
    for (let i = 0; i < n * n && !head; i++) if (w.tiles[i] === Tile.Water && w.tiles[i + 1] === Tile.Water) head = { x: i % n, z: Math.floor(i / n) };
    expect(head).not.toBeNull();
    const h = head as Cell;
    const s = makeSnake(w, 1, [h, { x: h.x - 1, z: h.z }, { x: h.x - 2, z: h.z }, { x: h.x - 3, z: h.z }, { x: h.x - 4, z: h.z }]);
    w.snakes = [s];
    updateWorld(w, NO_INPUT, 0.01);
    const land = Math.max(level03.snake.minInterval, level03.snake.baseInterval);
    expect(s.interval).toBeCloseTo(land * BALANCE.river.snakeSwimSlow, 2);
  });

  it('splits by itself past the set length on this level', () => {
    expect(level03.snake.splitAt).toBeGreaterThan(level03.snake.startLength);
  });
});

describe('pellet speed boost', () => {
  it('each pellet adds a boost that fades over about 8 s, and boosts stack', () => {
    const w = quietWorld();
    w.pillars.fill(0);
    w.tiles.fill(Tile.Open);
    const take = () => {
      const p = w.pellets[0];
      w.player.x = cellToWorld(w.grid, p.x);
      w.player.z = cellToWorld(w.grid, p.z);
      updateWorld(w, NO_INPUT, 0.001);
    };
    const speedNow = () => {
      const x0 = w.player.x;
      const z0 = w.player.z;
      w.player.yaw = 0;
      updatePlayer(w, { ...NO_INPUT, forward: 1 }, 0.1);
      const d = Math.hypot(w.player.x - x0, w.player.z - z0) / 0.1;
      w.player.x = x0;
      w.player.z = z0;
      return d;
    };
    const base = speedNow();
    take();
    const one = speedNow();
    expect(one).toBeGreaterThan(base * 1.1);
    take();
    expect(speedNow()).toBeGreaterThan(one);
    for (let t = 0; t < level03.pelletBoost!.seconds + 0.5; t += 0.5) updateWorld(w, NO_INPUT, 0.5);
    expect(speedNow()).toBeCloseTo(base, 3);
  });
});

describe('the dock', () => {
  it('reaching the dock completes the level', () => {
    const w = quietWorld();
    w.player.x = cellToWorld(w.grid, w.gate.x);
    w.player.z = cellToWorld(w.grid, w.gate.z);
    updateWorld(w, NO_INPUT, 0.01);
    expect(w.status).toBe('complete');
  });
});

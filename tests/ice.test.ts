import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { level08 } from '../src/levels/level08';
import { LEVELS } from '../src/levels';
import { guideLines } from '../src/levels/guide';
import { cellToWorld } from '../src/sim/grid';
import { makeHeld } from '../src/sim/items';
import { NO_INPUT } from '../src/sim/player';
import { makeSnake } from '../src/sim/snake';
import { Tile } from '../src/sim/tiles';
import { createWorld, drainEvents, updateWorld } from '../src/sim/world';
import type { Cell, SimEvent, World } from '../src/sim/types';

const DT = 1 / 30;

/**
 * Level 8 on clear ice (no rocks, no drops, no pellets) with one snake on `cells`, or (by default) a
 * short one frozen in a far corner, out of the way (with no snake at all the level would be won).
 */
function rink(cells?: Cell[], seed = 2): World {
  const w = createWorld(level08, seed);
  w.invulnerable = true;
  w.dropTimer = 1e9;
  w.pillars.fill(0);
  w.tiles.fill(Tile.Ice);
  w.pellets = [];
  w.snakes = [makeSnake(w, 1, cells ?? line({ x: 6, z: 2 }, 4))];
  if (!cells) w.snakes[0].stunTimer = 1e9;
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

describe('frozen lake layout', () => {
  it('is Level 8: 64x64, mostly ice, a snowy shore, patches of cracked ice; a snake that can be beaten', () => {
    expect(LEVELS[7]).toBe(level08);
    expect(level08.snake.defeatable).toBe(true);
    for (let seed = 1; seed <= 6; seed++) {
      const w = createWorld(level08, seed);
      const count = (t: number) => Array.from(w.tiles).filter((v) => v === t).length;
      expect(count(Tile.Ice) / w.tiles.length).toBeGreaterThan(0.5);
      expect(count(Tile.CrackedIce)).toBeGreaterThanOrEqual(level08.layout?.kind === 'lake' ? level08.layout.cracks * 3 : 1);
      expect(w.tiles[0]).toBe(Tile.Open);
      expect(w.tiles[level08.start.z * 64 + level08.start.x]).toBe(Tile.Open);
    }
  });
});

describe('sliding', () => {
  /** Run east for 1 s, then let go: how far you slide in the next half second. */
  function slide(tile: number, cleats = false): number {
    const w = rink();
    w.tiles.fill(tile);
    putPlayer(w, { x: 10, z: 30 });
    w.player.yaw = -Math.PI / 2;
    if (cleats) w.player.cleats = 30;
    for (let t = 0; t < 1; t += DT) updateWorld(w, { ...NO_INPUT, forward: 1 }, DT);
    const x0 = w.player.x;
    for (let t = 0; t < 0.5; t += DT) updateWorld(w, NO_INPUT, DT);
    return w.player.x - x0;
  }

  it('on ice you keep sliding after you let go; on snow, or with ice cleats, you stop', () => {
    expect(slide(Tile.Ice)).toBeGreaterThan(1);
    expect(slide(Tile.Open)).toBeLessThan(0.01);
    expect(slide(Tile.Ice, true)).toBeLessThan(0.01);
  });

  it('ice cleats last 20 s', () => {
    const w = rink();
    w.inventory[0] = makeHeld('iceCleats', 'white');
    w.selectedSlot = 0;
    updateWorld(w, { ...NO_INPUT, useItem: true }, DT);
    expect(drainEvents(w).some((e) => e.type === 'cleatsOn')).toBe(true);
    expect(w.player.cleats).toBeCloseTo(BALANCE.items.defs.iceCleats.seconds, 0);
    run(w, BALANCE.items.defs.iceCleats.seconds + 0.2);
    expect(w.player.cleats).toBe(0);
  });
});

describe('cracked ice', () => {
  it('gives way under a long snake and cuts it where it breaks; the piece behind becomes its own snake', () => {
    const w = rink(line({ x: 20, z: 30 }, 16));
    const n = w.grid.size;
    w.tiles[30 * n + 22] = Tile.CrackedIce;
    putPlayer(w, { x: 50, z: 30 });
    let cracked = false;
    let broke = false;
    run(w, 3, (ev) => {
      if (ev.some((e) => e.type === 'iceCracking')) cracked = true;
      if (ev.some((e) => e.type === 'iceBroke')) broke = true;
    });
    expect(cracked).toBe(true);
    expect(broke).toBe(true);
    expect(w.tiles[30 * n + 22]).toBe(Tile.Hole);
    // Cut at the 5th segment behind the head: a front of 5 goes on; the 10 behind are a snake of their own.
    expect(w.snakes.map((s) => s.cells.length).sort((a, b) => a - b)).toEqual([5, 10]);
  });

  it('a short snake is too light to break it', () => {
    const w = rink(line({ x: 20, z: 30 }, 5));
    const n = w.grid.size;
    w.tiles[30 * n + 22] = Tile.CrackedIce;
    putPlayer(w, { x: 50, z: 30 });
    run(w, 3);
    expect(w.tiles[30 * n + 22]).toBe(Tile.CrackedIce);
  });

  it('a hole blocks you', () => {
    const w = rink();
    const n = w.grid.size;
    w.tiles[30 * n + 20] = Tile.Hole;
    putPlayer(w, { x: 17, z: 30 });
    w.player.yaw = -Math.PI / 2;
    w.player.cleats = 99;
    for (let t = 0; t < 2; t += DT) updateWorld(w, { ...NO_INPUT, forward: 1 }, DT);
    expect(w.player.x).toBeLessThan(cellToWorld(w.grid, 20) - 1);
  });

  it('the whole patch goes at once; standing on it, you fall in', () => {
    // A patch of two cells; the 6th segment (index 5) lies on one, you stand on the other.
    const w = rink(line({ x: 26, z: 30 }, 12));
    w.snakes[0].stunTimer = 1e9;
    w.invulnerable = false;
    w.lives = 3;
    const n = w.grid.size;
    w.tiles[30 * n + 21] = Tile.CrackedIce;
    w.tiles[31 * n + 21] = Tile.CrackedIce;
    w.cracking.push({ i: 30 * n + 21, t: 0.9 });
    putPlayer(w, { x: 21, z: 31 });
    const events: SimEvent[] = [];
    run(w, 0.2, (ev) => events.push(...ev));
    const lost = events.find((e) => e.type === 'lifeLost');
    expect(lost && lost.type === 'lifeLost' && lost.cause).toBe('fell');
    expect(w.tiles[31 * n + 21]).toBe(Tile.Hole);
    expect(w.snakes[0].cells).toHaveLength(5);
  });
});

describe('beating the snake', () => {
  it('a cut that leaves the front under 3 beats it; with no snake left the level is won', () => {
    const w = rink(line({ x: 30, z: 30 }, 8));
    expect(guideLines(w).progress).toBe('Length 8');
    const s = w.snakes[0];
    s.stunTimer = 1e9;
    putPlayer(w, { x: 30, z: 33 });
    // A machete cut at segment 2: the front would be 2 long.
    w.inventory[0] = makeHeld('machete', 'white');
    w.selectedSlot = 0;
    w.player.yaw = 0;
    w.player.x = s.pos[2].x;
    w.player.z = s.pos[2].z + 1.7;
    w.player.pitch = -0.32;
    updateWorld(w, { ...NO_INPUT, useItem: true }, DT);
    const ev = drainEvents(w);
    // A front under 3 means the whole snake is beaten (Phase 2's rule): none left, the level is won.
    expect(ev.some((e) => e.type === 'snakeDefeated')).toBe(true);
    expect(w.snakes).toHaveLength(0);
    updateWorld(w, NO_INPUT, DT);
    expect(w.status).toBe('complete');
  });
});

import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { BEHAVIORS } from '../src/ai';
import { level09 } from '../src/levels/level09';
import { LEVELS } from '../src/levels';
import { guideLines } from '../src/levels/guide';
import { cellToWorld, worldToCell } from '../src/sim/grid';
import { doorInReach } from '../src/sim/house';
import { OFFERED_PERKS } from '../src/sim/perks';
import { NO_INPUT } from '../src/sim/player';
import { makeSnake } from '../src/sim/snake';
import { DoorState, Tile } from '../src/sim/tiles';
import { createWorld, drainEvents, updateWorld } from '../src/sim/world';
import type { Cell, PlayerInput, SimEvent, World } from '../src/sim/types';

const DT = 1 / 30;

/** Walking distances from the start (through any door, open or shut). */
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
      if (nx < 0 || nz < 0 || nx >= n || nz >= n || dist[nid] >= 0 || w.pillars[nid]) continue;
      const t = w.tiles[nid];
      if (t === Tile.HouseWall || t === Tile.Crumble) continue;
      dist[nid] = dist[id] + 1;
      q.push(nid);
    }
  }
  return dist;
}

/** An empty room: no walls, no drops, no pellets, one snake on `cells` (head first). */
function room(cells: Cell[], seed = 2): World {
  const w = createWorld(level09, seed);
  w.invulnerable = true;
  w.dropTimer = 1e9;
  w.tiles.fill(Tile.Open);
  w.doorState.fill(0);
  w.pellets = [];
  w.relics = [];
  w.snakes = [makeSnake(w, 1, cells)];
  return w;
}

const line = (head: Cell, length: number): Cell[] => Array.from({ length }, (_, i) => ({ x: head.x - i, z: head.z }));

function putPlayer(w: World, c: Cell): void {
  w.player.x = cellToWorld(w.grid, c.x);
  w.player.z = cellToWorld(w.grid, c.z);
}

function run(w: World, seconds: number, input: PlayerInput = NO_INPUT, each?: (e: SimEvent[]) => void): void {
  for (let t = 0; t < seconds; t += DT) {
    updateWorld(w, input, DT);
    each?.(drainEvents(w));
  }
}

describe('broken house layout', () => {
  it('is Level 9: 48x48 rooms behind walls, doors (some shut), closets; the key and the front door can be reached', () => {
    expect(LEVELS[8]).toBe(level09);
    for (let seed = 1; seed <= 8; seed++) {
      const w = createWorld(level09, seed);
      const count = (t: number) => Array.from(w.tiles).filter((v) => v === t).length;
      expect(w.grid.size).toBe(48);
      expect(count(Tile.HouseWall)).toBeGreaterThan(80);
      expect(count(Tile.Door)).toBeGreaterThan(6);
      expect(count(Tile.Closet)).toBeGreaterThan(3);
      expect(Array.from(w.doorState).some((s, i) => w.tiles[i] === Tile.Door && s === DoorState.Shut)).toBe(true);
      const dist = walk(w);
      const n = w.grid.size;
      expect(w.relics).toHaveLength(1);
      expect(dist[w.relics[0].z * n + w.relics[0].x]).toBeGreaterThan(20);
      expect(dist[w.gate.z * n + w.gate.x]).toBeGreaterThan(0);
    }
  });

  it('Light feet is offered now', () => {
    expect(OFFERED_PERKS).toContain('lightFeet');
  });
});

describe('doors', () => {
  /** A wall across x = 20 with a two-cell doorway at z 20..21, shut. */
  function doorway(): World {
    const w = room(line({ x: 6, z: 40 }, 6));
    w.snakes[0].stunTimer = 1e9;
    const n = w.grid.size;
    for (let z = 0; z < n; z++) w.tiles[z * n + 20] = Tile.HouseWall;
    for (const z of [20, 21]) {
      w.tiles[z * n + 20] = Tile.Door;
      w.doorState[z * n + 20] = DoorState.Shut;
    }
    return w;
  }

  it('a shut door is a wall; R opens it, R shuts it again (with a slam you can hear far off)', () => {
    const w = doorway();
    const n = w.grid.size;
    putPlayer(w, { x: 18, z: 20 });
    w.player.yaw = -Math.PI / 2;
    run(w, 1.5, { ...NO_INPUT, forward: 1 });
    expect(worldToCell(w.grid, w.player.x)).toBeLessThan(20);
    expect(doorInReach(w, w.player)?.state).toBe(DoorState.Shut);
    updateWorld(w, { ...NO_INPUT, interact: true }, DT);
    expect(drainEvents(w).some((e) => e.type === 'doorOpened')).toBe(true);
    expect(w.doorState[21 * n + 20]).toBe(DoorState.Open);
    // Through, and a step past it (still within reach); turn round and shut it behind you.
    run(w, 0.6, { ...NO_INPUT, forward: 1 });
    expect(worldToCell(w.grid, w.player.x)).toBeGreaterThan(20);
    w.player.yaw = Math.PI / 2;
    updateWorld(w, { ...NO_INPUT, interact: true }, DT);
    expect(drainEvents(w).some((e) => e.type === 'doorShut')).toBe(true);
    expect(w.player.noise).toBe(BALANCE.noise.slam);
  });

  it('it will not shut on you', () => {
    const w = doorway();
    const n = w.grid.size;
    w.doorState[20 * n + 20] = DoorState.Open;
    w.doorState[21 * n + 20] = DoorState.Open;
    putPlayer(w, { x: 20, z: 20 });
    updateWorld(w, { ...NO_INPUT, interact: true }, DT);
    expect(w.doorState[20 * n + 20]).toBe(DoorState.Open);
  });

  it('a snake bashes a shut door down in about 3 s', () => {
    const w = doorway();
    const n = w.grid.size;
    w.snakes = [makeSnake(w, 1, line({ x: 18, z: 20 }, 6))];
    // Drawn to the far side (as by a firecracker), so it has to get through the door.
    w.snakes[0].lure = { x: 34, z: 20, time: 1e9 };
    putPlayer(w, { x: 30, z: 30 });
    let bashed = 0;
    let broke = -1;
    let t = 0;
    run(w, BALANCE.house.doorBreakSeconds + 2, NO_INPUT, (ev) => {
      t += DT;
      bashed += ev.filter((e) => e.type === 'doorBash').length;
      if (broke < 0 && ev.some((e) => e.type === 'doorBroken')) broke = t;
    });
    expect(bashed).toBeGreaterThan(3);
    expect(broke).toBeGreaterThan(BALANCE.house.doorBreakSeconds - 0.5);
    expect(w.doorState[20 * n + 20]).toBe(DoorState.Broken);
    expect(w.snakes[0].cells[0].x).toBeGreaterThan(20);
  });
});

describe('ambush, noise and hiding', () => {
  it('lies in wait and does not notice you standing still at 5 cells', () => {
    const w = room(line({ x: 20, z: 20 }, 6));
    putPlayer(w, { x: 25, z: 20 });
    const s = w.snakes[0];
    s.stunTimer = 1e9;
    updateWorld(w, NO_INPUT, DT);
    BEHAVIORS.ambush(w, s);
    expect(s.striking).toBe(false);
  });

  it('hears you walk within 6 cells and strikes; with Light feet it hears you later', () => {
    const heard = (perks: string[]) => {
      const w = room(line({ x: 20, z: 20 }, 6));
      w.perks = perks as never;
      const s = w.snakes[0];
      s.stunTimer = 1e9;
      // About 5.4 cells away, walking: inside your 6-cell footsteps, outside Light feet's 3.6.
      putPlayer(w, { x: 25, z: 22 });
      w.player.yaw = 0;
      updateWorld(w, { ...NO_INPUT, strafe: 1 }, DT);
      BEHAVIORS.ambush(w, s);
      return s.striking;
    };
    expect(heard([])).toBe(true);
    expect(heard(['lightFeet'])).toBe(false);
  });

  it('in a closet you are hidden unless it is right beside you', () => {
    const w = room(line({ x: 20, z: 20 }, 6));
    const n = w.grid.size;
    w.tiles[20 * n + 23] = Tile.Closet;
    putPlayer(w, { x: 23, z: 20 });
    const s = w.snakes[0];
    s.stunTimer = 1e9;
    s.striking = true;
    updateWorld(w, NO_INPUT, DT);
    expect(w.player.hidden).toBe(true);
    BEHAVIORS.ambush(w, s);
    expect(s.striking).toBe(false);
    // Right beside you: found.
    s.cells = line({ x: 22, z: 20 }, 6);
    BEHAVIORS.ambush(w, s);
    expect(s.striking).toBe(true);
  });

  it('the key, then the front door', () => {
    const w = createWorld(level09, 3);
    w.invulnerable = true;
    for (const s of w.snakes) s.stunTimer = 1e9;
    expect(guideLines(w).progress).toBe('Key not found');
    putPlayer(w, w.relics[0]);
    updateWorld(w, NO_INPUT, DT);
    expect(guideLines(w).progress).toBe('Key found: the front door');
    putPlayer(w, w.gate);
    updateWorld(w, NO_INPUT, DT);
    expect(w.status).toBe('complete');
  });
});

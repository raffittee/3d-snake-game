import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { LEVELS } from '../src/levels';
import { makeHeld } from '../src/sim/items';
import { DEFAULT_SETTINGS, createMatchWorld, matchLevel, sanitizeSettings } from '../src/sim/match';
import type { MatchSettings } from '../src/sim/match';
import { cellToWorld, inBounds, worldToCell } from '../src/sim/grid';
import { choosePrey } from '../src/sim/hunt';
import { NO_INPUT } from '../src/sim/player';
import { Tile, tileHeight } from '../src/sim/tiles';
import type { PlayerInput, PlayerState, World } from '../src/sim/types';
import { createWorld, drainEvents, updateWorld } from '../src/sim/world';

const DT = 1 / 30;
const settings = (over: Partial<MatchSettings> = {}): MatchSettings => ({ ...DEFAULT_SETTINGS, ...over });
const idle = (w: World): PlayerInput[] => w.players.map(() => NO_INPUT);

/** Stand `p` on the head of snake `i` so the next update counts as a catch. */
function catchBy(w: World, p: PlayerState, i = 0, inputs: PlayerInput[] = idle(w)): void {
  const head = w.snakes[i].pos[0];
  p.x = head.x;
  p.z = head.z;
  p.graceTimer = 0;
  updateWorld(w, inputs, DT);
}

/** Move `p` far from every snake (to the start), so it is safe while the test runs. */
function park(w: World, p: PlayerState, dx = 0): void {
  p.x = cellToWorld(w.grid, w.level.start.x) + dx;
  p.z = cellToWorld(w.grid, w.level.start.z);
}

describe('several players in one world', () => {
  it('each player has their own body, slots and lives, and starts beside the others', () => {
    const w = createMatchWorld(settings(), 4, 7);
    expect(w.players).toHaveLength(4);
    expect(new Set(w.players.map((p) => p.inventory)).size).toBe(4);
    const xs = w.players.map((p) => p.x);
    expect(new Set(xs).size).toBe(4);
    expect(w.player).toBe(w.players[0]);
  });

  it('inputs move each player separately', () => {
    const w = createMatchWorld(settings(), 2, 7);
    const z0 = w.players.map((p) => p.z);
    w.players.forEach((p) => (p.yaw = 0));
    updateWorld(w, [{ ...NO_INPUT, forward: 1 }, NO_INPUT], 0.5);
    expect(w.players[0].z).toBeLessThan(z0[0] - 1);
    expect(w.players[1].z).toBeCloseTo(z0[1]);
  });

  it('a snake hunts the nearest player it can catch', () => {
    const w = createMatchWorld(settings(), 2, 7);
    const head = w.snakes[0].pos[0];
    w.players[1].x = head.x + 4;
    w.players[1].z = head.z;
    expect(choosePrey(w, w.snakes[0])).toBe(1);
    w.players[1].down = 5;
    expect(choosePrey(w, w.snakes[0])).toBe(0);
  });

  it('aggro: a stone on the snake makes it hunt the shooter for a while', () => {
    const w = createMatchWorld(settings(), 2, 7);
    const s = w.snakes[0];
    const head = s.pos[0];
    // Player 1 stands next to the snake; player 0 shoots its head from further off (south of it, facing north).
    w.players[1].x = head.x + 3;
    w.players[1].z = head.z;
    const shooter = w.players[0];
    shooter.x = head.x;
    shooter.z = head.z + 8;
    shooter.yaw = 0;
    shooter.pitch = -0.08;
    shooter.inventory[0] = makeHeld('slingshot', 'white');
    s.stunTimer = 5;
    const inputs = idle(w);
    inputs[0] = { ...NO_INPUT, useItem: true };
    updateWorld(w, inputs, DT);
    for (let i = 0; i < 20 && !s.aggro; i++) updateWorld(w, idle(w), DT);
    expect(s.aggro?.id).toBe(0);
    expect(choosePrey(w, s)).toBe(0);
  });

  it('runs the same way twice from the same seed and inputs (no hidden randomness)', () => {
    const play = (): string => {
      const w = createMatchWorld(settings({ items: 'on' }), 4, 99);
      for (let t = 0; t < 600; t++) {
        const inputs = w.players.map((_p, i) => ({ ...NO_INPUT, forward: Math.sin(t / 30 + i), strafe: Math.cos(t / 47 + i), lookYaw: 0.01 * i, sprint: t % 90 < 40 }));
        updateWorld(w, inputs, DT);
      }
      drainEvents(w);
      return JSON.stringify({ p: w.players, s: w.snakes, pel: w.pellets, d: w.drops, m: w.match });
    };
    expect(play()).toBe(play());
  });
});

describe('match settings and arenas', () => {
  it('sanitizeSettings keeps only allowed values', () => {
    const s = sanitizeSettings({ terrain: 'cave', mode: 'hotEgg', mapSize: 81, rounds: 5, items: 'lots', evil: true });
    expect(s).toEqual({ ...DEFAULT_SETTINGS, terrain: 'cave', mode: 'hotEgg', rounds: 5 });
  });

  it('every terrain builds at every map size, with free spawn cells and an exit reachable from the start', () => {
    for (const level of LEVELS) {
      for (const mapSize of [64, 80, 96] as const) {
        const w = createMatchWorld(settings({ terrain: level.terrain, mapSize, mode: 'escapeRace' }), 4, 3);
        expect(w.grid.size).toBe(mapSize);
        const n = w.grid.size;
        // What stops you for good: solid walls and holes. Low walls you jump; doors open; deep water needs a swim ring (they drop).
        const blocks = (t: number): boolean => (tileHeight(t) > 0 && t !== Tile.LowWall) || t === Tile.Hole;
        const free = (x: number, z: number): boolean => inBounds(w.grid, x, z) && !w.pillars[z * n + x] && !blocks(w.tiles[z * n + x]);
        for (const c of w.match?.spawns ?? []) expect(free(c.x, c.z), `${level.terrain} ${mapSize} spawn`).toBe(true);
        // Walk from the start to the exit (deep water counts as passable: a swim ring can drop).
        const seen = new Uint8Array(n * n);
        const q = [w.level.start.z * n + w.level.start.x];
        seen[q[0]] = 1;
        let reached = false;
        for (let h = 0; h < q.length && !reached; h++) {
          const x = q[h] % n;
          const z = (q[h] / n) | 0;
          if (Math.abs(x - w.gate.x) <= 1 && Math.abs(z - w.gate.z) <= 1) reached = true;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx;
            const nz = z + dz;
            if (!free(nx, nz) || seen[nz * n + nx]) continue;
            seen[nz * n + nx] = 1;
            q.push(nz * n + nx);
          }
        }
        expect(reached, `${level.terrain} ${mapSize}: exit reachable`).toBe(true);
      }
    }
  });

  it('turns off the boss, the corn maze map and relics, and makes the snake beatable', () => {
    const cave = matchLevel(settings({ terrain: 'cave' }), 2);
    expect(cave.snake.boss).toBeFalsy();
    expect(cave.snake.defeatable).toBe(true);
    const maze = createMatchWorld(settings({ terrain: 'corn-maze' }), 2, 1);
    expect(maze.level.minimap?.offUntilMap).toBe(false);
    expect(maze.relics).toEqual([]);
  });

  it('Classic: the snake starts longer with more players', () => {
    const one = createMatchWorld(settings(), 1, 1);
    const four = createMatchWorld(settings(), 4, 1);
    expect(four.snakes[0].cells.length).toBe(one.snakes[0].cells.length + 3 * BALANCE.multiplayer.lengthPerPlayer);
  });
});

describe('Classic co-op', () => {
  it('a caught player goes down and a teammate standing beside them gets them up', () => {
    const w = createMatchWorld(settings(), 2, 5);
    const [a, b] = w.players;
    park(w, b);
    catchBy(w, a);
    expect(a.down).toBeGreaterThan(0);
    expect(drainEvents(w).some((e) => e.type === 'playerDowned' && e.pid === 0)).toBe(true);
    // Downed: not hunted.
    expect(choosePrey(w, w.snakes[0])).toBe(1);
    // Freeze the snake, move the downed player clear of it, and bring the teammate over.
    w.snakes[0].stunTimer = 10;
    park(w, a, 6);
    b.x = a.x + 1;
    b.z = a.z;
    for (let t = 0; t < BALANCE.multiplayer.classic.reviveSeconds / DT + 2; t++) updateWorld(w, idle(w), DT);
    expect(a.down).toBe(0);
    expect(drainEvents(w).some((e) => e.type === 'playerRevived' && e.pid === 0 && e.by === 1)).toBe(true);
  });

  it('a downed player nobody helps gets up at the start after the down time', () => {
    const w = createMatchWorld(settings(), 2, 5);
    const [a, b] = w.players;
    park(w, b, 6);
    catchBy(w, a);
    w.snakes[0].stunTimer = 100;
    for (let t = 0; t < (BALANCE.multiplayer.classic.downSeconds + 0.5) / DT; t++) updateWorld(w, idle(w), DT);
    expect(a.down).toBe(0);
    expect(a.x).toBeCloseTo(cellToWorld(w.grid, w.match?.spawns[0].x ?? 0));
  });

  it('everyone down at once loses the round', () => {
    const w = createMatchWorld(settings(), 2, 5);
    const [a, b] = w.players;
    catchBy(w, a);
    catchBy(w, b);
    expect(w.status).toBe('complete');
    expect(w.match?.winners).toEqual([]);
  });

  it('pellets carried to the nest fill it; a full nest wins for everyone', () => {
    const w = createMatchWorld(settings(), 2, 5);
    const m = w.match;
    if (!m?.nest) throw new Error('no nest');
    w.snakes[0].stunTimer = 1000;
    const [a] = w.players;
    m.nest.filled = m.nest.need - 2;
    a.carrying = 2;
    a.x = cellToWorld(w.grid, m.nest.x);
    a.z = cellToWorld(w.grid, m.nest.z);
    updateWorld(w, idle(w), DT);
    expect(m.nest.filled).toBe(m.nest.need);
    expect(w.status).toBe('complete');
    expect(m.winners).toEqual([0, 1]);
    expect(m.points).toEqual([1, 1]);
  });

  it('picking up pellets carries them, up to the cap', () => {
    const w = createMatchWorld(settings(), 1, 5);
    const a = w.players[0];
    for (let i = 0; i < BALANCE.multiplayer.classic.carryMax + 2; i++) {
      const p = w.pellets[0];
      a.x = cellToWorld(w.grid, p.x);
      a.z = cellToWorld(w.grid, p.z);
      updateWorld(w, idle(w), DT);
    }
    expect(a.carrying).toBe(BALANCE.multiplayer.classic.carryMax);
  });

  it('runs out of time: the snake wins', () => {
    const w = createMatchWorld(settings(), 1, 5);
    w.snakes[0].stunTimer = 1e6;
    if (w.match) w.match.timeLeft = 0.01;
    updateWorld(w, idle(w), DT);
    expect(w.match?.winners).toEqual([]);
  });
});

describe('Snake and Players', () => {
  it('one player steers the snake; the role rotates each round', () => {
    const r1 = createMatchWorld(settings({ mode: 'snakeAndPlayers' }), 3, 5, { round: 1, points: [] });
    const r2 = createMatchWorld(settings({ mode: 'snakeAndPlayers' }), 3, 5, { round: 2, points: [] });
    expect(r1.snakes).toHaveLength(1);
    expect(r1.snakes[0].pilot).toBe(0);
    expect(r1.players[0].snakeId).toBe(r1.snakes[0].id);
    expect(r2.snakes[0].pilot).toBe(1);
  });

  it('the steered snake heads where its pilot points and never reverses', () => {
    const w = createMatchWorld(settings({ mode: 'snakeAndPlayers' }), 2, 5);
    const s = w.snakes[0];
    const pilot = w.players[0];
    // Point north (-z): yaw 0.
    pilot.yaw = 0;
    s.heading = 0;
    const z0 = s.cells[0].z;
    const x0 = s.cells[0].x;
    for (let t = 0; t < 60; t++) updateWorld(w, idle(w), DT);
    expect(s.cells[0].z).toBeLessThan(z0);
    expect(Math.abs(s.cells[0].x - x0)).toBeLessThanOrEqual(1);
    // Point back the way it came: the heading only turns at the turn rate, so it curves round.
    pilot.yaw = Math.PI;
    updateWorld(w, idle(w), DT);
    expect(Math.abs(s.heading)).toBeLessThan(BALANCE.pilot.turnRate * DT + 1e-6);
  });

  it('dash and tail whip work on cooldowns', () => {
    const w = createMatchWorld(settings({ mode: 'snakeAndPlayers' }), 2, 5);
    const s = w.snakes[0];
    const runner = w.players[1];
    const inputs = idle(w);
    inputs[0] = { ...NO_INPUT, useItem: true, interact: true };
    const tail = s.pos[s.pos.length - 1];
    runner.x = tail.x + 1;
    runner.z = tail.z + 1;
    updateWorld(w, inputs, DT);
    expect(s.dash).toBeGreaterThan(0);
    expect(s.cooldowns.dash).toBeGreaterThan(0);
    expect(runner.tired).toBe(true);
    const ev = drainEvents(w);
    expect(ev.some((e) => e.type === 'snakeWhip' && e.hits === 1)).toBe(true);
    // Pressing again right away does nothing.
    updateWorld(w, inputs, DT);
    expect(drainEvents(w).some((e) => e.type === 'snakeDash')).toBe(false);
  });

  it('a catch costs a runner a life and grows the snake; everyone out wins for the snake', () => {
    const w = createMatchWorld(settings({ mode: 'snakeAndPlayers' }), 2, 5);
    const runner = w.players[1];
    const grow = w.snakes[0].pendingGrow;
    catchBy(w, runner);
    expect(runner.lives).toBe(BALANCE.multiplayer.snakeAndPlayers.lives - 1);
    expect(w.snakes[0].pendingGrow).toBe(grow + BALANCE.multiplayer.snakeAndPlayers.growOnCatch);
    runner.lives = 1;
    catchBy(w, runner);
    expect(runner.out).toBe(true);
    expect(w.match?.winners).toEqual([0]);
  });

  it('the snake does not catch its own pilot', () => {
    const w = createMatchWorld(settings({ mode: 'snakeAndPlayers' }), 2, 5);
    park(w, w.players[1]);
    for (let t = 0; t < 30; t++) updateWorld(w, idle(w), DT);
    expect(w.status).toBe('playing');
  });
});

describe('Infection', () => {
  it('a caught player rises as a snake of their own, and the last human standing wins', () => {
    const w = createMatchWorld(settings({ mode: 'infection' }), 3, 5);
    const [a, b, c] = w.players;
    park(w, b, 4);
    park(w, c, -4);
    catchBy(w, a);
    expect(drainEvents(w).some((e) => e.type === 'playerInfected' && e.pid === 0)).toBe(true);
    for (let t = 0; t < (BALANCE.multiplayer.infection.infectDelay + 0.2) / DT; t++) updateWorld(w, idle(w), DT);
    expect(a.snakeId).not.toBeNull();
    const mine = w.snakes.find((s) => s.id === a.snakeId);
    expect(mine?.pilot).toBe(0);
    expect(mine?.cells.length).toBe(BALANCE.multiplayer.infection.snakeLength);
    catchBy(w, b, 0);
    expect(w.status).toBe('complete');
    expect(w.match?.winners).toEqual([2]);
  });
});

describe('Hot Egg', () => {
  it('the snake only hunts the carrier; touching passes the egg; a caught carrier is out', () => {
    const w = createMatchWorld(settings({ mode: 'hotEgg' }), 3, 5);
    const carrier = w.players.find((p) => p.egg);
    if (!carrier) throw new Error('no carrier');
    const others = w.players.filter((p) => p !== carrier);
    // The nearest player is not the carrier, but the snake still hunts the carrier.
    const head = w.snakes[0].pos[0];
    others[0].x = head.x + 3;
    others[0].z = head.z;
    expect(choosePrey(w, w.snakes[0])).toBe(carrier.id);
    // A non-carrier on the head is only shoved aside.
    catchBy(w, others[0]);
    expect(others[0].out).toBe(false);
    expect(Math.hypot(others[0].x - head.x, others[0].z - head.z)).toBeGreaterThan(2);
    // Pass by touching.
    w.snakes[0].stunTimer = 100;
    if (w.match) w.match.passCooldown = 0;
    others[1].x = carrier.x + 0.5;
    others[1].z = carrier.z;
    updateWorld(w, idle(w), DT);
    expect(others[1].egg).toBe(true);
    expect(carrier.egg).toBe(false);
    // The new carrier is caught: out, and the egg moves on.
    w.snakes[0].stunTimer = 0;
    catchBy(w, others[1]);
    expect(others[1].out).toBe(true);
    expect(w.players.filter((p) => p.egg)).toHaveLength(1);
  });

  it('the last one left wins', () => {
    const w = createMatchWorld(settings({ mode: 'hotEgg' }), 2, 5);
    const carrier = w.players.find((p) => p.egg);
    if (!carrier) throw new Error('no carrier');
    catchBy(w, carrier);
    expect(w.match?.winners).toEqual([w.players.find((p) => p !== carrier)?.id]);
  });
});

describe('Escape Race', () => {
  it('the exit is open from the start; the first one out wins', () => {
    const w = createMatchWorld(settings({ mode: 'escapeRace' }), 2, 5);
    expect(w.gateOpen).toBe(true);
    w.snakes[0].stunTimer = 100;
    const p = w.players[1];
    p.x = cellToWorld(w.grid, w.gate.x);
    p.z = cellToWorld(w.grid, w.gate.z);
    updateWorld(w, idle(w), DT);
    expect(p.escaped).toBe(true);
    expect(w.match?.winners).toEqual([1]);
  });

  it('caught: down a moment, then back at the start', () => {
    const w = createMatchWorld(settings({ mode: 'escapeRace' }), 2, 5);
    const p = w.players[0];
    park(w, w.players[1], 4);
    catchBy(w, p);
    expect(p.down).toBeGreaterThan(0);
    w.snakes[0].stunTimer = 100;
    for (let t = 0; t < (BALANCE.multiplayer.escapeRace.downSeconds + 0.2) / DT; t++) updateWorld(w, idle(w), DT);
    expect(p.down).toBe(0);
    expect(worldToCell(w.grid, p.x)).toBe(w.match?.spawns[0].x);
  });
});

describe('single player is unchanged', () => {
  it('a one-player world without a match still plays the campaign rules', () => {
    const w = createWorld(LEVELS[0], 3);
    expect(w.match).toBeNull();
    expect(w.players).toHaveLength(1);
    updateWorld(w, NO_INPUT, DT);
    expect(w.status).toBe('playing');
  });
});

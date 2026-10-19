import { BALANCE } from '../config/balance';
import { playerAtGate } from './goals';
import { cellToWorld, inBounds, worldToCell } from './grid';
import { onFoot } from './hunt';
import { endRound } from './match';
import type { ModeId } from './match';
import { takeControl } from './pilot';
import { makeSnake } from './snake';
import { blocksSnake } from './tiles';
import type { Cell, DeathCause, PlayerInput, PlayerState, SnakeState, World } from './types';
import { respawn } from './world';

/**
 * One multiplayer mode's rules. sim/world.ts calls these at fixed points of an update when
 * `world.match` is set; everything else (snakes, items, terrain) works as in the campaign.
 */
export interface ModeRules {
  /** After the arena is built: roles, the nest, the egg. */
  setup(world: World): void;
  /** After players move, before snakes step: reviving, passing the egg, rising as a snake. */
  beforeSnakes(world: World, inputs: readonly PlayerInput[], dt: number): void;
  /** Player `p` was caught by `by` (or drowned, or fell in). Replaces losing a campaign life. */
  caught(world: World, p: PlayerState, cause: DeathCause, by: SnakeState | null): void;
  /** Player `p` picked up a pellet. */
  pellet(world: World, p: PlayerState): void;
  /** End of the update: the clock, and whether the round is won or lost. */
  after(world: World, dt: number): void;
}

const mp = BALANCE.multiplayer;
const all = (world: World): number[] => world.players.map((p) => p.id);
const standing = (world: World): PlayerState[] => world.players.filter((p) => !p.out && p.snakeId === null);

/** Lie downed for `seconds`: no moving, nobody hunts you, what you carry is lost. */
function downPlayer(world: World, p: PlayerState, seconds: number): void {
  p.down = seconds;
  p.revive = 0;
  p.carrying = 0;
  p.vx = 0;
  p.vz = 0;
  world.events.push({ type: 'playerDowned', pid: p.id });
}

/** Knocked away from a snake's head, with a moment of grace: what a catch does when it does not count. */
function knockBack(world: World, p: PlayerState, by: SnakeState | null, dist: number, grace: number): void {
  if (by) {
    const head = by.pos[0];
    let dx = p.x - head.x;
    let dz = p.z - head.z;
    if (Math.hypot(dx, dz) < 0.05) {
      // Right on its head: thrown the way it is facing.
      const neck = by.pos[1] ?? { x: head.x - 1, z: head.z };
      dx = head.x - neck.x;
      dz = head.z - neck.z;
    }
    const d = Math.hypot(dx, dz) || 1;
    const lim = world.grid.half - BALANCE.player.radius;
    p.x = Math.min(lim, Math.max(-lim, p.x + (dx / d) * dist));
    p.z = Math.min(lim, Math.max(-lim, p.z + (dz / d) * dist));
  }
  p.graceTimer = grace;
}

/** Shared by every mode: the round clock (and a ramping snake speed); a pilot's position follows its snake. */
function tick(world: World, dt: number): boolean {
  const m = world.match;
  if (!m) return false;
  m.timeLeft = Math.max(0, m.timeLeft - dt);
  if (m.settings.snakeSpeed === 'ramping') {
    const t = 1 - m.timeLeft / m.roundLength;
    m.speedScale = mp.speed.rampFrom + (mp.speed.rampTo - mp.speed.rampFrom) * t;
  }
  for (const p of world.players) {
    if (p.snakeId === null) continue;
    const s = world.snakes.find((q) => q.id === p.snakeId);
    if (s) {
      p.x = s.pos[0].x;
      p.z = s.pos[0].z;
    }
  }
  return m.timeLeft <= 0;
}

/** Nobody downed or caught is left standing: everyone is down (or out) at once. */
const everyoneDown = (world: World): boolean => world.players.every((p) => p.out || p.down > 0);

/**
 * Classic co-op: everyone runs from the AI snake (longer with more players). Caught, you are downed
 * for a while; a teammate standing beside you gets you up. The snake hunts the nearest player, or
 * whoever hit it last. Win by carrying pellets to the nest until it is full, or by shrinking the
 * snake away. Lose when everyone is down at once, or when the clock runs out.
 */
const classic: ModeRules = {
  setup(world) {
    const m = world.match;
    if (!m) return;
    const { start } = world.level;
    m.nest = { x: start.x, z: start.z, filled: 0, need: mp.classic.nestBase + mp.classic.nestPerPlayer * world.players.length };
  },
  beforeSnakes(world, _inputs, dt) {
    const cfg = mp.classic;
    for (const p of world.players) {
      if (p.out || p.down <= 0) continue;
      p.down = Math.max(0, p.down - dt);
      const helper = world.players.find((q) => q !== p && onFoot(q) && Math.hypot(q.x - p.x, q.z - p.z) <= cfg.reviveRange);
      p.revive = helper ? p.revive + dt / cfg.reviveSeconds : 0;
      if (helper && p.revive >= 1) {
        // Up where they lay, with a moment of grace.
        p.down = 0;
        p.revive = 0;
        p.graceTimer = BALANCE.lives.respawnGrace;
        world.events.push({ type: 'playerRevived', pid: p.id, by: helper.id });
      } else if (p.down <= 0) {
        p.revive = 0;
        respawn(world, p);
        world.events.push({ type: 'playerRevived', pid: p.id, by: -1 });
      }
    }
  },
  caught(world, p) {
    downPlayer(world, p, mp.classic.downSeconds);
  },
  pellet(_world, p) {
    p.carrying = Math.min(mp.classic.carryMax, p.carrying + 1);
  },
  after(world, dt) {
    const m = world.match;
    if (!m?.nest) return;
    const nx = cellToWorld(world.grid, m.nest.x);
    const nz = cellToWorld(world.grid, m.nest.z);
    for (const p of world.players) {
      if (!onFoot(p) || p.carrying <= 0 || Math.hypot(p.x - nx, p.z - nz) > mp.classic.nestRadius) continue;
      m.nest.filled = Math.min(m.nest.need, m.nest.filled + p.carrying);
      world.events.push({ type: 'nestFilled', pid: p.id, count: p.carrying, filled: m.nest.filled, need: m.nest.need });
      p.carrying = 0;
    }
    const timeUp = tick(world, dt);
    if (m.nest.filled >= m.nest.need) endRound(world, all(world), 'The nest is full');
    else if (world.snakes.length === 0) endRound(world, all(world), 'The snake is beaten');
    else if (everyoneDown(world)) endRound(world, [], 'Everyone went down');
    else if (timeUp) endRound(world, [], 'Out of time');
  },
};

/**
 * Snake and Players: one player is the snake (it steers, sim/pilot.ts), the rest run. A catch costs
 * a runner a life and grows the snake; out of lives, they watch. Runners win by surviving the clock
 * or shrinking the snake away; the snake wins when every runner is out. The role rotates each round.
 */
const snakeAndPlayers: ModeRules = {
  setup(world) {
    const m = world.match;
    if (!m) return;
    const pilot = world.players[(m.round - 1) % world.players.length];
    m.snakePilot = pilot.id;
    world.snakes.splice(1);
    takeControl(world.snakes[0], pilot);
    for (const p of world.players) if (p !== pilot) p.lives = mp.snakeAndPlayers.lives;
  },
  beforeSnakes() {},
  caught(world, p, cause, by) {
    if (by) by.pendingGrow += mp.snakeAndPlayers.growOnCatch;
    p.lives = Math.max(0, p.lives - 1);
    if (p.lives > 0) {
      respawn(world, p);
      world.events.push({ type: 'lifeLost', pid: p.id, cause, livesLeft: p.lives });
    } else {
      p.out = true;
      world.events.push({ type: 'playerOut', pid: p.id });
    }
  },
  pellet() {},
  after(world, dt) {
    const m = world.match;
    if (!m) return;
    const timeUp = tick(world, dt);
    const runners = world.players.filter((p) => p.id !== m.snakePilot);
    const alive = runners.filter((p) => !p.out).map((p) => p.id);
    const pilot = world.players[m.snakePilot];
    if (!world.snakes.some((s) => s.id === pilot.snakeId)) endRound(world, runners.map((p) => p.id), 'The snake is beaten');
    else if (alive.length === 0) endRound(world, [pilot.id], 'The snake caught everyone');
    else if (timeUp) endRound(world, alive, 'The runners held out');
  },
};

/** A free chain of `length` cells starting at `from` (walking to free neighbors), for a new snake. Null if there is no room. */
function freeChain(world: World, from: Cell, length: number): Cell[] | null {
  const n = world.grid.size;
  const taken = new Set<number>();
  for (const s of world.snakes) for (const c of s.cells) taken.add(c.z * n + c.x);
  const free = (x: number, z: number): boolean => inBounds(world.grid, x, z) && !world.pillars[z * n + x] && !blocksSnake(world.tiles[z * n + x]) && !taken.has(z * n + x);
  // Nearest free cell to start from.
  let start: Cell | null = null;
  for (let r = 0; r < 6 && !start; r++) {
    for (let dz = -r; dz <= r && !start; dz++) for (let dx = -r; dx <= r && !start; dx++) if (free(from.x + dx, from.z + dz)) start = { x: from.x + dx, z: from.z + dz };
  }
  if (!start) return null;
  const cells = [start];
  taken.add(start.z * n + start.x);
  while (cells.length < length) {
    const last = cells[cells.length - 1];
    const next = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).map(([dx, dz]) => ({ x: last.x + dx, z: last.z + dz })).find((c) => free(c.x, c.z));
    if (!next) break;
    cells.push(next);
    taken.add(next.z * n + next.x);
  }
  return cells.length >= 3 ? cells : null;
}

/**
 * Infection: one AI snake to start. Everyone it catches rises as a snake of their own (after a
 * moment) and hunts the rest. The last human standing wins; when the clock runs out, every human
 * still standing wins.
 */
const infection: ModeRules = {
  setup() {},
  beforeSnakes(world, _inputs, dt) {
    const m = world.match;
    if (!m) return;
    for (let i = m.infecting.length - 1; i >= 0; i--) {
      const e = m.infecting[i];
      e.t -= dt;
      if (e.t > 0) continue;
      m.infecting.splice(i, 1);
      const p = world.players[e.id];
      const at = { x: worldToCell(world.grid, p.x), z: worldToCell(world.grid, p.z) };
      const cells = freeChain(world, at, mp.infection.snakeLength) ?? freeChain(world, world.level.snake.spawn, mp.infection.snakeLength);
      p.down = 0;
      if (!cells) {
        p.out = true;
        continue;
      }
      const snake = makeSnake(world, world.nextSnakeId++, cells);
      world.snakes.push(snake);
      takeControl(snake, p);
    }
  },
  caught(world, p) {
    const m = world.match;
    if (!m) return;
    // Lies there a moment, then rises as a snake.
    p.down = mp.infection.infectDelay;
    p.vx = 0;
    p.vz = 0;
    m.infecting.push({ id: p.id, t: mp.infection.infectDelay });
    world.events.push({ type: 'playerInfected', pid: p.id });
  },
  pellet() {},
  after(world, dt) {
    const m = world.match;
    if (!m) return;
    const timeUp = tick(world, dt);
    // A player's snake that was beaten: they are out.
    for (const p of world.players) {
      if (p.snakeId !== null && !world.snakes.some((s) => s.id === p.snakeId)) {
        p.snakeId = null;
        p.out = true;
        world.events.push({ type: 'playerOut', pid: p.id });
      }
    }
    const humans = world.players.filter((p) => !p.out && p.snakeId === null && p.down <= 0 && !m.infecting.some((e) => e.id === p.id)).map((p) => p.id);
    if (humans.length <= 1) endRound(world, humans, humans.length ? 'Last human standing' : 'Everyone was infected');
    else if (timeUp) endRound(world, humans, 'The humans held out');
  },
};

/** Hand the egg to `to` (or nobody), with a pause before it can be passed again. */
function giveEgg(world: World, from: PlayerState | null, to: PlayerState | null): void {
  if (from) from.egg = false;
  if (to) to.egg = true;
  if (world.match) world.match.passCooldown = mp.hotEgg.passCooldown;
  world.events.push({ type: 'eggPassed', from: from?.id ?? -1, to: to?.id ?? -1 });
}

/**
 * Hot Egg: one player carries the snake's egg and the snake only hunts the carrier. Touch another
 * player to pass it. A carrier who gets caught is out and the egg goes to whoever is nearest. The
 * last player left wins; when the clock runs out, the carrier is out and the rest win.
 */
const hotEgg: ModeRules = {
  setup(world) {
    const first = world.players[world.rng.int(world.players.length)];
    first.egg = true;
  },
  beforeSnakes(world, _inputs, dt) {
    const m = world.match;
    if (!m) return;
    m.passCooldown = Math.max(0, m.passCooldown - dt);
    const carrier = world.players.find((p) => p.egg && onFoot(p));
    if (!carrier || m.passCooldown > 0) return;
    const to = world.players.find((q) => q !== carrier && onFoot(q) && Math.hypot(q.x - carrier.x, q.z - carrier.z) <= mp.hotEgg.passRange);
    if (to) giveEgg(world, carrier, to);
  },
  caught(world, p, _cause, by) {
    if (!p.egg) {
      // The snake only wants the egg: anyone else is just shoved aside.
      knockBack(world, p, by, mp.hotEgg.knockback, mp.hotEgg.grace);
      return;
    }
    p.out = true;
    world.events.push({ type: 'playerOut', pid: p.id });
    let next: PlayerState | null = null;
    let best = Infinity;
    for (const q of world.players) {
      if (q === p || !onFoot(q)) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < best) {
        best = d;
        next = q;
      }
    }
    giveEgg(world, p, next);
  },
  pellet() {},
  after(world, dt) {
    const timeUp = tick(world, dt);
    const left = standing(world);
    if (left.length <= 1) endRound(world, left.map((p) => p.id), 'Last one left');
    else if (timeUp) {
      const carrier = left.find((p) => p.egg);
      if (carrier) {
        carrier.out = true;
        carrier.egg = false;
      }
      endRound(world, left.filter((p) => p !== carrier).map((p) => p.id), 'Time: the carrier is out');
    }
  },
};

/**
 * Escape Race: everyone races for one open exit while the snake hunts the whole field. Caught, you
 * are down a moment, then back at the start. Firecrackers drop often: throw one near a rival to send
 * the snake their way. The first one out wins.
 */
const escapeRace: ModeRules = {
  setup(world) {
    world.gateOpen = true;
  },
  beforeSnakes(world, _inputs, dt) {
    for (const p of world.players) {
      if (p.out || p.down <= 0) continue;
      p.down = Math.max(0, p.down - dt);
      if (p.down <= 0) respawn(world, p);
    }
  },
  caught(world, p) {
    downPlayer(world, p, mp.escapeRace.downSeconds);
  },
  pellet() {},
  after(world, dt) {
    const timeUp = tick(world, dt);
    const out = world.players.find((p) => onFoot(p) && playerAtGate(world, p));
    if (out) {
      out.escaped = true;
      out.out = true;
      world.events.push({ type: 'playerEscaped', pid: out.id });
      endRound(world, [out.id], 'First one out');
    } else if (timeUp) endRound(world, [], 'Nobody got out');
  },
};

export const MODES: Record<ModeId, ModeRules> = { classic, snakeAndPlayers, infection, hotEgg, escapeRace };

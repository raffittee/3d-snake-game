/**
 * What the game server and the browser say to each other (plain TypeScript, shared by both; no DOM,
 * no three.js). The lobby rides on Colyseus room state (src/net/schema.ts); the match on messages:
 * the client sends its inputs, the server sends snapshots of everything that moves.
 *
 * A snapshot is compact: numbers are quantized to integers (thousandths) and records are arrays in
 * a fixed field order, so 4 players and their snakes fit in a few kilobytes 20 times a second.
 * Static things (the arena) are never sent: the client builds the same arena from the same
 * settings and seed (sim/match.ts).
 */
import { ITEMS } from '../items';
import { computeSegmentPositions } from '../sim/snake';
import type { MatchState } from '../sim/match';
import type { DeathCause, HeldItem, ItemId, PlayerInput, PlayerState, SimEvent, SnakeState, Tier, World } from '../sim/types';

/** Message names. */
export const MSG = {
  /** client -> server: one tick's input. */
  input: 'in',
  /** server -> client: a snapshot. */
  snapshot: 'snap',
  /** server -> client: a round starts (build the arena). */
  start: 'start',
  /** host -> server: change lobby settings. */
  settings: 'settings',
  /** host -> server: start the match. */
  begin: 'begin',
  /** host -> server: mute (or unmute) a player's voice for everyone. */
  hostMute: 'hostMute',
  /** client <-> server: WebRTC voice setup, relayed to one other player. */
  rtc: 'rtc',
  /** server -> client: the match is over for good (host left, or all rounds played). */
  ended: 'ended',
} as const;

/** Server tick (the sim's fixed step) and snapshot rate. */
export const TICK_HZ = 30;
export const TICK_DT = 1 / TICK_HZ;
export const SNAPSHOT_MS = 50;

/** Room codes: 6 characters with no look-alikes (no 0/O, 1/I/L). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

/** A fresh room code. `random` is any 0..1 source (the server's crypto; tests pass a seeded one). */
export function makeRoomCode(random: () => number): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return s;
}

/** Tidy what someone typed into a code: upper case, anything not in a code (spaces, dashes) dropped. */
export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .split('')
    .filter((c) => CODE_ALPHABET.includes(c))
    .join('')
    .slice(0, CODE_LENGTH);
}

/** A player name: trimmed, printable, at most 16 characters. */
export function normalizeName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) : '';
  return s || 'Player';
}

// ---- Inputs -------------------------------------------------------------------------------

/**
 * One tick of input on the wire. View direction is absolute (`yaw`, `pitch`), not a delta, so a lost
 * or repeated packet never turns you; the server turns it back into the deltas the sim reads.
 */
export type NetInput = [seq: number, forward: number, strafe: number, flags: number, selectSlot: number, cycleSlot: number, yaw: number, pitch: number];

const F_SPRINT = 1;
const F_JUMP = 2;
const F_USE = 4;
const F_INTERACT = 8;

const q = (v: number): number => Math.round(v * 1000);
const uq = (v: number): number => v / 1000;

export function packInput(seq: number, input: PlayerInput, yaw: number, pitch: number): NetInput {
  const flags = (input.sprint ? F_SPRINT : 0) | (input.jump ? F_JUMP : 0) | (input.useItem ? F_USE : 0) | (input.interact ? F_INTERACT : 0);
  return [seq, q(input.forward), q(input.strafe), flags, input.selectSlot, input.cycleSlot, q(yaw), q(pitch)];
}

const clampNum = (v: unknown, lo: number, hi: number, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/** A wire input, checked (a hostile client cannot send anything odd), and its sequence number. */
export function unpackInput(raw: unknown): { seq: number; input: PlayerInput; yaw: number; pitch: number } | null {
  if (!Array.isArray(raw) || raw.length !== 8) return null;
  const flags = clampNum(raw[3], 0, 15) | 0;
  return {
    seq: clampNum(raw[0], 0, Number.MAX_SAFE_INTEGER) | 0,
    input: {
      forward: uq(clampNum(raw[1], -1000, 1000)),
      strafe: uq(clampNum(raw[2], -1000, 1000)),
      sprint: !!(flags & F_SPRINT),
      jump: !!(flags & F_JUMP),
      useItem: !!(flags & F_USE),
      interact: !!(flags & F_INTERACT),
      selectSlot: clampNum(raw[4], -1, 8) | 0,
      cycleSlot: clampNum(raw[5], -8, 8) | 0,
      turn: 0,
      lookYaw: 0,
      lookPitch: 0,
    },
    yaw: uq(clampNum(raw[6], -1e9, 1e9)),
    pitch: uq(clampNum(raw[7], -2000, 2000)),
  };
}

/**
 * The sim input for `p` this tick: the deltas that turn their view to the absolute `yaw`/`pitch` sent.
 * Key turning is already in that yaw (the client folds it in), so `turn` is 0.
 */
export function toSimInput(p: Pick<PlayerState, 'yaw' | 'pitch'>, input: PlayerInput, yaw: number, pitch: number): PlayerInput {
  return { ...input, turn: 0, lookYaw: yaw - p.yaw, lookPitch: pitch - p.pitch };
}

// ---- Snapshots ----------------------------------------------------------------------------

const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
const TIERS: readonly Tier[] = ['white', 'blue', 'gold'];
const CAUSES: readonly DeathCause[] = ['caught', 'crushed', 'drowned', 'fell'];
const BURROW = ['up', 'down', 'rising'] as const;

const PLAYER_BOOLS = ['swimming', 'inMud', 'onIce', 'hidden', 'tired', 'moving', 'sprinting', 'secondWindUsed', 'out', 'egg', 'escaped'] as const;
const PLAYER_NUMS = ['x', 'z', 'y', 'vy', 'vx', 'vz', 'yaw', 'pitch', 'stamina', 'energy', 'cleats', 'battery', 'graceTimer', 'noise', 'slam', 'down', 'revive'] as const;
const PLAYER_INTS = ['selectedSlot', 'lives', 'pellets', 'carrying'] as const;

const packHeld = (h: HeldItem | null): number[] | 0 => (h ? [ITEM_IDS.indexOf(h.item), TIERS.indexOf(h.tier), q(h.uses), q(h.spoilLeft), q(h.spoilTotal)] : 0);
const unpackHeld = (a: number[] | 0): HeldItem | null => (a ? { item: ITEM_IDS[a[0]], tier: TIERS[a[1]], uses: uq(a[2]), spoilLeft: uq(a[3]), spoilTotal: uq(a[4]) } : null);

function packPlayer(p: PlayerState): unknown[] {
  let bits = 0;
  PLAYER_BOOLS.forEach((k, i) => {
    if (p[k]) bits |= 1 << i;
  });
  return [p.id, bits, PLAYER_NUMS.map((k) => q(p[k])), PLAYER_INTS.map((k) => p[k]), p.killerId ?? -1, p.snakeId ?? -1, p.inventory.map(packHeld)];
}

function unpackPlayer(a: unknown[], into: PlayerState): void {
  const [, bits, nums, ints, killer, snakeId, inv] = a as [number, number, number[], number[], number, number, Array<number[] | 0>];
  PLAYER_BOOLS.forEach((k, i) => {
    into[k] = !!(bits & (1 << i));
  });
  PLAYER_NUMS.forEach((k, i) => {
    into[k] = uq(nums[i]);
  });
  PLAYER_INTS.forEach((k, i) => {
    into[k] = ints[i];
  });
  into.killerId = killer < 0 ? null : killer;
  into.snakeId = snakeId < 0 ? null : snakeId;
  into.inventory = inv.map(unpackHeld);
}

const flatCells = (cells: Array<{ x: number; z: number }>): number[] => cells.flatMap((c) => [c.x, c.z]);
const cellsOf = (flat: number[]): Array<{ x: number; z: number }> => {
  const out: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < flat.length; i += 2) out.push({ x: flat[i], z: flat[i + 1] });
  return out;
};

/**
 * How far along its current step the snake is drawn (0..1): the same for every segment. Read back
 * from its positions rather than its timer, because a frozen snake (stunned, rising from the sand)
 * keeps the positions of the moment it froze.
 */
function stepProgress(s: SnakeState, grid: World['grid']): number {
  for (let i = 0; i < s.cells.length; i++) {
    const a = s.prev[i];
    const b = s.cells[i];
    const p = s.pos[i];
    if (!a || !p || (a.x === b.x && a.z === b.z)) continue;
    const ax = (a.x + 0.5) * grid.cell - grid.half;
    const az = (a.z + 0.5) * grid.cell - grid.half;
    const span = a.x !== b.x ? (b.x - a.x) * grid.cell : (b.z - a.z) * grid.cell;
    return Math.min(1, Math.max(0, a.x !== b.x ? (p.x - ax) / span : (p.z - az) / span));
  }
  return 0;
}

function packSnake(s: SnakeState, grid: World['grid']): unknown[] {
  return [
    s.id,
    flatCells(s.cells),
    flatCells(s.prev),
    s.under.map((u) => (u ? 1 : 0)).join(''),
    [q(s.timer), q(s.interval), q(s.stunTimer), s.stump, q(s.splitWarn), q(s.bornAt), q(s.coil), q(s.heading), q(s.dash), q(s.cooldowns.dash), q(s.cooldowns.burrow), q(s.cooldowns.whip), s.pendingGrow, q(s.growTimer), s.steps, s.prey, BURROW.indexOf(s.burrow.mode), q(s.burrow.t)],
    s.striking ? 1 : 0,
    s.pilot ?? -1,
    s.lure ? [s.lure.x, s.lure.z, q(s.lure.time)] : 0,
    s.lurk ? [s.lurk.x, s.lurk.z] : 0,
    s.aggro ? [s.aggro.id, q(s.aggro.time)] : 0,
    q(stepProgress(s, grid)),
  ];
}

function unpackSnake(a: unknown[], grid: World['grid'], into?: SnakeState): SnakeState {
  const [id, cells, prev, under, n, striking, pilot, lure, lurk, aggro, progress] = a as [number, number[], number[], string, number[], number, number, number[] | 0, number[] | 0, number[] | 0, number];
  const s = (into ?? { pos: [] }) as SnakeState;
  s.id = id;
  s.cells = cellsOf(cells);
  s.prev = cellsOf(prev);
  s.under = under.split('').map((c) => c === '1');
  [s.timer, s.interval, s.stunTimer] = [uq(n[0]), uq(n[1]), uq(n[2])];
  s.stump = n[3];
  s.splitWarn = uq(n[4]);
  s.bornAt = uq(n[5]);
  s.coil = uq(n[6]);
  s.heading = uq(n[7]);
  s.dash = uq(n[8]);
  s.cooldowns = { dash: uq(n[9]), burrow: uq(n[10]), whip: uq(n[11]) };
  s.pendingGrow = n[12];
  s.growTimer = uq(n[13]);
  s.steps = n[14];
  s.prey = n[15];
  s.burrow = { mode: BURROW[n[16]] ?? 'up', t: uq(n[17]) };
  s.striking = !!striking;
  s.pilot = pilot < 0 ? null : pilot;
  s.lure = lure ? { x: lure[0], z: lure[1], time: uq(lure[2]) } : null;
  s.lurk = lurk ? { x: lurk[0], z: lurk[1] } : null;
  s.aggro = aggro ? { id: aggro[0], time: uq(aggro[1]) } : null;
  // Drawn exactly where the server has it; the client's own step clock runs on from there.
  const t = uq(progress);
  computeSegmentPositions(s, grid, t);
  s.timer = t * s.interval;
  return s;
}

/** Everything in a snapshot. `tiles` and `doors` only come when they changed (or on a keyframe). */
export interface Snapshot {
  /** Server tick, and per player the last input sequence it has applied (for prediction). */
  tick: number;
  acks: number[];
  players: unknown[][];
  snakes: unknown[][];
  severed: Array<[number, number[], number, number, number]>;
  pellets: number[];
  drops: number[];
  projectiles: number[];
  firecrackers: number[];
  smokes: number[];
  mongooses: number[];
  cracking: number[];
  relics: number[];
  relicsTaken: number[];
  world: number[];
  status: number;
  match: MatchState | null;
  events: SimEvent[];
  tiles?: Uint8Array;
  doors?: Uint8Array;
  /** Doors a snake has bashed at: [cell index, damage] pairs (most levels have none). */
  doorDamage?: number[];
}

const STATUS = ['playing', 'dead', 'complete'] as const;

/** Pack what moves in `world` for the wire. `withTiles` adds the ground and the doors (they rarely change). */
export function encodeSnapshot(world: World, tick: number, acks: number[], events: SimEvent[], withTiles: boolean): Snapshot {
  const snap: Snapshot = {
    tick,
    acks,
    players: world.players.map(packPlayer),
    snakes: world.snakes.map((s) => packSnake(s, world.grid)),
    severed: world.severed.map((s) => [s.id, s.pos.flatMap((p) => [q(p.x), q(p.z)]), q(s.life), q(s.total), s.hasTail ? 1 : 0]),
    pellets: world.pellets.flatMap((p) => [p.id, p.x, p.z]),
    drops: world.drops.flatMap((d) => [d.id, ITEM_IDS.indexOf(d.item), TIERS.indexOf(d.tier), d.x, d.z]),
    projectiles: world.projectiles.flatMap((p) => [p.kind === 'stone' ? 0 : 1, q(p.x), q(p.y), q(p.z), q(p.vx), q(p.vy), q(p.vz), q(p.life), p.owner]),
    firecrackers: world.firecrackers.flatMap((f) => [q(f.x), q(f.z), q(f.fuse), q(f.total)]),
    smokes: world.smokes.flatMap((s) => [q(s.x), q(s.z), q(s.time)]),
    mongooses: world.mongooses.flatMap((m) => [m.id, q(m.x), q(m.z), q(m.time), m.targetId ?? -1, m.fighting ? 1 : 0, m.owner]),
    cracking: world.cracking.flatMap((c) => [c.i, q(c.t)]),
    relics: flatCells(world.relics),
    relicsTaken: flatCells(world.relicsTaken),
    world: [q(world.elapsed), world.pelletsCollected, world.relicsFound, world.gateOpen ? 1 : 0, world.bossPhase, world.stormWarned, world.deathCause ? CAUSES.indexOf(world.deathCause) : -1, ...world.boosts.map(q)],
    status: STATUS.indexOf(world.status),
    match: world.match,
    events,
  };
  if (withTiles) {
    snap.tiles = world.tiles.slice();
    snap.doors = world.doorState.slice();
  }
  // Sparse and small, so it goes every time.
  const damage: number[] = [];
  world.doorDamage.forEach((d, i) => {
    if (d > 0) damage.push(i, q(d));
  });
  snap.doorDamage = damage;
  return snap;
}

/** Overwrite everything that moves in the client's `world` with the server's snapshot. */
export function applySnapshot(world: World, snap: Snapshot): void {
  for (const a of snap.players) {
    const p = world.players[a[0] as number];
    if (p) unpackPlayer(a, p);
  }
  // Keep snake objects by id, so the renderer's per-snake state (slither, skin offset) carries on.
  const old = new Map(world.snakes.map((s) => [s.id, s]));
  world.snakes = snap.snakes.map((a) => unpackSnake(a, world.grid, old.get(a[0] as number)));
  world.severed = snap.severed.map(([id, flat, life, total, tail]) => {
    const pos: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < flat.length; i += 2) pos.push({ x: uq(flat[i]), z: uq(flat[i + 1]) });
    return { id, pos, life: uq(life), total: uq(total), hasTail: !!tail };
  });
  world.pellets = [];
  for (let i = 0; i < snap.pellets.length; i += 3) world.pellets.push({ id: snap.pellets[i], x: snap.pellets[i + 1], z: snap.pellets[i + 2] });
  world.drops = [];
  for (let i = 0; i < snap.drops.length; i += 5) world.drops.push({ id: snap.drops[i], item: ITEM_IDS[snap.drops[i + 1]], tier: TIERS[snap.drops[i + 2]], x: snap.drops[i + 3], z: snap.drops[i + 4] });
  world.projectiles = [];
  const pr = snap.projectiles;
  for (let i = 0; i < pr.length; i += 9) world.projectiles.push({ kind: pr[i] ? 'firecracker' : 'stone', x: uq(pr[i + 1]), y: uq(pr[i + 2]), z: uq(pr[i + 3]), vx: uq(pr[i + 4]), vy: uq(pr[i + 5]), vz: uq(pr[i + 6]), life: uq(pr[i + 7]), owner: pr[i + 8] });
  world.firecrackers = [];
  const fc = snap.firecrackers;
  for (let i = 0; i < fc.length; i += 4) world.firecrackers.push({ x: uq(fc[i]), z: uq(fc[i + 1]), fuse: uq(fc[i + 2]), total: uq(fc[i + 3]) });
  world.smokes = [];
  for (let i = 0; i < snap.smokes.length; i += 3) world.smokes.push({ x: uq(snap.smokes[i]), z: uq(snap.smokes[i + 1]), time: uq(snap.smokes[i + 2]) });
  world.mongooses = [];
  const mg = snap.mongooses;
  for (let i = 0; i < mg.length; i += 7) world.mongooses.push({ id: mg[i], x: uq(mg[i + 1]), z: uq(mg[i + 2]), time: uq(mg[i + 3]), targetId: mg[i + 4] < 0 ? null : mg[i + 4], fighting: !!mg[i + 5], owner: mg[i + 6] });
  world.cracking = [];
  for (let i = 0; i < snap.cracking.length; i += 2) world.cracking.push({ i: snap.cracking[i], t: uq(snap.cracking[i + 1]) });
  world.relics = cellsOf(snap.relics);
  world.relicsTaken = cellsOf(snap.relicsTaken);
  const [elapsed, pellets, relicsFound, gateOpen, bossPhase, stormWarned, cause, ...boosts] = snap.world;
  world.elapsed = uq(elapsed);
  world.pelletsCollected = pellets;
  world.relicsFound = relicsFound;
  world.gateOpen = !!gateOpen;
  world.bossPhase = bossPhase;
  world.stormWarned = stormWarned;
  world.deathCause = cause < 0 ? null : CAUSES[cause];
  world.boosts = boosts.map(uq);
  world.status = STATUS[snap.status] ?? 'playing';
  world.match = snap.match;
  if (snap.tiles) world.tiles.set(snap.tiles);
  if (snap.doors) world.doorState.set(snap.doors);
  if (snap.doorDamage) {
    world.doorDamage.fill(0);
    for (let i = 0; i < snap.doorDamage.length; i += 2) world.doorDamage[snap.doorDamage[i]] = uq(snap.doorDamage[i + 1]);
  }
}

/** What the server tells everyone when a round starts: enough to build the same arena. */
export interface RoundStart {
  seed: number;
  settings: import('../sim/match').MatchSettings;
  /** Players in the match (ids 0..count-1), and which one you are. */
  count: number;
  you: number;
  round: number;
  points: number[];
  /** Names by player id, for name tags and the scoreboard. */
  names: string[];
}

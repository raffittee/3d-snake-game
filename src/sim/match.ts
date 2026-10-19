import { BALANCE } from '../config/balance';
import { LEVELS } from '../levels';
import type { Goal, LevelConfig, TerrainId } from '../levels/types';
import { inBounds } from './grid';
import { MODES } from './modes';
import { blocksSnake } from './tiles';
import type { Cell, World } from './types';
import { createWorld } from './world';

/** The five multiplayer modes (docs/GAME_DESIGN.md, Multiplayer). */
export type ModeId = 'classic' | 'snakeAndPlayers' | 'infection' | 'hotEgg' | 'escapeRace';

export const MODE_IDS: readonly ModeId[] = ['classic', 'snakeAndPlayers', 'infection', 'hotEgg', 'escapeRace'];

/** What the host picks in the lobby. */
export interface MatchSettings {
  terrain: TerrainId;
  mode: ModeId;
  mapSize: 64 | 80 | 96;
  snakeSpeed: 'slow' | 'normal' | 'fast' | 'ramping';
  rounds: 1 | 3 | 5;
  roundMinutes: 3 | 5 | 8;
  items: 'on' | 'off' | 'rare';
  /** Proximity voice: voices fade with distance and muffle behind walls (client side only). */
  proximityVoice: boolean;
}

export const DEFAULT_SETTINGS: MatchSettings = {
  terrain: 'plains',
  mode: 'classic',
  mapSize: 64,
  snakeSpeed: 'normal',
  rounds: 3,
  roundMinutes: 5,
  items: 'on',
  proximityVoice: false,
};

/** Every value the lobby offers for each setting, in display order. The server only accepts these. */
export const SETTING_OPTIONS = {
  terrain: LEVELS.map((l) => l.terrain),
  mode: MODE_IDS,
  mapSize: [64, 80, 96],
  snakeSpeed: ['slow', 'normal', 'fast', 'ramping'],
  rounds: [1, 3, 5],
  roundMinutes: [3, 5, 8],
  items: ['on', 'off', 'rare'],
  proximityVoice: [false, true],
} as const satisfies { [K in keyof MatchSettings]: readonly MatchSettings[K][] };

/** Keep only allowed values; anything else falls back to the default. A hostile client cannot send the server anything odd. */
export function sanitizeSettings(raw: unknown): MatchSettings {
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  for (const key of Object.keys(SETTING_OPTIONS) as Array<keyof MatchSettings>) {
    const allowed = SETTING_OPTIONS[key] as readonly unknown[];
    if (allowed.includes(src[key])) out[key] = src[key];
  }
  return out as unknown as MatchSettings;
}

/** The fewest players a mode makes sense with (the lobby greys Start out until then). */
export function minPlayers(mode: ModeId): number {
  return mode === 'classic' ? 1 : 2;
}

/** One round's rules and timers, on `world.match`. */
export interface MatchState {
  mode: ModeId;
  settings: MatchSettings;
  /** 1-based round number, and the round count. */
  round: number;
  rounds: number;
  /** Seconds left in this round, and its full length. */
  timeLeft: number;
  roundLength: number;
  /** Snake step time multiplier from the Snake speed setting. */
  speedScale: number;
  /** How much longer the snake may grow than the terrain's own cap (Classic scales it with players). */
  extraLength: number;
  /** Where each player starts and respawns (by id). */
  spawns: Cell[];
  /** Drop rate from the Items setting (0 = no drops). */
  itemRate: number;
  /** Hot Egg: the snakes only hunt the egg carrier. */
  eggHunt: boolean;
  /** Seconds before the egg can be passed again. */
  passCooldown: number;
  /** Classic: the nest (a grid cell) and how full it is. */
  nest: { x: number; z: number; filled: number; need: number } | null;
  /** Snake and Players: whose turn it is to be the snake. -1 otherwise. */
  snakePilot: number;
  /** Infection: players caught and waiting to rise as snakes (id, seconds left). */
  infecting: Array<{ id: number; t: number }>;
  /** Set when the round ends: who won it (empty = the snakes did), and why. */
  winners: number[] | null;
  reason: string;
  /** Points per player id across the rounds so far (a round win is a point). */
  points: number[];
}

/** Grid size every terrain is laid out at for a given map setting. */
function scaleCell(c: Cell, k: number, n: number): Cell {
  return { x: Math.min(n - 2, Math.max(1, Math.round(c.x * k))), z: Math.min(n - 2, Math.max(1, Math.round(c.z * k))) };
}

/**
 * The campaign level for `settings.terrain`, scaled to the map size and turned into an arena for a
 * match: its own goal never ends the round (the mode does), the boss fight is off, the minimap is on,
 * and drops follow the Items setting. Escape Race gets the terrain's own exit, opened from the start.
 */
export function matchLevel(settings: MatchSettings, players: number): LevelConfig {
  const base = LEVELS.find((l) => l.terrain === settings.terrain) ?? LEVELS[0];
  const n = settings.mapSize;
  const k = n / base.size;
  const extra = BALANCE.multiplayer.lengthPerPlayer * (settings.mode === 'classic' ? players - 1 : 0);
  const exitGoal: Goal = base.goal.kind === 'reachExit'
    ? { kind: 'reachExit' }
    : { kind: 'relicsThenGate', relics: 0, relic: 'idol', exit: base.goal.kind === 'relicsThenGate' ? (base.goal.exit ?? 'gate') : 'gate' };
  const drops = settings.mode === 'escapeRace'
    ? [...base.items.drops.filter((d) => d.item !== 'firecracker'), { item: 'firecracker' as const, weight: BALANCE.multiplayer.escapeRace.firecrackerWeight }]
    : base.items.drops;
  const snake = base.snake;
  return {
    ...base,
    id: `match-${base.terrain}`,
    size: n,
    pillarCount: Math.round(base.pillarCount * k * k),
    start: scaleCell(base.start, k, n),
    // Only Escape Race has an exit (it opens at the start); elsewhere no gate shows.
    gate: settings.mode === 'escapeRace' ? scaleCell(base.gate ?? { x: Math.floor(base.size / 2), z: 2 }, k, n) : undefined,
    landmarks: base.landmarks.map((l) => ({ ...l, cell: scaleCell(l.cell, k, n) })),
    snake: {
      ...snake,
      behavior: snake.behavior === 'coil' ? 'predict' : snake.behavior,
      boss: undefined,
      spawn: scaleCell(snake.spawn, k, n),
      extraSpawns: snake.extraSpawns?.map((c) => scaleCell(c, k, n)),
      startLength: snake.boss ? 8 : snake.startLength + extra,
      // Beatable in every mode: shrinking the snake is a way to win (Classic, Snake and Players).
      defeatable: true,
    },
    pelletCount: Math.round(base.pelletCount * k * k) + (settings.mode === 'classic' ? 2 * players : 0),
    // The tall-grass rule (pellets only in grass) stays; the corn maze's map does not exist here.
    minimap: { ...base.minimap, offUntilMap: false },
    items: { ...base.items, drops },
    goal: settings.mode === 'escapeRace' ? exitGoal : { kind: 'endless' },
  };
}

/** Free start cells beside the level's start, one per player, `spawnSpacing` apart. */
function spawnCells(world: World, count: number): Cell[] {
  const { start } = world.level;
  const n = world.grid.size;
  const free = (c: Cell): boolean => inBounds(world.grid, c.x, c.z) && !world.pillars[c.z * n + c.x] && !blocksSnake(world.tiles[c.z * n + c.x]);
  const gap = BALANCE.multiplayer.spawnSpacing;
  const order = [0, 1, -1, 2, -2, 3, -3];
  const out: Cell[] = [];
  for (const k of order) {
    if (out.length >= count) break;
    const c = { x: start.x + k * gap, z: start.z };
    out.push(free(c) ? c : { ...start });
  }
  return out;
}

/** Points so far (one per player), carried from the last round. */
export interface MatchCarry {
  round: number;
  points: number[];
}

/**
 * Build one round of a match: the arena (the same seed always gives the same one, so clients can
 * build it too), the players spread around the start, and the mode set up.
 */
export function createMatchWorld(settings: MatchSettings, players: number, seed: number, carry: MatchCarry = { round: 1, points: [] }): World {
  const level = matchLevel(settings, players);
  const world = createWorld(level, seed, [], players);
  const cfg = BALANCE.multiplayer;
  const length = settings.roundMinutes * 60;
  world.match = {
    mode: settings.mode,
    settings,
    round: carry.round,
    rounds: settings.rounds,
    timeLeft: length,
    roundLength: length,
    speedScale: settings.snakeSpeed === 'ramping' ? cfg.speed.rampFrom : cfg.speed[settings.snakeSpeed],
    extraLength: settings.mode === 'classic' ? cfg.maxLengthPerPlayer * (players - 1) : 0,
    spawns: spawnCells(world, players),
    itemRate: cfg.itemRate[settings.items],
    eggHunt: settings.mode === 'hotEgg',
    passCooldown: 0,
    nest: null,
    snakePilot: -1,
    infecting: [],
    winners: null,
    reason: '',
    points: Array.from({ length: players }, (_, i) => carry.points[i] ?? 0),
  };
  if (world.match.itemRate > 0) world.dropTimer = level.items.firstDropAfter / world.match.itemRate;
  // No relics to find (the maze's map and the house's key would just lie there); Escape Race's exit is open.
  world.relics = [];
  world.gateOpen = settings.mode === 'escapeRace';
  for (const p of world.players) {
    const c = world.match.spawns[p.id];
    p.x = (c.x + 0.5) * world.grid.cell - world.grid.half;
    p.z = (c.z + 0.5) * world.grid.cell - world.grid.half;
  }
  MODES[settings.mode].setup(world);
  return world;
}

/** End the round: `winners` get a point each. Sets the world's status so the sim stops. */
export function endRound(world: World, winners: number[], reason: string): void {
  const m = world.match;
  if (!m || m.winners) return;
  m.winners = winners;
  m.reason = reason;
  for (const id of winners) m.points[id] = (m.points[id] ?? 0) + 1;
  world.status = 'complete';
  world.events.push({ type: 'roundOver', winners, reason });
}

/** Whether the whole match is over after this round. */
export const matchOver = (m: MatchState): boolean => m.round >= m.rounds;

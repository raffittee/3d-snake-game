import type { LevelConfig } from '../levels/types';
import type { PerkId } from './perks';
import type { Grid } from './grid';
import type { Pathfinder } from './pathfinding';
import type { Rng } from './rng';
import type { MatchState } from './match';

/** A grid cell. */
export interface Cell {
  x: number;
  z: number;
}

/** A point in world units. */
export interface Vec2 {
  x: number;
  z: number;
}

export interface PlayerState {
  /** Stable id: the index in `world.players` (0 in single player). Events about this player carry it as `pid`. */
  id: number;
  x: number;
  z: number;
  /** Height of the feet above the floor, and vertical speed. 0 and 0 when standing. */
  y: number;
  vy: number;
  /** In deep water (only possible with a swim ring). */
  swimming: boolean;
  /** Standing in swamp mud (slow). */
  inMud: boolean;
  /** Seconds left of the energy drink: full stamina, sprinting costs nothing. */
  energy: number;
  /** On ice (Frozen lake): you slide. */
  onIce: boolean;
  /** Seconds left of the ice cleats: no sliding. */
  cleats: number;
  /** In a closet (Broken house): a snake only finds you from right beside you. */
  hidden: boolean;
  /** Horizontal velocity this frame (units/s), for the Predict snake. */
  vx: number;
  vz: number;
  /** Radians. Forward is -z at yaw 0. */
  yaw: number;
  pitch: number;
  /** 0..1 */
  stamina: number;
  tired: boolean;
  /** For view bob and footstep logic. */
  moving: boolean;
  sprinting: boolean;
  /** Inventory slots (BALANCE.items.slots), null when empty. Kept when a life is lost. */
  inventory: Array<HeldItem | null>;
  selectedSlot: number;
  /** Lives left in this level (or match), including the one being played. */
  lives: number;
  /** Seconds of post-respawn safety left. */
  graceTimer: number;
  /** Second wind already spent in this level. */
  secondWindUsed: boolean;
  /** How far (cells) this player's noise carries this frame (footsteps, a slammed door); 0 when silent. */
  noise: number;
  /** Seconds left of a door slam's noise. */
  slam: number;
  /** Flashlight battery, seconds (Dark cave); 0 = dark. Kept when you lose a life, like your items. */
  battery: number;
  /** The snake that last caught this player (for the death camera), or null. */
  killerId: number | null;
  /** Multiplayer (sim/modes.ts). Seconds left lying downed (Classic, Escape Race), 0 when up. A downed player cannot move or be caught. */
  down: number;
  /** Classic: how far (0..1) a teammate standing beside this downed player has got them up. */
  revive: number;
  /** Out of the round: caught for good, or escaped (Escape Race). Out players watch and are ignored by snakes. */
  out: boolean;
  /** Pellets this player picked up (multiplayer scores), and pellets carried to the nest (Classic). */
  pellets: number;
  carrying: number;
  /** The snake this player steers (Snake and Players, Infection), or null when on foot. */
  snakeId: number | null;
  /** Hot Egg: carrying the egg. */
  egg: boolean;
  /** Escape Race: reached the exit. */
  escaped: boolean;
}

/** What the player asked for this frame. Built by the input layer, read by the sim. */
export interface PlayerInput {
  /** -1..1 (can exceed 1 before normalizing). Positive is forward. */
  forward: number;
  /** Positive is right. */
  strafe: number;
  sprint: boolean;
  /** Jump was pressed this frame (an edge, not a held key). */
  jump: boolean;
  /** Use the selected item (an edge). */
  useItem: boolean;
  /** Select this inventory slot, or -1 for no change. */
  selectSlot: number;
  /** Step the selected slot by this much (mouse wheel), 0 for none. Wraps around. */
  cycleSlot: number;
  /** Open or shut the door in reach (an edge; R). */
  interact: boolean;
  /** Key turning: positive turns left. */
  turn: number;
  /** Radians added to yaw this frame (mouse or touch look). */
  lookYaw: number;
  /** Radians added to pitch this frame. */
  lookPitch: number;
}

export interface SnakeState {
  /** Stable id: a snake split off by a cut gets a new one. */
  id: number;
  /** Head first, in grid cells. */
  cells: Cell[];
  /** Cells at the previous step, same order, for smooth drawing between steps. */
  prev: Cell[];
  /** Interpolated world positions of every segment. */
  pos: Vec2[];
  /** Seconds since the last grid step. */
  timer: number;
  /** Seconds per grid step right now. */
  interval: number;
  pendingGrow: number;
  growTimer: number;
  /** Total grid steps taken in an interactive game. */
  steps: number;
  /** Seconds of stun left (slingshot, or dazed after splitting off). No steps and no growth meanwhile. */
  stunTimer: number;
  /**
   * 0 = it has its tapered, jumpable tail. After a cut it ends in a stump instead (nothing low to
   * jump); each growth step regrows a little and at 0 the tail is back.
   */
  stump: number;
  /** Seconds left of the warning flash before a growth split (Level 3). 0 = none pending. */
  splitWarn: number;
  /** World time it appeared (a split-off snake grows its head; the renderer animates that). */
  bornAt: number;
  /** Stalk: it has broken cover and is charging you (until you get away). */
  striking: boolean;
  /** A firecracker's bang it is heading for (a grid cell) and seconds left; null when none. */
  lure: { x: number; z: number; time: number } | null;
  /**
   * Per segment (same order as `cells`): under the sand (Burrow). An underground segment does not
   * block or catch you and stones pass over it. The flags shift with the cells, so the body follows
   * the head down into its hole and back up out of it.
   */
  under: boolean[];
  /** Burrow: `up` on the surface (cooling down `t` s), `down` travelling under the sand (`t` s so far), `rising` (about to break the surface in `t` s). */
  burrow: { mode: 'up' | 'down' | 'rising'; t: number };
  /** Ambush: the spot it lies in wait at, or null to pick one. */
  lurk: Cell | null;
  /** Coil: the radius (cells) of the ring it is pulling in around you. */
  coil: number;
  /** The player id it is hunting this update (sim/hunt.ts), or -1 with nobody to hunt. */
  prey: number;
  /** The player who last hit it (a stone, a cut) and seconds left of that grudge: it hunts them meanwhile. */
  aggro: { id: number; time: number } | null;
  /**
   * The player steering it (Snake and Players, Infection), or null for the AI. A steered snake goes
   * where its pilot points (sim/pilot.ts) and never into reverse.
   */
  pilot: number | null;
  /** A steered snake's heading (radians, same convention as a player's yaw) and its abilities' timers. */
  heading: number;
  dash: number;
  cooldowns: { dash: number; burrow: number; whip: number };
}

/** A piece cut off a snake: it twitches and withers away. No collision. World units. */
export interface Severed {
  id: number;
  pos: Vec2[];
  /** Seconds left before it is gone, and its full life. */
  life: number;
  total: number;
  /** Whether the piece still ends in the snake's real tail (else both ends are cuts). */
  hasTail: boolean;
}

/** Items, one entry per kind. Extend as items are built; each needs an entry in src/items. */
export type ItemId = 'slingshot' | 'machete' | 'swimRing' | 'firecracker' | 'smokeBomb' | 'energyDrink' | 'mongoose' | 'iceCleats' | 'battery';

/** A mongoose companion (World units): it runs to a snake and pins it in a fight, then leaves. */
export interface Mongoose {
  id: number;
  x: number;
  z: number;
  /** Seconds left before it runs off. */
  time: number;
  /** The snake it is going for, or null while it looks for one (or waits by you). */
  targetId: number | null;
  /** At that snake's head, pinning it. */
  fighting: boolean;
  /** The player who let it out (it waits by them). */
  owner: number;
}

/** Rarer tiers carry more uses and spoil slower (BALANCE.items.tierScale). */
export type Tier = 'white' | 'blue' | 'gold';

/** An item in an inventory slot. */
export interface HeldItem {
  item: ItemId;
  tier: Tier;
  uses: number;
  /** Seconds until it spoils, and the full spoil time (for the draining ring). */
  spoilLeft: number;
  spoilTotal: number;
}

/** An item lying in the arena, waiting to be picked up. */
export interface Drop {
  id: number;
  item: ItemId;
  tier: Tier;
  /** Grid cell. */
  x: number;
  z: number;
}

/** A thrown or shot object in flight (the slingshot's stone, a firecracker). World units. */
export interface Projectile {
  kind: 'stone' | 'firecracker';
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Seconds left before it is removed. */
  life: number;
  /** The player who shot or threw it. */
  owner: number;
}

/** A firecracker lying on the ground with its fuse burning. World units. */
export interface Firecracker {
  x: number;
  z: number;
  /** Seconds until it bangs, and the full fuse (for the sparks). */
  fuse: number;
  total: number;
}

/** What a cut did: shrank the snake (a piece withered), split it in two, defeated it, or bounced off. */
export type CutResult = 'shrunk' | 'split' | 'defeated' | 'bounce';

/** What a projectile stopped against. */
export type HitTarget = 'head' | 'body' | 'solid' | 'wall' | 'ground';

export interface Pellet {
  id: number;
  x: number;
  z: number;
}

export type DeathCause = 'caught' | 'crushed' | 'drowned' | 'fell';

/** Things that happened this frame. The game layer turns them into sound and UI. */
export type SimEvent =
  | { type: 'pelletCollected'; pid: number }
  | { type: 'snakeAtePellet' }
  /** `x`, `z` in world units; `hidden`: its head is in tall grass (you hear it, you can't see it). */
  | { type: 'snakeStep'; step: number; distance: number; x: number; z: number; hidden: boolean }
  | { type: 'died'; pid: number; cause: DeathCause }
  | { type: 'lifeLost'; pid: number; cause: DeathCause; livesLeft: number }
  | { type: 'secondWind'; pid: number }
  | { type: 'wallSmashed'; x: number; z: number }
  | { type: 'relicFound'; left: number }
  | { type: 'gateOpened' }
  | { type: 'levelComplete' }
  | { type: 'jumped'; pid: number }
  | { type: 'itemSpawned'; item: ItemId; tier: Tier }
  | { type: 'itemPickedUp'; pid: number; slot: number; item: ItemId; tier: Tier }
  | { type: 'itemUsed'; pid: number; slot: number; item: ItemId; usesLeft: number }
  | { type: 'itemSpoiled'; pid: number; slot: number; item: ItemId }
  | { type: 'shotFired'; pid: number }
  | { type: 'firecrackerThrown'; pid: number }
  | { type: 'firecrackerLanded'; x: number; z: number }
  /** `lured`: how many snakes heard it. */
  | { type: 'firecrackerBang'; x: number; z: number; lured: number }
  | { type: 'smokeBomb'; pid: number; x: number; z: number }
  | { type: 'energyDrink'; pid: number }
  | { type: 'mongooseReleased'; pid: number }
  | { type: 'mongooseFight'; x: number; z: number }
  | { type: 'mongooseGone' }
  | { type: 'snakeBurrowed'; x: number; z: number }
  | { type: 'snakeRising'; x: number; z: number }
  | { type: 'snakeSurfaced'; x: number; z: number }
  | { type: 'stormWarning' }
  | { type: 'cleatsOn'; pid: number }
  | { type: 'iceCracking'; x: number; z: number }
  | { type: 'iceBroke'; x: number; z: number }
  | { type: 'doorOpened'; x: number; z: number }
  | { type: 'doorShut'; x: number; z: number }
  | { type: 'doorBash'; x: number; z: number }
  | { type: 'doorBroken'; x: number; z: number }
  /** An Ambush snake heard (or saw) you and strikes. */
  | { type: 'snakeNoticed'; x: number; z: number }
  | { type: 'batteryIn'; pid: number }
  | { type: 'batteryDead'; pid: number }
  /** The Mother Snake's fight moved on: 2 = it split in two, 3 = the last one coils. */
  | { type: 'bossPhase'; phase: number }
  | { type: 'mapFound' }
  | { type: 'shotHit'; pid: number; target: HitTarget }
  | { type: 'snakeStunned'; seconds: number }
  | { type: 'snakeCut'; result: CutResult; x: number; z: number }
  | { type: 'snakeSplitWarning'; snakeId: number }
  | { type: 'snakeDefeated' }
  | { type: 'macheteSwing'; pid: number; result: 'cut' | 'bounce' | 'miss' }
  /** Multiplayer (sim/modes.ts). */
  | { type: 'playerDowned'; pid: number }
  | { type: 'playerRevived'; pid: number; by: number }
  | { type: 'playerOut'; pid: number }
  | { type: 'playerInfected'; pid: number }
  | { type: 'playerEscaped'; pid: number }
  | { type: 'eggPassed'; from: number; to: number }
  | { type: 'nestFilled'; pid: number; count: number; filled: number; need: number }
  | { type: 'snakeDash'; pid: number }
  | { type: 'snakeWhip'; pid: number; x: number; z: number; hits: number }
  /** The round is over: who won it (player ids; empty = the snakes won), and why. */
  | { type: 'roundOver'; winners: number[]; reason: string };

export interface World {
  level: LevelConfig;
  grid: Grid;
  rng: Rng;
  pathfinder: Pathfinder;
  /** 1 where a pillar or landmark stands (anything solid), indexed z * size + x. */
  pillars: Uint8Array;
  /** Ground type per cell (sim/tiles.ts): low walls, crumbling walls, water, bridges. */
  tiles: Uint8Array;
  /** Riverside: seconds left on each pellet speed boost (they stack). */
  boosts: number[];
  /** Relics still lying in the level, and how many were found. In the corn maze the one "relic" is the map. */
  relics: Cell[];
  relicsFound: number;
  /** Where the found ones were (Swamp: lanterns stay standing, lit). */
  relicsTaken: Cell[];
  /** The exit gate cell (Ruins, Corn maze); open once every relic (or the map) is found. */
  gate: Cell;
  gateOpen: boolean;
  /** Everyone on foot or steering a snake, in id order. Single player has one. */
  players: PlayerState[];
  /**
   * The local player: `players[0]` in single player; a multiplayer client points it at its own
   * player (src/net/netMatch.ts). A getter, not copied by snapshots. The HUD, camera and renderer
   * follow it; game rules in src/sim and src/ai never use it: they take the player they act on
   * (lint enforces this).
   */
  readonly player: PlayerState;
  /** Every live snake. A mid-body cut or a growth split adds one. */
  snakes: SnakeState[];
  nextSnakeId: number;
  /** Cut-off pieces withering away. */
  severed: Severed[];
  pellets: Pellet[];
  nextPelletId: number;
  pelletRespawn: number;
  elapsed: number;
  pelletsCollected: number;
  /** Perks for this run (picked between levels). */
  perks: PerkId[];
  /** XP earned in this level; the game banks it into the run. */
  xpGained: number;
  /** Items lying in the arena. */
  drops: Drop[];
  /** Stones and firecrackers in flight. */
  projectiles: Projectile[];
  /** Firecrackers on the ground, fuses burning. */
  firecrackers: Firecracker[];
  /** Smoke clouds from smoke bombs (world units), seconds left. Drawing only; the snakes are lured off. */
  smokes: Array<{ x: number; z: number; time: number }>;
  /** Mongooses fighting (or looking for) a snake. */
  mongooses: Mongoose[];
  nextMongooseId: number;
  /** Desert: whether the next sandstorm's warning has been given (so it fires once per wave). */
  stormWarned: number;
  /** Frozen lake: cracked-ice cells (index z * size + x) that are giving way, and how far along (0..1, 1 = it breaks). */
  cracking: Array<{ i: number; t: number }>;
  /** Broken house: per cell, a Door's state (tiles.ts DoorState), and how long a snake has bashed it. */
  doorState: Uint8Array;
  doorDamage: Float32Array;
  /** Mother Snake fight (Dark cave): 1 hunting, 2 split in two, 3 the last one coils; 0 on other levels. */
  bossPhase: number;
  /** The Mother's length at the start (for the split at half). */
  bossStartLength: number;
  nextDropId: number;
  /** Seconds until the next drop tries to fall. */
  dropTimer: number;
  status: 'playing' | 'dead' | 'complete';
  deathCause: DeathCause | null;
  /** A multiplayer round's mode, timers and score (sim/match.ts), or null in the campaign. */
  match: MatchState | null;
  /** Debug: when true the player cannot die. */
  invulnerable: boolean;
  events: SimEvent[];
}

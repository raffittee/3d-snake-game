import type { Cell, ItemId, Tier } from '../sim/types';

/** Terrain ids match docs/GAME_DESIGN.md. Each built one has a look in render/terrains.ts. */
export type TerrainId =
  | 'plains'
  | 'tall-grass'
  | 'ruins'
  | 'riverside'
  | 'corn-maze'
  | 'swamp'
  | 'desert'
  | 'frozen-lake'
  | 'broken-house'
  | 'cave';

/** Snake AI behaviors, one file each under src/ai. See docs/GAME_DESIGN.md for the full list. */
export type BehaviorId = 'chase' | 'predict' | 'stalk' | 'flank' | 'burrow' | 'ambush' | 'coil';

/** How a level ends. `either` is met as soon as any one of its goals is met. */
export type Goal =
  | { kind: 'endless' }
  | { kind: 'survive'; seconds: number }
  | { kind: 'collect'; pellets: number }
  | { kind: 'either'; goals: Goal[] }
  /**
   * Find this many relics, then reach the gate (it opens once the last relic is found). `relic` and
   * `exit` only change how they look and read: Ruins has idols and a gate, Swamp lights lanterns
   * (they stay standing, lit) and boards a boat.
   */
  | { kind: 'relicsThenGate'; relics: number; relic?: 'idol' | 'lantern' | 'flask' | 'key'; exit?: 'gate' | 'boat' | 'oasis' | 'frontDoor' }
  /** Reach the exit (the far dock on Riverside). */
  | { kind: 'reachExit' }
  /** Corn maze: find the map (it turns the minimap on and opens the exit), then reach the exit. */
  | { kind: 'mapThenExit' }
  /** Beat every snake: shrink each one under 3 segments (only on levels where `snake.defeatable`). */
  | { kind: 'defeatAll' };

/** How the level's ground is laid out. `scatter` = open plain with pillars; `ruins` = walled rooms. */
export type LevelLayout =
  | { kind: 'scatter' }
  | { kind: 'ruins'; rooms: number; crumbleShare: number }
  /** A river across the map from west to east, `width` cells of water, with plank bridges. */
  | { kind: 'river'; width: number; bridges: number; amplitude: number }
  /** Tall grass in `patches` rounded blobs (radius in cells), with open clearings between them. */
  | { kind: 'meadow'; patches: number; minRadius: number; maxRadius: number }
  /**
   * A corn maze: 2-cell corridors between 1-cell corn walls. `loops`: share of the remaining inner
   * walls knocked through, so it has loops and not only dead ends.
   */
  | { kind: 'maze'; loops: number }
  /** A swamp: islands of firm ground (`firm` share of the map) in mud, joined by logs and lily pads. */
  | { kind: 'swamp'; firm: number }
  /** Open sand with rocks; the relics (water flasks) spread far apart. */
  | { kind: 'desert' }
  /** A frozen lake: ice almost everywhere, a snowy shore and islands, `cracks` patches of cracked ice. */
  | { kind: 'lake'; cracks: number }
  /** A broken house: rooms (`roomMin` cells and up) behind full-height walls, doorways with doors, closets, rubble. */
  | { kind: 'house'; roomMin: number }
  /** A cave: rock grown by a seeded cellular automaton (`fill` share to start), one connected space. */
  | { kind: 'cave'; fill: number };

/** Everything that makes a level different. A new level should be mostly a new config file. */
export interface LevelConfig {
  id: string;
  name: string;
  terrain: TerrainId;
  /** Cells per side. */
  size: number;
  /** Pillars to try to place. */
  pillarCount: number;
  /** The player's start and respawn cell. Pillars keep clear of it. */
  start: Cell;
  /** Ground layout; plain when omitted. */
  layout?: LevelLayout;
  /** Riverside: each pellet adds a speed boost that fades out over `seconds`; boosts stack. */
  pelletBoost?: { amount: number; seconds: number };
  /** The exit: the gate (Ruins) or the far dock (Riverside), a cell near the arena's edge. */
  gate?: Cell;
  /** Tall, always-visible shapes to find your way by. Each one fills its cell like a pillar. */
  landmarks: Landmark[];
  snake: {
    behavior: BehaviorId;
    startLength: number;
    /** Head cell at the start. The body trails off toward negative x. */
    spawn: Cell;
    /** More snakes at the start (Flank needs two), each placed like `spawn`. */
    extraSpawns?: Cell[];
    baseInterval: number;
    minInterval: number;
    rampPerSecond: number;
    growEverySeconds: number;
    maxLength: number;
    /** Can it be beaten here (shrunk under 3 segments)? If not, cuts bounce off at `floor` length. */
    defeatable: boolean;
    floor: number;
    /** Growth split: past this length the snake splits by itself. Omit for none. */
    splitAt?: number;
    /** The Mother Snake (boss): cut-off pieces always wither, it splits at half length, the last one coils. */
    boss?: boolean;
  };
  pelletCount: number;
  /** Tall grass: pellets only lie in the grass. Anywhere on open ground when omitted. */
  pelletsIn?: 'grass';
  /**
   * Sandstorm waves (Desert): the first at `first` s, then every `every` s; each blows in over `ramp`
   * s and lasts `length` s in all; the wind rises `warn` s before. Visibility drops while one blows.
   */
  storm?: { first: number; every: number; length: number; ramp: number; warn: number };
  /**
   * What the minimap leaves out on this level. `offUntilMap`: it is blank until you find the map.
   * `dark`: only the cave near you, no snakes (Dark cave).
   */
  minimap?: { hidePellets?: boolean; offUntilMap?: boolean; dark?: boolean };
  /** Dark cave: you carry a flashlight whose battery drains (BALANCE.cave). */
  flashlight?: boolean;
  items: LevelItems;
  goal: Goal;
  /** Short text for the corner guide. Progress is not stored here; `guideLines` derives it from the world. */
  guide: LevelGuide;
}

/** Which items fall in a level, how often, and how rare the better tiers are. */
export interface LevelItems {
  /** Items that can drop here, picked by weight. Empty = no drops. */
  drops: Array<{ item: ItemId; weight: number }>;
  /** Seconds before the first drop, then between drops. */
  firstDropAfter: number;
  every: number;
  /** No new drop while this many lie on the ground. */
  maxOnGround: number;
  /** Chance of each tier; they should add up to 1. */
  tierOdds: Record<Tier, number>;
}

export type LandmarkKind = 'tower' | 'tree';

export interface Landmark {
  kind: LandmarkKind;
  /** Center cell. */
  cell: Cell;
  /** Footprint is size x size cells centered on `cell`, all solid. Odd: 1 or 3. */
  size: 1 | 3;
}

export interface LevelGuide {
  /** What to do, for example "Run. Grab pellets." */
  goal: string;
  /** Whether and how the snake can be beaten, for example "Can't be defeated". */
  rule: string;
}

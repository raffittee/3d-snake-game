import type { Cell, ItemId, Tier } from '../sim/types';

/** Terrain ids match docs/GAME_DESIGN.md. Only 'plains' is implemented so far. */
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
export type BehaviorId = 'chase' | 'predict';

/** How a level ends. `either` is met as soon as any one of its goals is met. */
export type Goal =
  | { kind: 'endless' }
  | { kind: 'survive'; seconds: number }
  | { kind: 'collect'; pellets: number }
  | { kind: 'either'; goals: Goal[] }
  /** Find this many relics, then reach the gate (it opens once the last relic is found). */
  | { kind: 'relicsThenGate'; relics: number }
  /** Reach the exit (the far dock on Riverside). */
  | { kind: 'reachExit' };

/** How the level's ground is laid out. `scatter` = open plain with pillars; `ruins` = walled rooms. */
export type LevelLayout =
  | { kind: 'scatter' }
  | { kind: 'ruins'; rooms: number; crumbleShare: number }
  /** A river across the map from west to east, `width` cells of water, with plank bridges. */
  | { kind: 'river'; width: number; bridges: number; amplitude: number };

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
  /** The exit: the gate (Ruins) or the far dock (Riverside), a cell near the arena's edge. */
  gate?: Cell;
  /** Tall, always-visible shapes to find your way by. Each one fills its cell like a pillar. */
  landmarks: Landmark[];
  snake: {
    behavior: BehaviorId;
    startLength: number;
    /** Head cell at the start. The body trails off toward negative x. */
    spawn: Cell;
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
  };
  pelletCount: number;
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

import type { Cell } from '../sim/types';

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
export type BehaviorId = 'chase';

/** How a level ends. `either` is met as soon as any one of its goals is met. */
export type Goal =
  | { kind: 'endless' }
  | { kind: 'survive'; seconds: number }
  | { kind: 'collect'; pellets: number }
  | { kind: 'either'; goals: Goal[] };

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
  };
  pelletCount: number;
  goal: Goal;
  /** Short text for the corner guide. Progress is not stored here; `guideLines` derives it from the world. */
  guide: LevelGuide;
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

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

/** How a level ends. Only the endless prototype mode exists so far. */
export type Goal = { kind: 'endless' };

/** Everything that makes a level different. A new level should be mostly a new config file. */
export interface LevelConfig {
  id: string;
  name: string;
  terrain: TerrainId;
  /** Cells per side. */
  size: number;
  /** Pillars to try to place. */
  pillarCount: number;
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
  /** Short text for the corner guide (not shown yet). */
  guide: string;
}

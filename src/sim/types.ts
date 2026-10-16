import type { LevelConfig } from '../levels/types';
import type { Grid } from './grid';
import type { Pathfinder } from './pathfinding';
import type { Rng } from './rng';

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
  x: number;
  z: number;
  /** Height of the feet above the floor, and vertical speed. 0 and 0 when standing. */
  y: number;
  vy: number;
  /** Radians. Forward is -z at yaw 0. */
  yaw: number;
  pitch: number;
  /** 0..1 */
  stamina: number;
  tired: boolean;
  /** For view bob and footstep logic. */
  moving: boolean;
  sprinting: boolean;
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
  /** Key turning: positive turns left. */
  turn: number;
  /** Radians added to yaw this frame (mouse or touch look). */
  lookYaw: number;
  /** Radians added to pitch this frame. */
  lookPitch: number;
}

export interface SnakeState {
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
}

export interface Pellet {
  id: number;
  x: number;
  z: number;
}

export type DeathCause = 'caught' | 'crushed';

/** Things that happened this frame. The game layer turns them into sound and UI. */
export type SimEvent =
  | { type: 'pelletCollected' }
  | { type: 'snakeAtePellet' }
  | { type: 'snakeStep'; step: number; distance: number }
  | { type: 'died'; cause: DeathCause }
  | { type: 'lifeLost'; cause: DeathCause; livesLeft: number }
  | { type: 'levelComplete' }
  | { type: 'jumped' };

export interface World {
  level: LevelConfig;
  grid: Grid;
  rng: Rng;
  pathfinder: Pathfinder;
  /** 1 where a pillar or landmark stands (anything solid), indexed z * size + x. */
  pillars: Uint8Array;
  player: PlayerState;
  snake: SnakeState;
  pellets: Pellet[];
  nextPelletId: number;
  pelletRespawn: number;
  elapsed: number;
  pelletsCollected: number;
  /** Lives left in this level, including the one being played. */
  lives: number;
  /** Seconds of post-respawn safety left. */
  graceTimer: number;
  status: 'playing' | 'dead' | 'complete';
  deathCause: DeathCause | null;
  /** Debug: when true the player cannot die. */
  invulnerable: boolean;
  events: SimEvent[];
}

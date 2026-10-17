import { BALANCE } from '../config/balance';
import type { LevelConfig } from './types';

/**
 * Riverside (64x64): a winding river across the map with three plank bridges. Cross it to the far
 * dock, over a bridge or by swimming with the swim ring (it first drops here). The snake swims too,
 * slower, and splits by itself once it grows long. Pellets give a speed boost that fades.
 * Numbers are first guesses: playtest.
 */
export const level03: LevelConfig = {
  id: 'level-03',
  name: 'Riverside',
  terrain: 'riverside',
  size: 64,
  pillarCount: 40,
  start: { x: 32, z: 58 },
  layout: { kind: 'river', width: 6, bridges: 3, amplitude: 5 },
  gate: { x: 32, z: 2 },
  landmarks: [
    { kind: 'tree', cell: { x: 12, z: 12 }, size: 1 },
    { kind: 'tower', cell: { x: 52, z: 50 }, size: 3 },
  ],
  snake: {
    behavior: 'predict',
    startLength: 6,
    spawn: { x: 10, z: 5 },
    baseInterval: 0.34,
    minInterval: 0.15,
    rampPerSecond: 0.002,
    growEverySeconds: BALANCE.snake.growEverySeconds,
    maxLength: BALANCE.snake.maxLength,
    defeatable: false,
    floor: 5,
    splitAt: 22,
  },
  pelletCount: 7,
  pelletBoost: { amount: 0.15, seconds: 8 },
  items: {
    drops: [
      { item: 'swimRing', weight: 2 },
      { item: 'machete', weight: 1 },
      { item: 'slingshot', weight: 1 },
    ],
    firstDropAfter: 5,
    every: 16,
    maxOnGround: 3,
    tierOdds: { white: 0.6, blue: 0.3, gold: 0.1 },
  },
  goal: { kind: 'reachExit' },
  guide: { goal: 'Cross the river to the far dock.', rule: "Can't be defeated" },
};

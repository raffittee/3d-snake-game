import { BALANCE } from '../config/balance';
import type { LevelConfig } from './types';

/**
 * Sandstorm desert (64x64): open sand and sandstone rocks under a hot sky. Sandstorms blow through in
 * waves and visibility drops to a few cells while one passes. The snake burrows: it dives under the
 * sand, travels hidden toward where you are heading and breaks the surface close by (the sand heaves
 * for a second first). Collect 3 water flasks, then reach the oasis on the north edge. The mongoose
 * first drops here (rare). Numbers are first guesses: playtest.
 */
export const level07: LevelConfig = {
  id: 'level-07',
  name: 'Sandstorm desert',
  terrain: 'desert',
  size: 64,
  pillarCount: 34,
  start: { x: 32, z: 58 },
  layout: { kind: 'desert' },
  gate: { x: 32, z: 2 },
  landmarks: [
    { kind: 'tower', cell: { x: 12, z: 22 }, size: 3 },
    { kind: 'tree', cell: { x: 52, z: 40 }, size: 1 },
  ],
  snake: {
    behavior: 'burrow',
    startLength: 7,
    spawn: { x: 12, z: 6 },
    baseInterval: 0.32,
    minInterval: 0.15,
    rampPerSecond: 0.002,
    growEverySeconds: BALANCE.snake.growEverySeconds,
    maxLength: BALANCE.snake.maxLength,
    defeatable: false,
    floor: 5,
  },
  pelletCount: 6,
  storm: { first: 20, every: 32, length: 10, ramp: 2.5, warn: 4 },
  items: {
    drops: [
      { item: 'mongoose', weight: 1 },
      { item: 'energyDrink', weight: 2 },
      { item: 'smokeBomb', weight: 1 },
      { item: 'firecracker', weight: 2 },
      { item: 'slingshot', weight: 1 },
      { item: 'machete', weight: 1 },
    ],
    firstDropAfter: 5,
    every: 15,
    maxOnGround: 3,
    tierOdds: { white: 0.42, blue: 0.38, gold: 0.2 },
  },
  goal: { kind: 'relicsThenGate', relics: 3, relic: 'flask', exit: 'oasis' },
  guide: { goal: 'Collect 3 water flasks, then reach the oasis.', rule: "Can't be defeated" },
};

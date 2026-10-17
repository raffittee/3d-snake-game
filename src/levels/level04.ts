import { BALANCE } from '../config/balance';
import type { LevelConfig } from './types';

/**
 * Tall grass (64x64): shoulder-high grass in big patches with open clearings between them. You see
 * over the grass but not into it; the snake stalks inside it and only breaks cover to strike. Pellets
 * lie hidden in the grass (not on the minimap). The firecracker first drops here.
 * Numbers are first guesses: playtest.
 */
export const level04: LevelConfig = {
  id: 'level-04',
  name: 'Tall grass',
  terrain: 'tall-grass',
  size: 64,
  pillarCount: 26,
  start: { x: 32, z: 32 },
  layout: { kind: 'meadow', patches: 15, minRadius: 4, maxRadius: 9 },
  landmarks: [
    { kind: 'tree', cell: { x: 50, z: 13 }, size: 1 },
    { kind: 'tower', cell: { x: 13, z: 50 }, size: 3 },
  ],
  snake: {
    behavior: 'stalk',
    startLength: 6,
    spawn: { x: 12, z: 9 },
    baseInterval: 0.36,
    minInterval: 0.16,
    rampPerSecond: 0.002,
    growEverySeconds: BALANCE.snake.growEverySeconds,
    maxLength: BALANCE.snake.maxLength,
    defeatable: false,
    floor: 5,
  },
  pelletCount: 6,
  pelletsIn: 'grass',
  minimap: { hidePellets: true },
  items: {
    drops: [
      { item: 'firecracker', weight: 2 },
      { item: 'slingshot', weight: 1 },
      { item: 'machete', weight: 1 },
    ],
    firstDropAfter: 6,
    every: 18,
    maxOnGround: 3,
    tierOdds: { white: 0.55, blue: 0.33, gold: 0.12 },
  },
  goal: { kind: 'collect', pellets: 8 },
  guide: { goal: 'Collect 8 pellets hidden in the grass.', rule: "Can't be defeated" },
};

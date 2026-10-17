import { BALANCE } from '../config/balance';
import type { LevelConfig } from './types';

/**
 * Swamp (64x64): islands of firm ground in mud that slows you to half speed (not the snake). Fallen
 * logs and chains of lily pads are firm paths across. Light 4 signal lanterns spread over the
 * islands, then board the boat at the north jetty. A Predict snake, at full speed in the mud. The
 * energy drink first drops here. Numbers are first guesses: playtest.
 */
export const level06: LevelConfig = {
  id: 'level-06',
  name: 'Swamp',
  terrain: 'swamp',
  size: 64,
  pillarCount: 16,
  start: { x: 32, z: 58 },
  layout: { kind: 'swamp', firm: 0.4 },
  gate: { x: 32, z: 1 },
  landmarks: [{ kind: 'tower', cell: { x: 54, z: 30 }, size: 3 }],
  snake: {
    behavior: 'predict',
    startLength: 6,
    spawn: { x: 12, z: 6 },
    baseInterval: 0.34,
    minInterval: 0.16,
    rampPerSecond: 0.002,
    growEverySeconds: BALANCE.snake.growEverySeconds,
    maxLength: BALANCE.snake.maxLength,
    defeatable: false,
    floor: 5,
  },
  pelletCount: 6,
  items: {
    drops: [
      { item: 'energyDrink', weight: 2 },
      { item: 'smokeBomb', weight: 1 },
      { item: 'firecracker', weight: 1 },
      { item: 'machete', weight: 1 },
      { item: 'slingshot', weight: 1 },
    ],
    firstDropAfter: 5,
    every: 16,
    maxOnGround: 3,
    tierOdds: { white: 0.45, blue: 0.38, gold: 0.17 },
  },
  goal: { kind: 'relicsThenGate', relics: 4, relic: 'lantern', exit: 'boat' },
  guide: { goal: 'Light 4 signal lanterns, then board the boat.', rule: "Can't be defeated" },
};

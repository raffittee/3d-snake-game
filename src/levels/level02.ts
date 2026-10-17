import { BALANCE } from '../config/balance';
import type { LevelConfig } from './types';

/**
 * Ruins: walled rooms of low walls (jump them) and crumbling walls (the snake smashes them).
 * Find 5 relics in the rooms, then reach the gate on the north edge. The snake is faster and
 * predicts where you are going. The machete first drops here; better tiers drop more often.
 * Numbers are first guesses: playtest.
 */
export const level02: LevelConfig = {
  id: 'level-02',
  name: 'Ruins',
  terrain: 'ruins',
  size: 48,
  pillarCount: 22,
  start: { x: 24, z: 42 },
  layout: { kind: 'ruins', rooms: 9, crumbleShare: 0.4 },
  gate: { x: 24, z: 1 },
  landmarks: [{ kind: 'tower', cell: { x: 41, z: 24 }, size: 3 }],
  snake: {
    behavior: 'predict',
    startLength: 6,
    spawn: { x: 9, z: 4 },
    baseInterval: 0.36,
    minInterval: 0.16,
    rampPerSecond: 0.0021,
    growEverySeconds: BALANCE.snake.growEverySeconds,
    maxLength: BALANCE.snake.maxLength,
    defeatable: false,
    floor: 5,
  },
  pelletCount: 5,
  items: {
    drops: [
      { item: 'slingshot', weight: 1 },
      { item: 'machete', weight: 1.5 },
    ],
    firstDropAfter: 6,
    every: 18,
    maxOnGround: 2,
    tierOdds: { white: 0.68, blue: 0.26, gold: 0.06 },
  },
  goal: { kind: 'relicsThenGate', relics: 5 },
  guide: { goal: 'Find 5 relics, then reach the gate.', rule: "Can't be defeated" },
};

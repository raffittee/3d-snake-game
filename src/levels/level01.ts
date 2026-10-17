import { BALANCE } from '../config/balance';
import type { LevelConfig } from './types';

/**
 * Plains: survive 90 s or collect 10 pellets on a 48x48 arena.
 * Numbers that differ from BALANCE are tuned for the bigger map (more room to run, so the snake
 * starts a little faster and there are more pellets and pillars). They are first guesses: playtest.
 */
export const level01: LevelConfig = {
  id: 'level-01',
  name: 'Classic',
  terrain: 'plains',
  size: 48,
  // About the same pillar density as the 28x28 prototype (16 pillars).
  pillarCount: 44,
  start: { x: 24, z: 24 },
  // Opposite corners, so one of them is usually in view.
  landmarks: [
    { kind: 'tower', cell: { x: 38, z: 9 }, size: 3 },
    { kind: 'tree', cell: { x: 9, z: 38 }, size: 1 },
  ],
  snake: {
    behavior: 'chase',
    startLength: BALANCE.snake.startLength,
    spawn: { x: 6, z: 3 },
    baseInterval: 0.4,
    minInterval: BALANCE.snake.minInterval,
    // Reaches about the same speed at 90 s as the prototype did (0.23 s per step).
    rampPerSecond: 0.0019,
    growEverySeconds: BALANCE.snake.growEverySeconds,
    maxLength: BALANCE.snake.maxLength,
  },
  pelletCount: 5,
  // The slingshot first drops here. Mostly white; gold is a rare treat.
  items: {
    drops: [{ item: 'slingshot', weight: 1 }],
    firstDropAfter: 10,
    every: 22,
    maxOnGround: 2,
    tierOdds: { white: 0.8, blue: 0.17, gold: 0.03 },
  },
  goal: {
    kind: 'either',
    goals: [
      { kind: 'survive', seconds: 90 },
      { kind: 'collect', pellets: 10 },
    ],
  },
  guide: { goal: 'Survive 90 s or grab 10 pellets.', rule: "Can't be defeated" },
};

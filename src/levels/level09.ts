import { BALANCE } from '../config/balance';
import type { LevelConfig } from './types';

/**
 * Broken house (48x48: tight rooms): a roofless, ruined house of rooms behind full-height walls,
 * with doors you can open and shut (R; the snake bashes a shut door down in a few seconds), closets
 * to hide in, and rubble. The snake lies in wait near pellets, items, doors and the key, and strikes
 * when it hears you: walking carries 6 cells, sprinting 10, a slammed door further; standing still
 * is silent (Light feet: quieter steps). Find the key, then leave by the front door. Numbers are
 * first guesses: playtest.
 */
export const level09: LevelConfig = {
  id: 'level-09',
  name: 'Broken house',
  terrain: 'broken-house',
  size: 48,
  pillarCount: 0,
  start: { x: 24, z: 44 },
  layout: { kind: 'house', roomMin: 7 },
  gate: { x: 24, z: 1 },
  landmarks: [],
  snake: {
    behavior: 'ambush',
    startLength: 7,
    spawn: { x: 10, z: 5 },
    baseInterval: 0.3,
    minInterval: 0.16,
    rampPerSecond: 0.0018,
    growEverySeconds: BALANCE.snake.growEverySeconds * 1.5,
    maxLength: 45,
    defeatable: false,
    floor: 5,
  },
  pelletCount: 7,
  items: {
    drops: [
      { item: 'firecracker', weight: 2 },
      { item: 'smokeBomb', weight: 2 },
      { item: 'machete', weight: 1 },
      { item: 'slingshot', weight: 1 },
      { item: 'energyDrink', weight: 1 },
      { item: 'mongoose', weight: 0.5 },
    ],
    firstDropAfter: 5,
    every: 15,
    maxOnGround: 3,
    tierOdds: { white: 0.4, blue: 0.4, gold: 0.2 },
  },
  goal: { kind: 'relicsThenGate', relics: 1, relic: 'key', exit: 'frontDoor' },
  guide: { goal: 'Find the key, then leave by the front door. R: open or shut a door.', rule: "Can't be defeated" },
};

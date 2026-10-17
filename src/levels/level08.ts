import { BALANCE } from '../config/balance';
import type { LevelConfig } from './types';

/**
 * Frozen lake (64x64): ice almost everywhere (you slide on it; ice cleats stop that), a snowy shore
 * and islands, and darker patches of cracked ice. The snake is long and fast, and for the first time
 * it can be beaten: lure it across cracked ice and the ice gives way under it, cutting it where it
 * breaks; finish the short pieces with the machete. Win by shrinking every snake under 3 segments.
 * Ice cleats first drop here. Numbers are first guesses: playtest.
 */
export const level08: LevelConfig = {
  id: 'level-08',
  name: 'Frozen lake',
  terrain: 'frozen-lake',
  size: 64,
  pillarCount: 14,
  start: { x: 32, z: 58 },
  layout: { kind: 'lake', cracks: 18 },
  landmarks: [{ kind: 'tower', cell: { x: 52, z: 12 }, size: 3 }],
  snake: {
    behavior: 'chase',
    startLength: 16,
    spawn: { x: 24, z: 8 },
    baseInterval: 0.27,
    minInterval: 0.15,
    rampPerSecond: 0.0012,
    growEverySeconds: BALANCE.snake.growEverySeconds * 1.75,
    maxLength: 60,
    defeatable: true,
    floor: 0,
  },
  pelletCount: 6,
  items: {
    drops: [
      { item: 'iceCleats', weight: 2 },
      { item: 'machete', weight: 3 },
      { item: 'firecracker', weight: 2 },
      { item: 'slingshot', weight: 1 },
      { item: 'smokeBomb', weight: 1 },
      { item: 'energyDrink', weight: 1 },
    ],
    firstDropAfter: 4,
    every: 13,
    maxOnGround: 4,
    tierOdds: { white: 0.4, blue: 0.4, gold: 0.2 },
  },
  goal: { kind: 'defeatAll' },
  guide: { goal: 'Lure it onto cracked ice. Shrink it under 3 segments.', rule: 'Shrink it under 3 to win' },
};

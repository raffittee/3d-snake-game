import type { LevelConfig } from './types';

/**
 * Dark cave (64x64), the last level: a pitch-dark cave under a rock ceiling, lit only by your
 * flashlight, whose battery runs down (batteries drop here). The snake shows only in its beam,
 * though its eyes glow; you track it by sound. The minimap shows only the cave near you, and no
 * snakes. The Mother Snake (30 long) can be beaten: phase 1 she hunts you (cut-off pieces wither);
 * at half her length she splits in two; the last one left coils around you, pulling its ring in,
 * and you have to cut your way out. Shrink every one under 3 segments to win the run.
 * Numbers are first guesses: playtest.
 */
export const level10: LevelConfig = {
  id: 'level-10',
  name: 'Dark cave',
  terrain: 'cave',
  size: 64,
  pillarCount: 0,
  start: { x: 32, z: 56 },
  layout: { kind: 'cave', fill: 0.44 },
  landmarks: [],
  snake: {
    behavior: 'predict',
    boss: true,
    startLength: 30,
    spawn: { x: 44, z: 10 },
    baseInterval: 0.3,
    minInterval: 0.18,
    rampPerSecond: 0.0012,
    growEverySeconds: 9,
    maxLength: 40,
    defeatable: true,
    floor: 0,
  },
  pelletCount: 5,
  flashlight: true,
  minimap: { dark: true },
  items: {
    drops: [
      { item: 'battery', weight: 3 },
      { item: 'machete', weight: 3 },
      { item: 'slingshot', weight: 2 },
      { item: 'smokeBomb', weight: 1 },
      { item: 'firecracker', weight: 1 },
      { item: 'energyDrink', weight: 1 },
    ],
    firstDropAfter: 3,
    every: 11,
    maxOnGround: 4,
    tierOdds: { white: 0.35, blue: 0.4, gold: 0.25 },
  },
  goal: { kind: 'defeatAll' },
  guide: { goal: 'Beat the Mother Snake. Mind your battery.', rule: 'Shrink it under 3 to win' },
};

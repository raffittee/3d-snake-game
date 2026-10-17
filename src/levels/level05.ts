import { BALANCE } from '../config/balance';
import type { LevelConfig } from './types';

/**
 * Corn maze (64x64): corridors two cells wide between corn walls taller than you. The minimap is
 * off until you find the map, which also opens the exit on the north edge. Two snakes hunt you
 * together: one chases, the other cuts off where you are heading (Flank). A watchtower in a clearing
 * in the middle stands above the corn, so you can find your bearings. The smoke bomb first drops here.
 * Numbers are first guesses: playtest.
 */
export const level05: LevelConfig = {
  id: 'level-05',
  name: 'Corn maze',
  terrain: 'corn-maze',
  size: 64,
  // Rocks would seal corridors: none in the maze.
  pillarCount: 0,
  start: { x: 31, z: 61 },
  layout: { kind: 'maze', loops: 0.16 },
  gate: { x: 32, z: 1 },
  landmarks: [{ kind: 'tower', cell: { x: 32, z: 32 }, size: 3 }],
  snake: {
    behavior: 'flank',
    startLength: 6,
    spawn: { x: 12, z: 4 },
    extraSpawns: [{ x: 58, z: 4 }],
    baseInterval: 0.4,
    minInterval: 0.19,
    rampPerSecond: 0.0018,
    growEverySeconds: BALANCE.snake.growEverySeconds * 1.5,
    maxLength: 40,
    defeatable: false,
    floor: 5,
  },
  pelletCount: 6,
  minimap: { offUntilMap: true },
  items: {
    drops: [
      { item: 'smokeBomb', weight: 2 },
      { item: 'firecracker', weight: 1 },
      { item: 'machete', weight: 1 },
      { item: 'slingshot', weight: 1 },
    ],
    firstDropAfter: 6,
    every: 17,
    maxOnGround: 3,
    tierOdds: { white: 0.5, blue: 0.36, gold: 0.14 },
  },
  goal: { kind: 'mapThenExit' },
  guide: { goal: 'Find the map, then the exit.', rule: "Can't be defeated" },
};

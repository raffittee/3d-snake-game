import { BALANCE } from '../config/balance';
import type { LevelConfig } from './types';

/** The prototype arena as a level: plains, endless survival. */
export const level01: LevelConfig = {
  id: 'level-01',
  name: 'Classic',
  terrain: 'plains',
  size: 28,
  pillarCount: 16,
  snake: {
    behavior: 'chase',
    startLength: BALANCE.snake.startLength,
    spawn: { x: 6, z: 3 },
    baseInterval: BALANCE.snake.baseInterval,
    minInterval: BALANCE.snake.minInterval,
    rampPerSecond: BALANCE.snake.rampPerSecond,
    growEverySeconds: BALANCE.snake.growEverySeconds,
    maxLength: BALANCE.snake.maxLength,
  },
  pelletCount: BALANCE.pellets.count,
  goal: { kind: 'endless' },
  guide: 'Run. Grab pellets.',
};

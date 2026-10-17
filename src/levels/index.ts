import { level01 } from './level01';
import { level02 } from './level02';
import { level03 } from './level03';
import type { LevelConfig } from './types';

/** Campaign order. Add new levels here. */
export const LEVELS: readonly LevelConfig[] = [level01, level02, level03];

export function getLevel(id: string): LevelConfig {
  const level = LEVELS.find((l) => l.id === id);
  if (!level) throw new Error(`Unknown level: ${id}`);
  return level;
}

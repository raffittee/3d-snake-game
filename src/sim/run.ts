import { BALANCE } from '../config/balance';
import { OFFERED_PERKS } from './perks';
import type { PerkId } from './perks';
import type { Rng } from './rng';

/**
 * A run through the campaign: which level you are on, your perks and XP. Lives refill and items
 * clear with every level (they live in the World); this outlives a level and ends when the run does.
 */
export interface RunState {
  seed: number;
  levelIndex: number;
  perks: PerkId[];
  /** XP over the whole run (pellets). */
  xp: number;
  /** Level-ups already turned into perks. */
  picksSpent: number;
  /** Score banked from finished levels. */
  score: number;
}

export function newRun(seed: number): RunState {
  return { seed, levelIndex: 0, perks: [], xp: 0, picksSpent: 0, score: 0 };
}

/** XP needed to go from level `n` to `n + 1`: each level-up needs a little more. */
export function xpForNextLevel(n: number): number {
  return BALANCE.xp.firstLevelUp + BALANCE.xp.stepPerLevel * n;
}

/** How many level-ups `xp` adds up to. */
export function levelForXp(xp: number): number {
  let level = 0;
  let need = xpForNextLevel(0);
  let left = xp;
  while (left >= need) {
    left -= need;
    level++;
    need = xpForNextLevel(level);
  }
  return level;
}

/** Level-ups earned but not yet picked. */
export const pendingPicks = (run: RunState): number => levelForXp(run.xp) - run.picksSpent;

/** Up to 3 different perks you do not have yet, from the ones that work in this phase. */
export function offerPerks(rng: Rng, owned: readonly PerkId[]): PerkId[] {
  const pool = OFFERED_PERKS.filter((p) => !owned.includes(p));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, BALANCE.xp.perksOffered);
}

import type { Goal } from '../levels/types';
import type { World } from './types';

/** True once the player has done what `goal` asks. `endless` never ends. */
export function goalMet(goal: Goal, world: World): boolean {
  switch (goal.kind) {
    case 'endless':
      return false;
    case 'survive':
      return world.elapsed >= goal.seconds;
    case 'collect':
      return world.pelletsCollected >= goal.pellets;
    case 'either':
      return goal.goals.some((g) => goalMet(g, world));
  }
}

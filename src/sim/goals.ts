import { BALANCE } from '../config/balance';
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
    case 'relicsThenGate': {
      if (world.relicsFound < goal.relics) return false;
      const gx = (world.gate.x + 0.5) * world.grid.cell - world.grid.half;
      const gz = (world.gate.z + 0.5) * world.grid.cell - world.grid.half;
      return Math.hypot(world.player.x - gx, world.player.z - gz) <= BALANCE.arena.gateRadius;
    }
  }
}

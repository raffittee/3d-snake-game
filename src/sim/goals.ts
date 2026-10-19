import { BALANCE } from '../config/balance';
import type { Goal } from '../levels/types';
import type { PlayerState, World } from './types';
import { onFoot } from './hunt';

/** True once the player (any player on foot) has done what `goal` asks. `endless` never ends. */
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
    case 'defeatAll':
      return world.snakes.length === 0;
    case 'reachExit':
      return atGate(world);
    case 'relicsThenGate':
    case 'mapThenExit': {
      if (world.relicsFound < (goal.kind === 'relicsThenGate' ? goal.relics : 1)) return false;
      return atGate(world);
    }
  }
}

/** Player `p` stands at the exit gate. */
export function playerAtGate(world: World, p: PlayerState): boolean {
  const gx = (world.gate.x + 0.5) * world.grid.cell - world.grid.half;
  const gz = (world.gate.z + 0.5) * world.grid.cell - world.grid.half;
  return Math.hypot(p.x - gx, p.z - gz) <= BALANCE.arena.gateRadius;
}

const atGate = (world: World): boolean => world.players.some((p) => onFoot(p) && playerAtGate(world, p));

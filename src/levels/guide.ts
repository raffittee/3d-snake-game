import type { World } from '../sim/types';
import type { Goal } from './types';

export interface GuideLines {
  goal: string;
  /** One line per goal, joined with newlines (an `either` goal shows each of its parts). */
  progress: string;
  rule: string;
}

/** Whole seconds as m:ss. */
function clock(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function progressLines(goal: Goal, world: World): string[] {
  switch (goal.kind) {
    case 'endless':
      return [`Pellets ${world.pelletsCollected}`];
    case 'survive':
      return [`Time ${clock(Math.min(world.elapsed, goal.seconds))}/${clock(goal.seconds)}`];
    case 'collect':
      return [`Pellets ${Math.min(world.pelletsCollected, goal.pellets)}/${goal.pellets}`];
    case 'either':
      return goal.goals.flatMap((g) => progressLines(g, world));
    case 'reachExit':
      return [world.player.swimming ? 'Swimming' : 'Reach the dock'];
    case 'relicsThenGate':
      return world.relicsFound < goal.relics ? [`Relics ${world.relicsFound}/${goal.relics}`] : ['Gate open: reach it'];
  }
}

/** The three parts of the corner guide for the world's level. Pure, so it is unit-testable. */
export function guideLines(world: World): GuideLines {
  const { guide, goal } = world.level;
  return { goal: guide.goal, progress: progressLines(goal, world).join('\n'), rule: guide.rule };
}

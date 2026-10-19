import type { World } from '../sim/types';
import type { Goal } from './types';
import { MODE_INFO } from './modes';

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
      if (goal.relic === 'lantern') return world.relicsFound < goal.relics ? [`Lanterns ${world.relicsFound}/${goal.relics}`] : ['The boat is ready: board it'];
      if (goal.relic === 'flask') return world.relicsFound < goal.relics ? [`Flasks ${world.relicsFound}/${goal.relics}`] : ['Reach the oasis'];
      if (goal.relic === 'key') return world.relicsFound < goal.relics ? ['Key not found'] : ['Key found: the front door'];
      return world.relicsFound < goal.relics ? [`Relics ${world.relicsFound}/${goal.relics}`] : ['Gate open: reach it'];
    case 'defeatAll': {
      const n = world.snakes.length;
      const longest = world.snakes.reduce((m, s) => Math.max(m, s.cells.length), 0);
      // The Mother Snake: say which part of the fight this is.
      if (world.bossPhase === 1) return [`The Mother: length ${longest}`];
      if (world.bossPhase === 2) return [`Split in two: ${world.snakes.map((s) => s.cells.length).join(' and ')}`];
      if (world.bossPhase === 3 && n > 0) return [`It coils: cut your way out (${longest})`];
      return [n === 0 ? 'Beaten' : n === 1 ? `Length ${longest}` : `${n} snakes, longest ${longest}`];
    }
    case 'mapThenExit':
      return world.relicsFound < 1 ? ['Map not found'] : ['Map found: reach the exit'];
  }
}

/** The three parts of the corner guide for the world's level. Pure, so it is unit-testable. */
export function guideLines(world: World): GuideLines {
  const { guide, goal } = world.level;
  // A multiplayer round: the mode's rule (the objective and clock are on the match HUD).
  if (world.match) return { goal: MODE_INFO[world.match.mode].name, progress: '', rule: MODE_INFO[world.match.mode].short };
  return { goal: guide.goal, progress: progressLines(goal, world).join('\n'), rule: guide.rule };
}

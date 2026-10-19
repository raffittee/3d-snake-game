import { describe, expect, it } from 'vitest';
import { level01 } from '../src/levels/level01';
import type { Goal } from '../src/levels/types';
import { cellToWorld, worldToCell } from '../src/sim/grid';
import { goalMet } from '../src/sim/goals';
import { NO_INPUT } from '../src/sim/player';
import { createWorld, drainEvents, updateWorld } from '../src/sim/world';
import type { World } from '../src/sim/types';

const SURVIVE: Goal = { kind: 'survive', seconds: 90 };
const COLLECT: Goal = { kind: 'collect', pellets: 10 };

function worldWith(goal: Goal, invulnerable = true): World {
  const w = createWorld({ ...level01, goal }, 5);
  w.invulnerable = invulnerable;
  return w;
}

/** Drop a pellet right under the player so the next update picks it up. */
function pelletUnderPlayer(w: World): void {
  const { grid, player } = w;
  w.pellets.push({ id: 9999, x: worldToCell(grid, player.x), z: worldToCell(grid, player.z) });
}

function completions(w: World): number {
  return drainEvents(w).filter((e) => e.type === 'levelComplete').length;
}

describe('goalMet', () => {
  it('endless is never met', () => {
    const w = worldWith({ kind: 'endless' });
    w.elapsed = 10_000;
    w.pelletsCollected = 10_000;
    expect(goalMet({ kind: 'endless' }, w)).toBe(false);
  });

  it('survive is met at the time, not before', () => {
    const w = worldWith(SURVIVE);
    w.elapsed = 89.99;
    expect(goalMet(SURVIVE, w)).toBe(false);
    w.elapsed = 90;
    expect(goalMet(SURVIVE, w)).toBe(true);
  });

  it('collect is met at the pellet count, not before', () => {
    const w = worldWith(COLLECT);
    w.pelletsCollected = 9;
    expect(goalMet(COLLECT, w)).toBe(false);
    w.pelletsCollected = 10;
    expect(goalMet(COLLECT, w)).toBe(true);
  });

  it('either is met when any one sub-goal is met', () => {
    const either: Goal = { kind: 'either', goals: [SURVIVE, COLLECT] };
    const w = worldWith(either);
    expect(goalMet(either, w)).toBe(false);
    w.pelletsCollected = 10;
    expect(goalMet(either, w)).toBe(true);
    w.pelletsCollected = 0;
    w.elapsed = 90;
    expect(goalMet(either, w)).toBe(true);
  });
});

describe('level completion in updateWorld', () => {
  it('a survive level completes after the time and reports it once', () => {
    const w = worldWith(SURVIVE);
    for (let i = 0; i < 179; i++) updateWorld(w, NO_INPUT, 0.5);
    expect(w.status).toBe('playing');
    expect(completions(w)).toBe(0);
    updateWorld(w, NO_INPUT, 0.5);
    expect(w.status).toBe('complete');
    expect(completions(w)).toBe(1);
  });

  it('a collect level completes on the last pellet', () => {
    const w = worldWith(COLLECT);
    w.pelletsCollected = 9;
    updateWorld(w, NO_INPUT, 0.01);
    expect(w.status).toBe('playing');
    pelletUnderPlayer(w);
    updateWorld(w, NO_INPUT, 0.01);
    expect(w.pelletsCollected).toBe(10);
    expect(w.status).toBe('complete');
  });

  it('the world stops once the level is complete', () => {
    const w = worldWith(COLLECT);
    w.pelletsCollected = 9;
    pelletUnderPlayer(w);
    updateWorld(w, NO_INPUT, 0.01);
    expect(w.status).toBe('complete');
    drainEvents(w);
    const elapsed = w.elapsed;
    const steps = w.snakes[0].steps;
    for (let i = 0; i < 20; i++) updateWorld(w, NO_INPUT, 0.5);
    expect(w.elapsed).toBe(elapsed);
    expect(w.snakes[0].steps).toBe(steps);
    expect(completions(w)).toBe(0);
  });

  it('dying on the last life in the same frame as meeting the goal counts as a death', () => {
    const w = worldWith(COLLECT, false);
    w.player.lives = 1;
    w.pelletsCollected = 10;
    const head = w.snakes[0].pos[0];
    w.player.x = cellToWorld(w.grid, worldToCell(w.grid, head.x));
    w.player.z = cellToWorld(w.grid, worldToCell(w.grid, head.z));
    updateWorld(w, NO_INPUT, 0.01);
    expect(w.status).toBe('dead');
    expect(completions(w)).toBe(0);
  });

  it('an endless level never completes', () => {
    const w = worldWith({ kind: 'endless' });
    for (let i = 0; i < 400; i++) updateWorld(w, NO_INPUT, 0.5);
    expect(w.status).toBe('playing');
  });
});

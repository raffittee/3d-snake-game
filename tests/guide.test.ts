import { describe, expect, it } from 'vitest';
import { guideLines } from '../src/levels/guide';
import { level01 } from '../src/levels/level01';
import type { Goal } from '../src/levels/types';
import { createWorld } from '../src/sim/world';

const withGoal = (goal: Goal) => createWorld({ ...level01, goal }, 1);

describe('guideLines', () => {
  it('shows the level goal and snake rule from the level config', () => {
    const lines = guideLines(createWorld(level01, 1));
    expect(lines.goal).toBe(level01.guide.goal);
    expect(lines.rule).toBe(level01.guide.rule);
  });

  it('shows a running pellet count on an endless level', () => {
    const w = withGoal({ kind: 'endless' });
    expect(guideLines(w).progress).toBe('Pellets 0');
    w.pelletsCollected = 4;
    expect(guideLines(w).progress).toBe('Pellets 4');
  });

  it('shows whole seconds out of the target, capped at the target', () => {
    const w = withGoal({ kind: 'survive', seconds: 90 });
    w.elapsed = 34.9;
    expect(guideLines(w).progress).toBe('Time 0:34/1:30');
    w.elapsed = 95;
    expect(guideLines(w).progress).toBe('Time 1:30/1:30');
  });

  it('shows pellets out of the target', () => {
    const w = withGoal({ kind: 'collect', pellets: 10 });
    w.pelletsCollected = 3;
    expect(guideLines(w).progress).toBe('Pellets 3/10');
  });

  it('shows one line per part of an either goal (Level 1)', () => {
    const w = createWorld(level01, 1);
    w.elapsed = 12.3;
    w.pelletsCollected = 2;
    expect(guideLines(w).progress).toBe('Time 0:12/1:30\nPellets 2/10');
  });

  it('level 1 carries guide text, so the corner guide is never empty', () => {
    expect(level01.guide.goal.length).toBeGreaterThan(0);
    expect(level01.guide.rule.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { level01 } from '../src/levels/level01';
import { cutSnake } from '../src/sim/cut';
import { cellToWorld } from '../src/sim/grid';
import { makeHeld } from '../src/sim/items';
import { OFFERED_PERKS, PERKS, jumpableTail } from '../src/sim/perks';
import { NO_INPUT, updatePlayer } from '../src/sim/player';
import { createRng } from '../src/sim/rng';
import { levelForXp, newRun, offerPerks, xpForNextLevel } from '../src/sim/run';
import { makeSnake, segmentHeight } from '../src/sim/snake';
import { createWorld, updateWorld } from '../src/sim/world';
import type { Cell } from '../src/sim/types';

describe('XP and level-ups', () => {
  it('each level-up needs a little more XP than the last', () => {
    expect(xpForNextLevel(0)).toBe(3);
    expect(xpForNextLevel(1)).toBe(5);
    expect(xpForNextLevel(2)).toBe(7);
    expect(levelForXp(0)).toBe(0);
    expect(levelForXp(2)).toBe(0);
    expect(levelForXp(3)).toBe(1);
    expect(levelForXp(7)).toBe(1);
    expect(levelForXp(8)).toBe(2);
    expect(levelForXp(15)).toBe(3);
  });

  it('a new run starts at Level 1 with no perks and no XP', () => {
    const run = newRun(42);
    expect(run.levelIndex).toBe(0);
    expect(run.perks).toEqual([]);
    expect(run.xp).toBe(0);
    expect(run.picksSpent).toBe(0);
  });

  it('offers 3 different perks you do not have yet, only ones that work in this phase', () => {
    const rng = createRng(3);
    for (let i = 0; i < 50; i++) {
      const offer = offerPerks(rng, ['bigLungs']);
      expect(offer).toHaveLength(3);
      expect(new Set(offer).size).toBe(3);
      expect(offer).not.toContain('bigLungs');
      for (const p of offer) expect(OFFERED_PERKS).toContain(p);
    }
  });

  it('offers what is left when fewer than 3 remain', () => {
    const owned = OFFERED_PERKS.slice(0, OFFERED_PERKS.length - 2);
    expect(offerPerks(createRng(1), owned)).toHaveLength(2);
  });

  it('every perk has a name and a one-line description', () => {
    for (const id of Object.keys(PERKS) as Array<keyof typeof PERKS>) {
      expect(PERKS[id].name.length).toBeGreaterThan(0);
      expect(PERKS[id].text.length).toBeGreaterThan(0);
    }
  });
});

describe('perk effects', () => {
  it('pellets give XP during a level', () => {
    const w = createWorld(level01, 1);
    w.invulnerable = true;
    const p = w.pellets[0];
    w.player.x = cellToWorld(w.grid, p.x);
    w.player.z = cellToWorld(w.grid, p.z);
    updateWorld(w, NO_INPUT, 0.01);
    expect(w.xpGained).toBe(BALANCE.xp.perPellet);
  });

  it('Big lungs: sprinting drains stamina 30% slower', () => {
    const plain = createWorld(level01, 1);
    const lungs = createWorld(level01, 1, ['bigLungs']);
    const run = { ...NO_INPUT, forward: 1, sprint: true };
    updatePlayer(plain, plain.player, run, 1);
    updatePlayer(lungs, lungs.player, run, 1);
    expect(1 - lungs.player.stamina).toBeCloseTo((1 - plain.player.stamina) / 1.3, 5);
  });

  it('Packrat: a third inventory slot', () => {
    expect(createWorld(level01, 1).player.inventory).toHaveLength(2);
    expect(createWorld(level01, 1, ['packrat']).player.inventory).toHaveLength(3);
  });

  it('Preserver: items spoil 50% slower', () => {
    const w = createWorld(level01, 1, ['preserver']);
    w.invulnerable = true;
    w.player.inventory[0] = makeHeld('slingshot', 'white');
    const before = w.player.inventory[0].spoilLeft;
    updateWorld(w, NO_INPUT, 1);
    expect(before - (w.player.inventory[0]?.spoilLeft ?? 0)).toBeCloseTo(0.5, 5);
  });

  it('Spring legs: one more tail segment is low enough to jump', () => {
    const plain = createWorld(level01, 1);
    const spring = createWorld(level01, 1, ['springLegs']);
    expect(jumpableTail(plain)).toBe(BALANCE.snake.jumpableTail);
    expect(jumpableTail(spring)).toBe(BALANCE.snake.jumpableTail + 1);
    const len = 12;
    const fifth = len - BALANCE.snake.jumpableTail - 1;
    expect(segmentHeight(fifth, len, true, jumpableTail(plain))).toBe(BALANCE.snake.bodyHeight);
    expect(segmentHeight(fifth, len, true, jumpableTail(spring))).toBe(BALANCE.snake.tailHeight);
  });

  it('Sharp edge: each machete cut takes 2 segments', () => {
    const w = createWorld(level01, 1, ['sharpEdge']);
    const cells: Cell[] = [];
    for (let i = 0; i < 16; i++) cells.push({ x: 30 - i, z: 20 });
    w.snakes = [makeSnake(w, 1, cells)];
    const s = w.snakes[0];
    w.player.x = s.pos[6].x;
    w.player.z = s.pos[6].z + 1.6;
    w.player.yaw = 0;
    w.player.pitch = -0.35;
    w.invulnerable = true;
    w.pillars.fill(0);
    w.player.inventory[0] = makeHeld('machete', 'white');
    updateWorld(w, { ...NO_INPUT, useItem: true }, 0.01);
    // 16 - 2 cut out: a front of 6 and a back of 8.
    expect(w.snakes.map((q) => q.cells.length).sort((a, b) => a - b)).toEqual([6, 8]);
    // Without the perk, cutSnake defaults to one segment.
    const plain = createWorld(level01, 1);
    plain.snakes = [makeSnake(plain, 1, cells.map((c) => ({ ...c })))];
    cutSnake(plain, plain.snakes[0], 6);
    expect(plain.snakes.map((q) => q.cells.length).sort((a, b) => a - b)).toEqual([6, 9]);
  });

  it('Second wind: the first catch in a level knocks you back instead of costing a life', () => {
    const w = createWorld(level01, 2, ['secondWind']);
    const catchMe = () => {
      const head = w.snakes[0].pos[0];
      w.player.x = head.x;
      w.player.z = head.z;
      updateWorld(w, NO_INPUT, 0.01);
    };
    catchMe();
    expect(w.player.lives).toBe(BALANCE.lives.perLevel);
    expect(w.player.secondWindUsed).toBe(true);
    expect(w.player.graceTimer).toBeGreaterThan(0);
    w.player.graceTimer = 0;
    catchMe();
    expect(w.player.lives).toBe(BALANCE.lives.perLevel - 1);
  });
});

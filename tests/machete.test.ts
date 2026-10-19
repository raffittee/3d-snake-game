import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { level01 } from '../src/levels/level01';
import { cellToWorld } from '../src/sim/grid';
import { makeHeld } from '../src/sim/items';
import { NO_INPUT } from '../src/sim/player';
import { makeSnake } from '../src/sim/snake';
import { createWorld, drainEvents, updateWorld } from '../src/sim/world';
import type { Cell, PlayerInput, SimEvent, World } from '../src/sim/types';

const SWING: PlayerInput = { ...NO_INPUT, useItem: true };
const machete = BALANCE.items.defs.machete;

/** A 14-segment snake along z = 20 (head at x = 30), frozen; the player just south of segment `seg`. */
function setup(seg: number, distance = 1.6): World {
  const w = createWorld(level01, 4);
  w.invulnerable = true;
  w.pillars.fill(0);
  w.pellets = [];
  w.dropTimer = 1e9;
  const cells: Cell[] = [];
  for (let i = 0; i < 14; i++) cells.push({ x: 30 - i, z: 20 });
  const s = makeSnake(w, 1, cells);
  s.stunTimer = 1e9;
  w.snakes = [s];
  w.nextSnakeId = 2;
  const target = s.pos[seg];
  w.player.x = target.x;
  w.player.z = target.z + distance;
  // Look straight at it (north), a little down toward its middle.
  w.player.yaw = 0;
  w.player.pitch = -0.35;
  w.player.inventory[0] = makeHeld('machete', 'white');
  w.player.selectedSlot = 0;
  return w;
}

const swings = (events: SimEvent[]) => events.filter((e) => e.type === 'macheteSwing').map((e) => (e.type === 'macheteSwing' ? e.result : ''));

describe('machete', () => {
  it('has 5 cuts', () => {
    expect(makeHeld('machete', 'white').uses).toBe(5);
  });

  it('cuts the segment you face: mid-body splits the snake', () => {
    const w = setup(6);
    updateWorld(w, SWING, 0.01);
    const events = drainEvents(w);
    expect(swings(events)).toEqual(['cut']);
    expect(events.some((e) => e.type === 'snakeCut' && e.result === 'split')).toBe(true);
    expect(w.snakes).toHaveLength(2);
    expect(w.player.inventory[0]?.uses).toBe(machete.uses - 1);
  });

  it('near the tail it shrinks the snake (the tail is low: look down at it)', () => {
    const w = setup(12);
    w.player.pitch = -0.75;
    updateWorld(w, SWING, 0.01);
    expect(w.snakes).toHaveLength(1);
    expect(w.snakes[0].cells).toHaveLength(12);
  });

  it('bounces off the head', () => {
    const w = setup(0);
    updateWorld(w, SWING, 0.01);
    expect(swings(drainEvents(w))).toEqual(['bounce']);
    expect(w.snakes[0].cells).toHaveLength(14);
  });

  it('bounces off at the floor', () => {
    const w = setup(level01.snake.floor - 1);
    updateWorld(w, SWING, 0.01);
    expect(swings(drainEvents(w))).toEqual(['bounce']);
    expect(w.snakes[0].cells).toHaveLength(14);
  });

  it('a swing at nothing in reach misses but still costs a cut', () => {
    const w = setup(6, machete.reach + 2);
    updateWorld(w, SWING, 0.01);
    expect(swings(drainEvents(w))).toEqual(['miss']);
    expect(w.snakes[0].cells).toHaveLength(14);
    expect(w.player.inventory[0]?.uses).toBe(machete.uses - 1);
  });

  it('the cut segment is the one under the crosshair, not the nearest', () => {
    const w = setup(8);
    // Turn to face segment 6 instead (two cells east of where we stand).
    const target = w.snakes[0].pos[6];
    w.player.yaw = Math.atan2(-(target.x - w.player.x), -(target.z - w.player.z));
    w.player.pitch = -0.3;
    w.player.x = cellToWorld(w.grid, 30 - 7);
    updateWorld(w, SWING, 0.01);
    const lens = w.snakes.map((s) => s.cells.length).sort((a, b) => a - b);
    expect(lens).toEqual([6, 7]);
  });
});

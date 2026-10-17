import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { level01 } from '../src/levels/level01';
import { cellToWorld } from '../src/sim/grid';
import { makeHeld } from '../src/sim/items';
import { NO_INPUT } from '../src/sim/player';
import { computeSegmentPositions } from '../src/sim/snake';
import { createWorld, drainEvents, updateWorld } from '../src/sim/world';
import type { PlayerInput, SimEvent, World } from '../src/sim/types';

const USE: PlayerInput = { ...NO_INPUT, useItem: true };
const sling = BALANCE.items.defs.slingshot;

/**
 * Player on cell (24, 30), facing -z. A straight 8-segment snake along x on row z = 20, its head at
 * x = 24 (straight ahead, 10 cells away) and its body trailing toward smaller x.
 */
function setup(): World {
  const w = createWorld(level01, 2);
  w.invulnerable = true;
  w.pillars.fill(0);
  w.pellets = [];
  w.dropTimer = 1e9;
  const cells = [];
  for (let i = 0; i < 8; i++) cells.push({ x: 24 - i, z: 20 });
  w.snakes[0].cells = cells;
  w.snakes[0].prev = cells.map((c) => ({ ...c }));
  w.snakes[0].timer = 0;
  w.snakes[0].pendingGrow = 0;
  computeSegmentPositions(w.snakes[0], w.grid, 0);
  w.player.x = cellToWorld(w.grid, 24);
  w.player.z = cellToWorld(w.grid, 30);
  w.inventory[0] = makeHeld('slingshot', 'white');
  w.selectedSlot = 0;
  return w;
}

function aimAt(w: World, x: number, z: number, pitch = 0): void {
  w.player.yaw = Math.atan2(-(x - w.player.x), -(z - w.player.z));
  w.player.pitch = pitch;
}

/** Fire, then let the stone fly until it has landed somewhere. Collects every event on the way. */
function fire(w: World): SimEvent[] {
  const events: SimEvent[] = [];
  updateWorld(w, USE, 0.02);
  events.push(...drainEvents(w));
  for (let i = 0; i < 120 && w.projectiles.length; i++) {
    updateWorld(w, NO_INPUT, 0.02);
    events.push(...drainEvents(w));
  }
  return events;
}

const of = (events: SimEvent[], type: SimEvent['type']) => events.filter((e) => e.type === type);

describe('slingshot', () => {
  it('a shot spends a use and launches a stone from your eye along the crosshair', () => {
    const w = setup();
    aimAt(w, w.player.x, w.player.z - 10);
    updateWorld(w, USE, 0.001);
    expect(w.inventory[0]?.uses).toBe(sling.uses - 1);
    expect(w.projectiles).toHaveLength(1);
    const s = w.projectiles[0];
    expect(s.y).toBeCloseTo(BALANCE.player.eyeHeight, 1);
    expect(s.vz).toBeLessThan(0);
    expect(Math.abs(s.vx)).toBeLessThan(1e-6);
    expect(of(drainEvents(w), 'shotFired')).toHaveLength(1);
  });

  it('a head hit stuns the snake: it stops moving for the stun time, then carries on', () => {
    const w = setup();
    const head = w.snakes[0].pos[0];
    aimAt(w, head.x, head.z);
    const events = fire(w);
    expect(of(events, 'snakeStunned')).toHaveLength(1);
    expect(w.snakes[0].stunTimer).toBeGreaterThan(0);
    const cell = { ...w.snakes[0].cells[0] };
    for (let t = 0; t < sling.stunSeconds - 0.3; t += 0.05) updateWorld(w, NO_INPUT, 0.05);
    expect(w.snakes[0].cells[0]).toEqual(cell);
    for (let t = 0; t < 1.5; t += 0.05) updateWorld(w, NO_INPUT, 0.05);
    expect(w.snakes[0].stunTimer).toBe(0);
    expect(w.snakes[0].cells[0]).not.toEqual(cell);
  });

  it('a stunned snake still blocks you with its body', () => {
    const w = setup();
    w.snakes[0].stunTimer = sling.stunSeconds;
    const seg = w.snakes[0].pos[3];
    w.player.x = seg.x;
    w.player.z = seg.z + 0.3;
    updateWorld(w, NO_INPUT, 0.01);
    expect(Math.abs(w.player.z - seg.z)).toBeGreaterThan(0.5);
  });

  it('a body hit does not stun', () => {
    const w = setup();
    // Segment 2 is full height; segments 4 to 7 are the low tail, which a level shot flies over.
    const seg = w.snakes[0].pos[2];
    aimAt(w, seg.x, seg.z);
    const events = fire(w);
    expect(of(events, 'snakeStunned')).toHaveLength(0);
    expect(of(events, 'shotHit').map((e) => (e.type === 'shotHit' ? e.target : ''))).toEqual(['body']);
    expect(w.snakes[0].stunTimer).toBe(0);
  });

  it('a pillar in the way stops the stone', () => {
    const w = setup();
    w.pillars[25 * w.grid.size + 24] = 1;
    const head = w.snakes[0].pos[0];
    aimAt(w, head.x, head.z);
    const events = fire(w);
    expect(of(events, 'snakeStunned')).toHaveLength(0);
    expect(of(events, 'shotHit').map((e) => (e.type === 'shotHit' ? e.target : ''))).toEqual(['solid']);
  });

  it('a stone shot at the sky comes down or runs out; nothing is stunned', () => {
    const w = setup();
    aimAt(w, w.player.x + 10, w.player.z, 1.2);
    const events = fire(w);
    expect(w.projectiles).toHaveLength(0);
    expect(of(events, 'snakeStunned')).toHaveLength(0);
  });

  it('the stone drops a little on its way', () => {
    const w = setup();
    aimAt(w, w.player.x, w.player.z - 10);
    updateWorld(w, USE, 0.001);
    const y0 = w.projectiles[0].y;
    updateWorld(w, NO_INPUT, 0.2);
    expect(w.projectiles[0].y).toBeLessThan(y0);
  });

  it('a second head hit resets the stun instead of stacking it', () => {
    const w = setup();
    w.snakes[0].stunTimer = 0.4;
    const head = w.snakes[0].pos[0];
    aimAt(w, head.x, head.z);
    fire(w);
    expect(w.snakes[0].stunTimer).toBeGreaterThan(0.4);
    expect(w.snakes[0].stunTimer).toBeLessThanOrEqual(sling.stunSeconds);
  });
});

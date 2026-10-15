import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { level01 } from '../src/levels/level01';
import { NO_INPUT, updatePlayer } from '../src/sim/player';
import { createWorld, updateWorld } from '../src/sim/world';
import type { PlayerInput } from '../src/sim/types';

const input = (over: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...over });
const fresh = () => {
  const w = createWorld(level01, 5);
  w.player.yaw = 0; // forward is -z
  return w;
};

describe('player movement', () => {
  it('walks forward at walk speed', () => {
    const w = fresh();
    const z0 = w.player.z;
    updatePlayer(w, input({ forward: 1 }), 1);
    expect(z0 - w.player.z).toBeCloseTo(BALANCE.player.walkSpeed);
  });

  it('does not move faster diagonally', () => {
    const w = fresh();
    const { x, z } = w.player;
    updatePlayer(w, input({ forward: 1, strafe: 1 }), 1);
    expect(Math.hypot(w.player.x - x, w.player.z - z)).toBeCloseTo(BALANCE.player.walkSpeed);
  });

  it('sprints faster and drains stamina', () => {
    const w = fresh();
    const z0 = w.player.z;
    updatePlayer(w, input({ forward: 1, sprint: true }), 1);
    expect(z0 - w.player.z).toBeCloseTo(BALANCE.player.sprintSpeed);
    expect(w.player.stamina).toBeCloseTo(1 - BALANCE.player.staminaDrain);
  });

  it('cannot sprint while standing still', () => {
    const w = fresh();
    updatePlayer(w, input({ sprint: true }), 1);
    expect(w.player.sprinting).toBe(false);
    expect(w.player.stamina).toBe(1);
  });

  it('gets tired at zero stamina and recovers past the threshold', () => {
    const w = fresh();
    for (let i = 0; i < 40; i++) updatePlayer(w, input({ forward: 1, sprint: true }), 0.1);
    expect(w.player.tired).toBe(true);
    // Resting: stamina regenerates, tired clears once above the recover level.
    for (let i = 0; i < 30; i++) updatePlayer(w, input({}), 0.1);
    expect(w.player.tired).toBe(false);
  });

  it('applies look deltas and clamps pitch', () => {
    const w = fresh();
    updatePlayer(w, input({ lookYaw: 0.5, lookPitch: 5 }), 0.016);
    expect(w.player.yaw).toBeCloseTo(0.5);
    expect(w.player.pitch).toBe(BALANCE.player.maxPitch);
  });
});

describe('player collisions', () => {
  it('cannot leave the arena', () => {
    const w = fresh();
    w.invulnerable = true;
    for (let i = 0; i < 200; i++) updateWorld(w, input({ forward: 1 }), 0.1);
    expect(w.player.z).toBeGreaterThanOrEqual(-w.grid.half + BALANCE.player.radius - 1e-6);
  });

  it('is pushed out of a pillar', () => {
    const w = fresh();
    w.invulnerable = true;
    w.pillars.fill(0);
    // Put a pillar two cells ahead (toward -z) of the player and walk into it.
    const px = Math.floor((w.player.x + w.grid.half) / w.grid.cell);
    const pz = Math.floor((w.player.z + w.grid.half) / w.grid.cell);
    w.pillars[(pz - 2) * w.grid.size + px] = 1;
    for (let i = 0; i < 100; i++) updateWorld(w, input({ forward: 1 }), 0.05);
    const pillarCenterZ = (pz - 2 + 0.5) * w.grid.cell - w.grid.half;
    // Stopped on the near side of the pillar: at least one cell half-width plus radius away.
    expect(w.player.z).toBeGreaterThan(pillarCenterZ + w.grid.cell / 2 + BALANCE.player.radius - 0.05);
  });
});

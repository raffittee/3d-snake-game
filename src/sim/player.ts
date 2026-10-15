import { BALANCE } from '../config/balance';
import { clamp } from './math';
import { cellToWorld } from './grid';
import type { Grid } from './grid';
import type { PlayerInput, PlayerState, World } from './types';

export const NO_INPUT: PlayerInput = { forward: 0, strafe: 0, sprint: false, turn: 0, lookYaw: 0, lookPitch: 0 };

/** The player starts at the arena center. The caller turns them to face the snake. */
export function createPlayer(grid: Grid): PlayerState {
  const mid = Math.floor(grid.size / 2);
  return { x: cellToWorld(grid, mid), z: cellToWorld(grid, mid), yaw: 0, pitch: 0, stamina: 1, tired: false, moving: false, sprinting: false };
}

export function updatePlayer(world: World, input: PlayerInput, dt: number): void {
  const p = world.player;
  const cfg = BALANCE.player;
  p.yaw += input.lookYaw + input.turn * cfg.keyTurnRate * dt;
  p.pitch = clamp(p.pitch + input.lookPitch, -cfg.maxPitch, cfg.maxPitch);

  let f = input.forward;
  let s = input.strafe;
  const len = Math.hypot(f, s);
  if (len > 1) {
    f /= len;
    s /= len;
  }
  p.moving = len > cfg.moveDeadzone;
  const sprint = input.sprint && p.moving && !p.tired && p.stamina > 0;
  p.sprinting = sprint;
  p.stamina = clamp(p.stamina + (sprint ? -cfg.staminaDrain : cfg.staminaRegen) * dt, 0, 1);
  if (p.stamina <= 0) p.tired = true;
  if (p.tired && p.stamina > cfg.tiredRecoverAt) p.tired = false;

  const speed = sprint ? cfg.sprintSpeed : cfg.walkSpeed;
  const sy = Math.sin(p.yaw);
  const cy = Math.cos(p.yaw);
  p.x += (-sy * f + cy * s) * speed * dt;
  p.z += (-cy * f - sy * s) * speed * dt;
}

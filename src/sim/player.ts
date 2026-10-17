import { BALANCE } from '../config/balance';
import { clamp } from './math';
import { jumpSpeed, staminaDrainScale } from './perks';
import { cellToWorld } from './grid';
import type { Grid } from './grid';
import type { Cell, PlayerInput, PlayerState, World } from './types';

export const NO_INPUT: PlayerInput = { forward: 0, strafe: 0, sprint: false, jump: false, useItem: false, selectSlot: -1, cycleSlot: 0, turn: 0, lookYaw: 0, lookPitch: 0 };

/** A fresh player standing on `start`. The caller turns them to face the snake. */
export function createPlayer(grid: Grid, start: Cell): PlayerState {
  return { x: cellToWorld(grid, start.x), z: cellToWorld(grid, start.z), y: 0, vy: 0, vx: 0, vz: 0, swimming: false, yaw: 0, pitch: 0, stamina: 1, tired: false, moving: false, sprinting: false };
}

/** Speed multiplier from pellet boosts: each one fades linearly to nothing over the level's boost time. */
export function boostScale(world: World): number {
  const cfg = world.level.pelletBoost;
  if (!cfg) return 1;
  return 1 + world.boosts.reduce((sum, t) => sum + cfg.amount * Math.max(0, t / cfg.seconds), 0);
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
  const sprint = input.sprint && p.moving && !p.tired && p.stamina > 0 && !p.swimming;
  p.sprinting = sprint;
  p.stamina = clamp(p.stamina + (sprint ? -cfg.staminaDrain * staminaDrainScale(world) : cfg.staminaRegen) * dt, 0, 1);
  if (p.stamina <= 0) p.tired = true;
  if (p.tired && p.stamina > cfg.tiredRecoverAt) p.tired = false;

  // Swimming: slow, no sprint. On land, pellet boosts (Riverside) add speed.
  const speed = p.swimming ? cfg.walkSpeed * BALANCE.river.swimSpeed : (sprint ? cfg.sprintSpeed : cfg.walkSpeed) * boostScale(world);
  const sy = Math.sin(p.yaw);
  const cy = Math.cos(p.yaw);
  p.vx = (-sy * f + cy * s) * speed;
  p.vz = (-cy * f - sy * s) * speed;
  p.x += p.vx * dt;
  p.z += p.vz * dt;

  const grounded = p.y <= 0 && p.vy <= 0;
  if (input.jump && grounded && !p.swimming && !p.tired && p.stamina >= cfg.jumpStaminaCost) {
    p.vy = jumpSpeed(world);
    p.stamina -= cfg.jumpStaminaCost;
    world.events.push({ type: 'jumped' });
  }
  if (p.y > 0 || p.vy > 0) {
    // Exact for constant gravity, so the apex does not depend on the frame rate.
    p.y += p.vy * dt - 0.5 * cfg.gravity * dt * dt;
    p.vy -= cfg.gravity * dt;
    if (p.y <= 0) {
      p.y = 0;
      p.vy = 0;
    }
  }
}

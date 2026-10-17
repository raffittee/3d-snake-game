import { BALANCE } from '../config/balance';
import { clamp } from './math';
import { jumpSpeed, staminaDrainScale } from './perks';
import { cellToWorld } from './grid';
import type { Grid } from './grid';
import type { Cell, PlayerInput, PlayerState, World } from './types';

export const NO_INPUT: PlayerInput = { forward: 0, strafe: 0, sprint: false, jump: false, useItem: false, selectSlot: -1, cycleSlot: 0, interact: false, turn: 0, lookYaw: 0, lookPitch: 0 };

/** A fresh player standing on `start`. The caller turns them to face the snake. */
export function createPlayer(grid: Grid, start: Cell): PlayerState {
  return {
    x: cellToWorld(grid, start.x),
    z: cellToWorld(grid, start.z),
    y: 0,
    vy: 0,
    vx: 0,
    vz: 0,
    swimming: false,
    inMud: false,
    energy: 0,
    onIce: false,
    cleats: 0,
    hidden: false,
    yaw: 0,
    pitch: 0,
    stamina: 1,
    tired: false,
    moving: false,
    sprinting: false,
  };
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
  if (p.energy > 0) {
    // Energy drink: stamina stays full, so sprinting is free while it lasts.
    p.energy = Math.max(0, p.energy - dt);
    p.stamina = 1;
    p.tired = false;
  } else {
    p.stamina = clamp(p.stamina + (sprint ? -cfg.staminaDrain * staminaDrainScale(world) : cfg.staminaRegen) * dt, 0, 1);
    if (p.stamina <= 0) p.tired = true;
    if (p.tired && p.stamina > cfg.tiredRecoverAt) p.tired = false;
  }

  // Swimming: slow, no sprint. On land, pellet boosts (Riverside) add speed; mud (Swamp) halves it.
  const mud = p.inMud && p.y <= 0 ? BALANCE.swamp.mudSpeed : 1;
  const speed = p.swimming ? cfg.walkSpeed * BALANCE.river.swimSpeed : (sprint ? cfg.sprintSpeed : cfg.walkSpeed) * boostScale(world) * mud;
  const sy = Math.sin(p.yaw);
  const cy = Math.cos(p.yaw);
  const wantX = (-sy * f + cy * s) * speed;
  const wantZ = (-cy * f - sy * s) * speed;
  p.cleats = Math.max(0, p.cleats - dt);
  if (p.onIce && p.cleats <= 0) {
    // Ice: your speed only eases toward what you ask for, so you are slow to start, turn and stop
    // (in the air you keep your slide).
    if (p.y <= 0) {
      const k = Math.min(1, BALANCE.ice.grip * dt);
      p.vx += (wantX - p.vx) * k;
      p.vz += (wantZ - p.vz) * k;
    }
  } else {
    p.vx = wantX;
    p.vz = wantZ;
  }
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

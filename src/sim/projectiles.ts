import { BALANCE } from '../config/balance';
import { probeAt } from './probe';
import type { Probe } from './probe';
import type { HitTarget, World } from './types';

/** Longest move per collision check, so a fast stone cannot skip through a thin target between frames. */
const SUBSTEP = 0.25;
/** The stone starts this far in front of the eye. */
const MUZZLE = 0.4;

/** Launch a slingshot stone from the player's eye, along the view direction (yaw and pitch). */
export function fireStone(world: World): void {
  const { player } = world;
  const cfg = BALANCE.items.defs.slingshot;
  const cp = Math.cos(player.pitch);
  // Forward is -z at yaw 0; pitch up is positive.
  const dx = -Math.sin(player.yaw) * cp;
  const dy = Math.sin(player.pitch);
  const dz = -Math.cos(player.yaw) * cp;
  const y = BALANCE.player.eyeHeight + player.y;
  world.projectiles.push({
    x: player.x + dx * MUZZLE,
    y: y + dy * MUZZLE,
    z: player.z + dz * MUZZLE,
    vx: dx * cfg.stoneSpeed,
    vy: dy * cfg.stoneSpeed,
    vz: dz * cfg.stoneSpeed,
    life: cfg.stoneLife,
  });
  world.events.push({ type: 'shotFired' });
}

/** Move stones, apply their light gravity, and resolve what they hit. A head hit stuns the snake. */
export function updateProjectiles(world: World, dt: number): void {
  const cfg = BALANCE.items.defs.slingshot;
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const s = world.projectiles[i];
    s.life -= dt;
    const speed = Math.hypot(s.vx, s.vy, s.vz);
    const steps = Math.max(1, Math.ceil((speed * dt) / SUBSTEP));
    const h = dt / steps;
    let hit: Probe | null = null;
    for (let k = 0; k < steps && !hit; k++) {
      s.vy -= cfg.stoneGravity * h;
      s.x += s.vx * h;
      s.y += s.vy * h;
      s.z += s.vz * h;
      hit = probeAt(world, s.x, s.y, s.z, cfg.stoneRadius);
    }
    if (hit) {
      world.projectiles.splice(i, 1);
      world.events.push({ type: 'shotHit', target: hit.kind as HitTarget });
      if (hit.kind === 'head') {
        // A second hit resets that snake's stun; it never stacks.
        hit.snake.stunTimer = cfg.stunSeconds;
        world.events.push({ type: 'snakeStunned', seconds: cfg.stunSeconds });
      }
    } else if (s.life <= 0) {
      world.projectiles.splice(i, 1);
    }
  }
}

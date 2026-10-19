import { BALANCE } from '../config/balance';
import { worldToCell } from './grid';
import { probeAt } from './probe';
import type { Probe } from './probe';
import type { HitTarget, PlayerState, Projectile, World } from './types';
import { provoke } from './hunt';

/** Longest move per collision check, so a fast stone cannot skip through a thin target between frames. */
const SUBSTEP = 0.25;
/** The stone starts this far in front of the eye. */
const MUZZLE = 0.4;

/** Unit view direction (yaw and pitch, plus `lift` radians of extra pitch). Forward is -z at yaw 0. */
function aim(player: PlayerState, lift = 0): [number, number, number] {
  const pitch = Math.min(Math.PI / 2 - 0.05, player.pitch + lift);
  const cp = Math.cos(pitch);
  return [-Math.sin(player.yaw) * cp, Math.sin(pitch), -Math.cos(player.yaw) * cp];
}

function launch(world: World, player: PlayerState, kind: Projectile['kind'], speed: number, life: number, lift: number): void {
  const [dx, dy, dz] = aim(player, lift);
  const y = BALANCE.player.eyeHeight + player.y;
  world.projectiles.push({
    kind,
    x: player.x + dx * MUZZLE,
    y: y + dy * MUZZLE,
    z: player.z + dz * MUZZLE,
    vx: dx * speed,
    vy: dy * speed,
    vz: dz * speed,
    life,
    owner: player.id,
  });
}

/** Launch a slingshot stone from player `p`'s eye, along their view direction (yaw and pitch). */
export function fireStone(world: World, p: PlayerState): void {
  const cfg = BALANCE.items.defs.slingshot;
  launch(world, p, 'stone', cfg.stoneSpeed, cfg.stoneLife, 0);
  world.events.push({ type: 'shotFired', pid: p.id });
}

/** Throw a lit firecracker along the crosshair, tipped up into an arc. It bangs where it lands. */
export function throwFirecracker(world: World, p: PlayerState): void {
  const cfg = BALANCE.items.defs.firecracker;
  // Long enough to always come down: the arena is never wider than this flight.
  launch(world, p, 'firecracker', cfg.throwSpeed, 10, cfg.throwLift);
  world.events.push({ type: 'firecrackerThrown', pid: p.id });
}

/** A firecracker came down at (x, z): it lies there with its fuse burning. */
function land(world: World, x: number, z: number): void {
  const cfg = BALANCE.items.defs.firecracker;
  const lim = world.grid.half - 0.3;
  const fx = Math.min(lim, Math.max(-lim, x));
  const fz = Math.min(lim, Math.max(-lim, z));
  world.firecrackers.push({ x: fx, z: fz, fuse: cfg.fuseSeconds, total: cfg.fuseSeconds });
  world.events.push({ type: 'firecrackerLanded', x: fx, z: fz });
}

/** Move stones and firecrackers, apply gravity, and resolve what they hit. A stone on a head stuns the snake. */
export function updateProjectiles(world: World, dt: number): void {
  const sling = BALANCE.items.defs.slingshot;
  const cracker = BALANCE.items.defs.firecracker;
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const s = world.projectiles[i];
    const stone = s.kind === 'stone';
    const gravity = stone ? sling.stoneGravity : cracker.gravity;
    const radius = stone ? sling.stoneRadius : cracker.radius;
    s.life -= dt;
    const speed = Math.hypot(s.vx, s.vy, s.vz);
    const steps = Math.max(1, Math.ceil((speed * dt) / SUBSTEP));
    const h = dt / steps;
    let hit: Probe | null = null;
    let px = s.x;
    let pz = s.z;
    for (let k = 0; k < steps && !hit; k++) {
      px = s.x;
      pz = s.z;
      s.vy -= gravity * h;
      s.x += s.vx * h;
      s.y += s.vy * h;
      s.z += s.vz * h;
      hit = probeAt(world, s.x, s.y, s.z, radius);
    }
    if (!stone) {
      if (hit || s.life <= 0) {
        world.projectiles.splice(i, 1);
        // The ground: it lands right there. Anything standing (a rock, a wall, a snake): it drops at its foot.
        if (hit?.kind === 'ground') land(world, s.x, s.z);
        else land(world, px, pz);
      }
      continue;
    }
    if (hit) {
      world.projectiles.splice(i, 1);
      world.events.push({ type: 'shotHit', pid: s.owner, target: hit.kind as HitTarget });
      if (hit.kind === 'head' || hit.kind === 'body') provoke(hit.snake, s.owner);
      if (hit.kind === 'head') {
        // A second hit resets that snake's stun; it never stacks.
        hit.snake.stunTimer = sling.stunSeconds;
        world.events.push({ type: 'snakeStunned', seconds: sling.stunSeconds });
      }
    } else if (s.life <= 0) {
      world.projectiles.splice(i, 1);
    }
  }
}

/** Burn fuses. A bang lures every snake whose head is within earshot to that spot for a while. */
export function updateFirecrackers(world: World, dt: number): void {
  const cfg = BALANCE.items.defs.firecracker;
  for (let i = world.firecrackers.length - 1; i >= 0; i--) {
    const f = world.firecrackers[i];
    f.fuse -= dt;
    if (f.fuse > 0) continue;
    world.firecrackers.splice(i, 1);
    const cell = { x: worldToCell(world.grid, f.x), z: worldToCell(world.grid, f.z) };
    let lured = 0;
    for (const snake of world.snakes) {
      const head = snake.pos[0];
      if (Math.hypot(head.x - f.x, head.z - f.z) > cfg.earshot) continue;
      snake.lure = { ...cell, time: cfg.lureSeconds };
      snake.striking = false;
      lured++;
    }
    world.events.push({ type: 'firecrackerBang', x: f.x, z: f.z, lured });
  }
}

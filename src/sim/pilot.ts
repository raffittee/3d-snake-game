import type { Target } from '../ai';
import { BALANCE } from '../config/balance';
import { clamp } from './math';
import { inBounds } from './grid';
import { onFoot } from './hunt';
import { blocksSnake } from './tiles';
import type { PlayerInput, PlayerState, SnakeState, World } from './types';

/** Wrap an angle to -PI..PI. */
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** The heading (yaw convention: forward is -z at 0) of a step from cell (dx, dz). */
const headingOf = (dx: number, dz: number): number => Math.atan2(-dx, -dz);

/** Player `p` takes over `snake`: it goes where they point from now on, starting the way its head faces. */
export function takeControl(snake: SnakeState, p: PlayerState): void {
  snake.pilot = p.id;
  p.snakeId = snake.id;
  const [h, neck] = snake.cells;
  snake.heading = neck ? headingOf(h.x - neck.x, h.z - neck.z) : 0;
  p.yaw = snake.heading;
  p.pitch = -0.35;
  p.x = snake.pos[0].x;
  p.z = snake.pos[0].z;
}

/**
 * Steering a snake (Snake and Players, Infection). Mouse look and A/D or Q/E turn where the pilot
 * points; the snake's heading follows at a limited rate (its momentum), and each step it takes the
 * free neighbor most in line with its heading, never back into itself. Abilities on cooldowns:
 * dash (click or F), burrow (Space: under the ground for a while), tail whip (R: knocks back runners
 * near its tail). Returns the cell to step to, for advanceSnake.
 */
export function pilotTarget(world: World, snake: SnakeState, input: PlayerInput, dt: number): Target {
  const cfg = BALANCE.pilot;
  const p = world.players[snake.pilot ?? 0];
  const cd = snake.cooldowns;
  cd.dash = Math.max(0, cd.dash - dt);
  cd.burrow = Math.max(0, cd.burrow - dt);
  cd.whip = Math.max(0, cd.whip - dt);
  snake.dash = Math.max(0, snake.dash - dt);

  p.yaw = wrap(p.yaw + input.lookYaw + (input.turn - input.strafe) * cfg.keyTurnRate * dt);
  p.pitch = clamp(p.pitch + input.lookPitch, -1.2, 0.3);
  snake.heading = wrap(snake.heading + clamp(wrap(p.yaw - snake.heading), -cfg.turnRate * dt, cfg.turnRate * dt));

  if (input.useItem && cd.dash <= 0) {
    snake.dash = cfg.dashSeconds;
    cd.dash = cfg.dashCooldown;
    world.events.push({ type: 'snakeDash', pid: p.id });
  }
  const b = snake.burrow;
  const head = snake.pos[0];
  if (input.jump && cd.burrow <= 0 && b.mode === 'up') {
    b.mode = 'down';
    b.t = cfg.burrowSeconds;
    cd.burrow = cfg.burrowCooldown;
    world.events.push({ type: 'snakeBurrowed', x: head.x, z: head.z });
  } else if (b.mode === 'down') {
    b.t -= dt;
    if (b.t <= 0) {
      b.mode = 'up';
      b.t = 0;
      snake.under[0] = false;
      world.events.push({ type: 'snakeSurfaced', x: head.x, z: head.z });
    }
  }
  if (input.interact && cd.whip <= 0) {
    cd.whip = cfg.whipCooldown;
    const tail = snake.pos.slice(-cfg.whipSegments);
    let hits = 0;
    for (const q of world.players) {
      if (q.id === p.id || !onFoot(q)) continue;
      const seg = tail.find((t) => Math.hypot(q.x - t.x, q.z - t.z) <= cfg.whipRange);
      if (!seg) continue;
      const dx = q.x - seg.x;
      const dz = q.z - seg.z;
      const d = Math.hypot(dx, dz) || 1;
      const lim = world.grid.half - BALANCE.player.radius;
      q.x = clamp(q.x + (dx / d) * cfg.whipKnockback, -lim, lim);
      q.z = clamp(q.z + (dz / d) * cfg.whipKnockback, -lim, lim);
      q.stamina = 0;
      q.tired = true;
      hits++;
    }
    const at = tail[Math.floor(tail.length / 2)] ?? head;
    world.events.push({ type: 'snakeWhip', pid: p.id, x: at.x, z: at.z, hits });
  }

  // The free neighbor most in line with the heading.
  const n = world.grid.size;
  const h = snake.cells[0];
  const fx = -Math.sin(snake.heading);
  const fz = -Math.cos(snake.heading);
  let best: Target = { x: h.x + Math.round(fx), z: h.z + Math.round(fz) };
  let bestDot = -Infinity;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const x = h.x + dx;
    const z = h.z + dz;
    if (!inBounds(world.grid, x, z) || world.pillars[z * n + x] || blocksSnake(world.tiles[z * n + x])) continue;
    if (world.snakes.some((s) => s.cells.some((c, i) => c.x === x && c.z === z && !(s === snake && i === s.cells.length - 1)))) continue;
    const dot = dx * fx + dz * fz;
    if (dot > bestDot) {
      bestDot = dot;
      best = { x, z };
    }
  }
  return best;
}

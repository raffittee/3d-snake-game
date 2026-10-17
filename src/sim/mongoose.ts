import { BALANCE } from '../config/balance';
import { isUnder } from './snake';
import type { SnakeState, World } from './types';

/** Let a mongoose go at your feet. */
export function releaseMongoose(world: World): void {
  world.mongooses.push({ id: world.nextMongooseId++, x: world.player.x, z: world.player.z, time: BALANCE.items.defs.mongoose.seconds, targetId: null, fighting: false });
  world.events.push({ type: 'mongooseReleased' });
}

/**
 * Each mongoose runs to the nearest snake whose head is above ground and fights it: while it is at
 * the head the snake is pinned (no steps, no growth; its body still blocks and its head still bites
 * if you walk into it). With no snake to fight it waits by you. When its time is up it runs off.
 */
export function updateMongooses(world: World, dt: number): void {
  const cfg = BALANCE.items.defs.mongoose;
  for (let i = world.mongooses.length - 1; i >= 0; i--) {
    const m = world.mongooses[i];
    m.time -= dt;
    if (m.time <= 0) {
      world.mongooses.splice(i, 1);
      world.events.push({ type: 'mongooseGone' });
      continue;
    }
    const above = (s: SnakeState) => !isUnder(s, 0);
    let target = world.snakes.find((s) => s.id === m.targetId && above(s)) ?? null;
    if (!target) {
      let best = Infinity;
      for (const s of world.snakes) {
        if (!above(s)) continue;
        const d = Math.hypot(s.pos[0].x - m.x, s.pos[0].z - m.z);
        if (d < best) {
          best = d;
          target = s;
        }
      }
    }
    m.targetId = target ? target.id : null;
    // Run at the snake's head, or wait a step away from you.
    const tx = target ? target.pos[0].x : world.player.x + 1;
    const tz = target ? target.pos[0].z : world.player.z + 1;
    const d = Math.hypot(tx - m.x, tz - m.z);
    const stop = target ? cfg.reach * 0.8 : 1;
    if (d > stop) {
      const k = Math.min(1, (cfg.speed * dt) / d);
      m.x += (tx - m.x) * k;
      m.z += (tz - m.z) * k;
    }
    const touching = !!target && Math.hypot(tx - m.x, tz - m.z) <= cfg.reach;
    if (target && touching) target.stunTimer = Math.max(target.stunTimer, 0.25);
    if (touching && !m.fighting) world.events.push({ type: 'mongooseFight', x: m.x, z: m.z });
    m.fighting = touching;
  }
}

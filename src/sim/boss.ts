import { BALANCE } from '../config/balance';
import { splitInHalf } from './cut';
import { worldToCell } from './grid';
import type { World } from './types';

/** Set up the flashlight's battery and the Mother Snake's fight for a new level. */
export function initBoss(world: World): void {
  world.battery = world.level.flashlight ? BALANCE.cave.batteryStart : 0;
  world.bossPhase = world.level.snake.boss ? 1 : 0;
  world.bossStartLength = world.level.snake.startLength;
}

/**
 * Each update in the Dark cave. The flashlight's battery drains (it is dark when it is out). The
 * Mother Snake's fight moves on: phase 1, she hunts you; once your cuts have brought her down to
 * half her length she splits in two (phase 2); when only one is left, it coils (phase 3): it circles
 * you and pulls its ring in, and you have to cut your way out.
 */
export function updateBoss(world: World, dt: number): void {
  if (world.level.flashlight && world.battery > 0) {
    world.battery = Math.max(0, world.battery - dt);
    if (world.battery === 0) world.events.push({ type: 'batteryDead' });
  }
  if (!world.bossPhase) return;
  const minSplit = BALANCE.snake.minSplitLength * 2;
  if (world.bossPhase === 1 && world.snakes.length === 1) {
    const mother = world.snakes[0];
    if (mother.cells.length <= Math.floor(world.bossStartLength * BALANCE.cave.splitShare)) {
      if (mother.cells.length >= minSplit) {
        splitInHalf(world, mother);
        world.bossPhase = 2;
      } else {
        // Cut too short to split: straight to the last stand.
        world.bossPhase = 3;
      }
      world.events.push({ type: 'bossPhase', phase: world.bossPhase });
    }
  }
  if (world.bossPhase === 2 && world.snakes.length === 1) {
    world.bossPhase = 3;
    world.events.push({ type: 'bossPhase', phase: 3 });
  }
  if (world.bossPhase === 3) {
    // The coil tightens while it is close to you.
    const px = worldToCell(world.grid, world.player.x);
    const pz = worldToCell(world.grid, world.player.z);
    for (const s of world.snakes) {
      const h = s.cells[0];
      if (s.stunTimer > 0 || Math.hypot(h.x - px, h.z - pz) > BALANCE.ai.coilReach) continue;
      s.coil = Math.max(BALANCE.ai.coilMinRadius, s.coil - BALANCE.ai.coilTighten * dt);
    }
  }
}

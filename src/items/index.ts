import { BALANCE } from '../config/balance';
import { cutSnake } from '../sim/cut';
import { macheteCutSize } from '../sim/perks';
import { probeView } from '../sim/probe';
import { fireStone, throwFirecracker } from '../sim/projectiles';
import { worldToCell } from '../sim/grid';
import { releaseMongoose } from '../sim/mongoose';
import { blocksSnake } from '../sim/tiles';
import type { ItemId, PlayerState, World } from '../sim/types';
import { provoke } from '../sim/hunt';

/**
 * What an item does when used. Plain sim code: no three.js, no DOM. Returns false when the item
 * could not be used right now (then no use is spent).
 */
export interface ItemDef {
  /** Player `p` uses it. */
  use(world: World, p: PlayerState): boolean;
}

/** Fires a stone along the crosshair. A head hit stuns the snake (sim/projectiles.ts). A miss still spends the shot. */
const slingshot: ItemDef = {
  use: (world, p) => {
    fireStone(world, p);
    return true;
  },
};

/**
 * Cuts the snake segment under the crosshair, in reach. Near the tail it shrinks the snake, mid-body
 * it splits it (sim/cut.ts); the head and a snake at its floor bounce it off. Every swing costs a cut.
 */
const machete: ItemDef = {
  use: (world, p) => {
    const hit = probeView(world, p, BALANCE.items.defs.machete.reach, 0.05);
    let result: 'cut' | 'bounce' | 'miss' = 'miss';
    if (hit?.kind === 'body') {
      provoke(hit.snake, p.id);
      result = cutSnake(world, hit.snake, hit.seg, macheteCutSize(world)) === 'bounce' ? 'bounce' : 'cut';
    } else if (hit?.kind === 'head' || hit?.kind === 'solid' || hit?.kind === 'wall') result = 'bounce';
    world.events.push({ type: 'macheteSwing', pid: p.id, result });
    return true;
  },
};

/**
 * The swim ring works on its own while you carry it: deep water lets you in and its seconds drain
 * while you swim (sim/world.ts). Using it does nothing and costs nothing.
 */
const swimRing: ItemDef = {
  use: () => false,
};

/**
 * Thrown in an arc along the crosshair; after a short fuse it bangs where it landed, and every snake
 * within earshot heads for the noise for a few seconds (sim/projectiles.ts).
 */
const firecracker: ItemDef = {
  use: (world, p) => {
    throwFirecracker(world, p);
    return true;
  },
};

/**
 * Smashed at your feet: a cloud of smoke, and every snake loses track of you and wanders off toward
 * a spot well away from you for a few seconds (the same lure a firecracker uses, aimed elsewhere).
 */
const smokeBomb: ItemDef = {
  use: (world, player) => {
    const cfg = BALANCE.items.defs.smokeBomb;
    const { grid, rng } = world;
    const n = grid.size;
    const px = worldToCell(grid, player.x);
    const pz = worldToCell(grid, player.z);
    for (const snake of world.snakes) {
      // A spot the snake can stand on, far from you; failing that, its own head (it stops hunting).
      let target = { ...snake.cells[0] };
      for (let k = 0; k < 200; k++) {
        const x = 1 + rng.int(n - 2);
        const z = 1 + rng.int(n - 2);
        if (world.pillars[z * n + x] || blocksSnake(world.tiles[z * n + x])) continue;
        if (Math.hypot(x - px, z - pz) < cfg.wanderMinCells) continue;
        target = { x, z };
        break;
      }
      snake.lure = { ...target, time: cfg.seconds };
      snake.striking = false;
    }
    world.smokes.push({ x: player.x, z: player.z, time: cfg.seconds });
    world.events.push({ type: 'smokeBomb', pid: player.id, x: player.x, z: player.z });
    return true;
  },
};

/** Drunk on the spot: stamina fills up and sprinting costs nothing for a few seconds (sim/player.ts). */
const energyDrink: ItemDef = {
  use: (world, p) => {
    p.energy = BALANCE.items.defs.energyDrink.seconds;
    p.stamina = 1;
    p.tired = false;
    world.events.push({ type: 'energyDrink', pid: p.id });
    return true;
  },
};

/** Let the mongoose out of its cage: it runs to the nearest snake and pins it in a fight (sim/mongoose.ts). */
const mongoose: ItemDef = {
  use: (world, p) => {
    releaseMongoose(world, p);
    return true;
  },
};

/** Strapped onto your boots: no sliding on ice for a while (sim/player.ts). */
const iceCleats: ItemDef = {
  use: (world, p) => {
    p.cleats = BALANCE.items.defs.iceCleats.seconds;
    world.events.push({ type: 'cleatsOn', pid: p.id });
    return true;
  },
};

/** Snapped into the flashlight: more light (Dark cave). */
const battery: ItemDef = {
  use: (world, p) => {
    p.battery += BALANCE.items.defs.battery.seconds;
    world.events.push({ type: 'batteryIn', pid: p.id });
    return true;
  },
};

/** One entry per ItemId. Uses and spoil times are tuning numbers in BALANCE.items.defs. */
export const ITEMS: Record<ItemId, ItemDef> = { slingshot, machete, swimRing, firecracker, smokeBomb, energyDrink, mongoose, iceCleats, battery };

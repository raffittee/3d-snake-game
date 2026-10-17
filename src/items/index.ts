import { BALANCE } from '../config/balance';
import { cutSnake } from '../sim/cut';
import { macheteCutSize } from '../sim/perks';
import { probeView } from '../sim/probe';
import { fireStone } from '../sim/projectiles';
import type { ItemId, World } from '../sim/types';

/**
 * What an item does when used. Plain sim code: no three.js, no DOM. Returns false when the item
 * could not be used right now (then no use is spent).
 */
export interface ItemDef {
  use(world: World): boolean;
}

/** Fires a stone along the crosshair. A head hit stuns the snake (sim/projectiles.ts). A miss still spends the shot. */
const slingshot: ItemDef = {
  use: (world) => {
    fireStone(world);
    return true;
  },
};

/**
 * Cuts the snake segment under the crosshair, in reach. Near the tail it shrinks the snake, mid-body
 * it splits it (sim/cut.ts); the head and a snake at its floor bounce it off. Every swing costs a cut.
 */
const machete: ItemDef = {
  use: (world) => {
    const hit = probeView(world, BALANCE.items.defs.machete.reach, 0.05);
    let result: 'cut' | 'bounce' | 'miss' = 'miss';
    if (hit?.kind === 'body') result = cutSnake(world, hit.snake, hit.seg, macheteCutSize(world)) === 'bounce' ? 'bounce' : 'cut';
    else if (hit?.kind === 'head' || hit?.kind === 'solid' || hit?.kind === 'wall') result = 'bounce';
    world.events.push({ type: 'macheteSwing', result });
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

/** One entry per ItemId. Uses and spoil times are tuning numbers in BALANCE.items.defs. */
export const ITEMS: Record<ItemId, ItemDef> = { slingshot, machete, swimRing };

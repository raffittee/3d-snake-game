import { BALANCE } from '../config/balance';
import type { World } from './types';

/** Perks from the design doc. Picked between levels; they last for the whole run. */
export type PerkId = 'bigLungs' | 'lightFeet' | 'packrat' | 'preserver' | 'springLegs' | 'keenEars' | 'sharpEdge' | 'secondWind';

export interface PerkDef {
  name: string;
  /** One line for the pick screen. */
  text: string;
  /** False while what it acts on does not exist yet (Light feet needs the ambushing snake, Phase 3). */
  offered: boolean;
}

export const PERKS: Record<PerkId, PerkDef> = {
  bigLungs: { name: 'Big lungs', text: '30% more stamina.', offered: true },
  lightFeet: { name: 'Light feet', text: 'Quieter footsteps: ambushing snakes notice you later.', offered: false },
  packrat: { name: 'Packrat', text: 'A third inventory slot.', offered: true },
  preserver: { name: 'Preserver', text: 'Items spoil 50% slower.', offered: true },
  springLegs: { name: 'Spring legs', text: 'Jump higher: clear one more tail segment.', offered: true },
  keenEars: { name: 'Keen ears', text: 'An arrow points to the snake when it is close.', offered: true },
  sharpEdge: { name: 'Sharp edge', text: 'Each machete cut removes 2 segments.', offered: true },
  secondWind: { name: 'Second wind', text: 'Once per level, a catch knocks you back instead of costing a life.', offered: true },
};

export const OFFERED_PERKS: readonly PerkId[] = (Object.keys(PERKS) as PerkId[]).filter((id) => PERKS[id].offered);

export const hasPerk = (world: Pick<World, 'perks'>, id: PerkId): boolean => world.perks.includes(id);

/** How many of a real tail's last segments are low enough to jump (Spring legs adds one). */
export const jumpableTail = (world: Pick<World, 'perks'>): number => BALANCE.snake.jumpableTail + (hasPerk(world, 'springLegs') ? 1 : 0);

/** Multiplier on sprint stamina drain (Big lungs: 30% more stamina = drain / 1.3). */
export const staminaDrainScale = (world: Pick<World, 'perks'>): number => (hasPerk(world, 'bigLungs') ? 1 / BALANCE.perks.bigLungs : 1);

/** Multiplier on how fast held items spoil (Preserver: half speed). */
export const spoilRate = (world: Pick<World, 'perks'>): number => (hasPerk(world, 'preserver') ? BALANCE.perks.preserverSpoilRate : 1);

export const inventorySlots = (perks: readonly PerkId[]): number => BALANCE.items.slots + (perks.includes('packrat') ? 1 : 0);

export const macheteCutSize = (world: Pick<World, 'perks'>): number => (hasPerk(world, 'sharpEdge') ? 2 : 1);

export const jumpSpeed = (world: Pick<World, 'perks'>): number => BALANCE.player.jumpSpeed * (hasPerk(world, 'springLegs') ? BALANCE.perks.springLegsJump : 1);

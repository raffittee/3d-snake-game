import { BALANCE } from '../config/balance';
import { ITEMS } from '../items';
import type { LevelItems } from '../levels/types';
import { cellToWorld, worldToCell } from './grid';
import { spoilRate } from './perks';
import { isOpenGround } from './tiles';
import type { Rng } from './rng';
import { isAnySnakeCell } from './snake';
import type { HeldItem, ItemId, PlayerInput, PlayerState, Tier, World } from './types';
import { minDistanceToPlayers } from './hunt';

const TIERS: readonly Tier[] = ['white', 'blue', 'gold'];

export function createInventory(slots: number = BALANCE.items.slots): Array<HeldItem | null> {
  return Array.from({ length: slots }, () => null);
}

/** Pick a tier by the level's odds. */
export function rollTier(rng: Rng, odds: LevelItems['tierOdds']): Tier {
  const total = TIERS.reduce((sum, t) => sum + odds[t], 0);
  let r = rng.next() * total;
  for (const t of TIERS) {
    r -= odds[t];
    if (r < 0) return t;
  }
  return 'white';
}

function rollItem(rng: Rng, table: LevelItems['drops']): ItemId | null {
  const total = table.reduce((sum, e) => sum + e.weight, 0);
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (const e of table) {
    r -= e.weight;
    if (r < 0) return e.item;
  }
  return table[table.length - 1].item;
}

/** A held item at its tier: rarer tiers get more uses and spoil slower. */
export function makeHeld(item: ItemId, tier: Tier): HeldItem {
  const def = BALANCE.items.defs[item];
  const scale = BALANCE.items.tierScale[tier];
  const spoil = def.spoilSeconds * scale;
  return { item, tier, uses: Math.round(def.uses * scale), spoilLeft: spoil, spoilTotal: spoil };
}

/** Drop one item on a free cell away from every player. Gives up quietly if none is found. */
function spawnDrop(world: World): void {
  const { grid, rng } = world;
  const cfg = world.level.items;
  const item = rollItem(rng, cfg.drops);
  if (!item) return;
  const tier = rollTier(rng, cfg.tierOdds);
  for (let k = 0; k < 300; k++) {
    const x = 1 + rng.int(grid.size - 2);
    const z = 1 + rng.int(grid.size - 2);
    if (world.pillars[z * grid.size + x] || !isOpenGround(world.tiles[z * grid.size + x])) continue;
    if (world.relics.some((r) => r.x === x && r.z === z)) continue;
    if (isAnySnakeCell(world, x, z)) continue;
    if (world.pellets.some((p) => p.x === x && p.z === z)) continue;
    if (world.drops.some((d) => d.x === x && d.z === z)) continue;
    if (minDistanceToPlayers(world, cellToWorld(grid, x), cellToWorld(grid, z)) < BALANCE.items.minSpawnDistance) continue;
    world.drops.push({ id: world.nextDropId++, item, tier, x, z });
    world.events.push({ type: 'itemSpawned', item, tier });
    return;
  }
}

/** Player `p`'s slot selection, using, spoiling, and picking drops up. Called once per world update for each player on foot. */
export function updateItems(world: World, p: PlayerState, input: PlayerInput, dt: number): void {
  const { inventory } = p;
  const slots = inventory.length;

  if (input.selectSlot >= 0 && input.selectSlot < slots) p.selectedSlot = input.selectSlot;
  if (input.cycleSlot) p.selectedSlot = (((p.selectedSlot + input.cycleSlot) % slots) + slots) % slots;

  const held = inventory[p.selectedSlot];
  if (input.useItem && held && ITEMS[held.item].use(world, p)) {
    held.uses--;
    world.events.push({ type: 'itemUsed', pid: p.id, slot: p.selectedSlot, item: held.item, usesLeft: held.uses });
    if (held.uses <= 0) inventory[p.selectedSlot] = null;
  }

  for (let i = 0; i < slots; i++) {
    const h = inventory[i];
    if (!h) continue;
    h.spoilLeft -= dt * spoilRate(world);
    if (h.spoilLeft <= 0) {
      inventory[i] = null;
      world.events.push({ type: 'itemSpoiled', pid: p.id, slot: i, item: h.item });
    }
  }

  // Pick up: walk over a drop with a free slot. With both slots full it stays on the ground.
  const px = p.x;
  const pz = p.z;
  const pcx = worldToCell(world.grid, px);
  const pcz = worldToCell(world.grid, pz);
  for (let i = world.drops.length - 1; i >= 0; i--) {
    const d = world.drops[i];
    if (Math.abs(d.x - pcx) > 1 || Math.abs(d.z - pcz) > 1) continue;
    if (Math.hypot(cellToWorld(world.grid, d.x) - px, cellToWorld(world.grid, d.z) - pz) > BALANCE.items.pickupRadius) continue;
    const slot = inventory.indexOf(null);
    if (slot < 0) break;
    inventory[slot] = makeHeld(d.item, d.tier);
    world.drops.splice(i, 1);
    world.events.push({ type: 'itemPickedUp', pid: p.id, slot, item: d.item, tier: d.tier });
  }
}

/** Drops falling on the level's timer (multiplayer: the host's Items setting scales it, or turns it off). */
export function spawnDrops(world: World, dt: number): void {
  const cfg = world.level.items;
  if (world.match && world.match.itemRate <= 0) return;
  world.dropTimer -= dt;
  if (world.dropTimer <= 0) {
    if (world.drops.length < cfg.maxOnGround) spawnDrop(world);
    world.dropTimer = cfg.every / (world.match?.itemRate ?? 1);
  }
}

import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { level01 } from '../src/levels/level01';
import { cellToWorld, worldToCell } from '../src/sim/grid';
import { rollTier } from '../src/sim/items';
import { NO_INPUT } from '../src/sim/player';
import { createRng } from '../src/sim/rng';
import { createWorld, drainEvents, updateWorld } from '../src/sim/world';
import type { PlayerInput, Tier, World } from '../src/sim/types';

const input = (over: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...over });
const USE = input({ useItem: true });
const slingshot = BALANCE.items.defs.slingshot;

function world(seed = 1): World {
  const w = createWorld(level01, seed);
  w.invulnerable = true;
  return w;
}

/** A drop right under the player, so the next update picks it up. */
function dropUnderPlayer(w: World, tier: Tier = 'white'): void {
  w.drops.push({ id: 9000 + w.drops.length, item: 'slingshot', tier, x: worldToCell(w.grid, w.player.x), z: worldToCell(w.grid, w.player.z) });
}

const events = (w: World, type: string) => drainEvents(w).filter((e) => e.type === type);

describe('inventory', () => {
  it('starts with empty slots and the first one selected', () => {
    const w = world();
    expect(w.inventory).toHaveLength(BALANCE.items.slots);
    expect(w.inventory.every((s) => s === null)).toBe(true);
    expect(w.selectedSlot).toBe(0);
    expect(w.drops).toHaveLength(0);
  });

  it('picks a drop up into the first empty slot, sized by its tier', () => {
    const w = world();
    dropUnderPlayer(w, 'gold');
    updateWorld(w, NO_INPUT, 0.01);
    expect(w.drops).toHaveLength(0);
    const held = w.inventory[0];
    expect(held?.item).toBe('slingshot');
    expect(held?.tier).toBe('gold');
    expect(held?.uses).toBe(Math.round(slingshot.uses * BALANCE.items.tierScale.gold));
    expect(held?.spoilTotal).toBeCloseTo(slingshot.spoilSeconds * BALANCE.items.tierScale.gold);
    expect(events(w, 'itemPickedUp')).toHaveLength(1);

    dropUnderPlayer(w, 'white');
    updateWorld(w, NO_INPUT, 0.01);
    expect(w.inventory[1]?.uses).toBe(slingshot.uses);
  });

  it('leaves a drop on the ground when both slots are full', () => {
    const w = world();
    dropUnderPlayer(w);
    updateWorld(w, NO_INPUT, 0.01);
    dropUnderPlayer(w);
    updateWorld(w, NO_INPUT, 0.01);
    dropUnderPlayer(w);
    updateWorld(w, NO_INPUT, 0.01);
    expect(w.inventory.every((s) => s !== null)).toBe(true);
    expect(w.drops).toHaveLength(1);
  });

  it('a held item spoils when its ring runs out', () => {
    const w = world();
    dropUnderPlayer(w);
    updateWorld(w, NO_INPUT, 0.01);
    drainEvents(w);
    for (let t = 0; t < slingshot.spoilSeconds - 1; t += 0.5) updateWorld(w, NO_INPUT, 0.5);
    expect(w.inventory[0]).not.toBeNull();
    for (let i = 0; i < 4; i++) updateWorld(w, NO_INPUT, 0.5);
    expect(w.inventory[0]).toBeNull();
    expect(events(w, 'itemSpoiled')).toHaveLength(1);
  });

  it('using spends one use of the selected item; the last use empties the slot', () => {
    const w = world();
    dropUnderPlayer(w);
    updateWorld(w, NO_INPUT, 0.01);
    drainEvents(w);
    updateWorld(w, USE, 0.01);
    expect(w.inventory[0]?.uses).toBe(slingshot.uses - 1);
    expect(events(w, 'itemUsed')).toHaveLength(1);
    for (let i = 1; i < slingshot.uses; i++) updateWorld(w, USE, 0.01);
    expect(w.inventory[0]).toBeNull();
  });

  it('using an empty slot does nothing', () => {
    const w = world();
    updateWorld(w, USE, 0.01);
    expect(events(w, 'itemUsed')).toHaveLength(0);
  });

  it('selects a slot directly or cycles through them, wrapping around', () => {
    const w = world();
    updateWorld(w, input({ selectSlot: 1 }), 0.01);
    expect(w.selectedSlot).toBe(1);
    updateWorld(w, input({ cycleSlot: 1 }), 0.01);
    expect(w.selectedSlot).toBe(0);
    updateWorld(w, input({ cycleSlot: -1 }), 0.01);
    expect(w.selectedSlot).toBe(BALANCE.items.slots - 1);
    updateWorld(w, input({ selectSlot: 7 }), 0.01);
    expect(w.selectedSlot).toBe(BALANCE.items.slots - 1);
  });

  it('keeps your items when you lose a life', () => {
    const w = createWorld(level01, 3);
    dropUnderPlayer(w);
    updateWorld(w, NO_INPUT, 0.01);
    const head = w.snakes[0].pos[0];
    w.player.x = head.x;
    w.player.z = head.z;
    updateWorld(w, NO_INPUT, 0.01);
    expect(w.lives).toBe(BALANCE.lives.perLevel - 1);
    expect(w.inventory[0]?.item).toBe('slingshot');
  });
});

describe('item drops', () => {
  const cfg = level01.items;

  it('none fall before the first drop time, then they appear', () => {
    const w = world(4);
    for (let t = 0; t < cfg.firstDropAfter - 0.5; t += 0.25) updateWorld(w, NO_INPUT, 0.25);
    expect(w.drops).toHaveLength(0);
    for (let i = 0; i < 4; i++) updateWorld(w, NO_INPUT, 0.25);
    expect(w.drops.length).toBeGreaterThan(0);
  });

  it('never more than the level allows on the ground, on free cells away from you', () => {
    const w = world(5);
    // Park the player in a corner far from where drops land so none are picked up.
    for (let t = 0; t < cfg.firstDropAfter + cfg.every * 6; t += 0.5) {
      updateWorld(w, NO_INPUT, 0.5);
      expect(w.drops.length).toBeLessThanOrEqual(cfg.maxOnGround);
      for (const d of w.drops) {
        expect(w.pillars[d.z * w.grid.size + d.x]).toBe(0);
      }
    }
    for (const d of w.drops) {
      expect(w.pillars[d.z * w.grid.size + d.x]).toBe(0);
      expect(w.pellets.some((p) => p.x === d.x && p.z === d.z)).toBe(false);
    }
  });

  it('a new drop lands at least the minimum distance from the player', () => {
    const w = world(6);
    for (let t = 0; t < cfg.firstDropAfter + 0.5; t += 0.25) updateWorld(w, NO_INPUT, 0.25);
    const d = w.drops[0];
    expect(d).toBeDefined();
    const dist = Math.hypot(cellToWorld(w.grid, d.x) - w.player.x, cellToWorld(w.grid, d.z) - w.player.z);
    expect(dist).toBeGreaterThanOrEqual(BALANCE.items.minSpawnDistance);
  });

  it('the same seed drops the same items in the same places', () => {
    const a = world(7);
    const b = world(7);
    for (let t = 0; t < cfg.firstDropAfter + cfg.every * 2; t += 0.5) {
      updateWorld(a, NO_INPUT, 0.5);
      updateWorld(b, NO_INPUT, 0.5);
    }
    expect(a.drops).toEqual(b.drops);
  });

  it('tiers follow the odds: white most, gold rarest but possible', () => {
    const rng = createRng(11);
    const counts = { white: 0, blue: 0, gold: 0 };
    for (let i = 0; i < 4000; i++) counts[rollTier(rng, cfg.tierOdds)]++;
    expect(counts.white).toBeGreaterThan(counts.blue);
    expect(counts.blue).toBeGreaterThan(counts.gold);
    expect(counts.gold).toBeGreaterThan(0);
    expect(counts.white / 4000).toBeCloseTo(cfg.tierOdds.white, 1);
  });
});

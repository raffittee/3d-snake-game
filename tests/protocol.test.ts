import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, createMatchWorld } from '../src/sim/match';
import type { MatchSettings } from '../src/sim/match';
import { CODE_ALPHABET, applySnapshot, encodeSnapshot, makeRoomCode, normalizeCode, normalizeName, packInput, toSimInput, unpackInput } from '../src/net/protocol';
import { makeHeld } from '../src/sim/items';
import { NO_INPUT } from '../src/sim/player';
import { createRng } from '../src/sim/rng';
import type { World } from '../src/sim/types';
import { updateWorld } from '../src/sim/world';

const DT = 1 / 30;

function played(settings: MatchSettings, seed: number, ticks: number): World {
  const w = createMatchWorld(settings, 3, seed);
  w.players[1].inventory[0] = makeHeld('machete', 'gold');
  for (let t = 0; t < ticks; t++) updateWorld(w, w.players.map((_p, i) => ({ ...NO_INPUT, forward: 1, strafe: Math.sin(t / 20 + i), sprint: t % 50 < 20 })), DT);
  return w;
}

const close = (a: number, b: number): boolean => Math.abs(a - b) <= 1.5e-3;

describe('snapshots', () => {
  it('a client built from the same settings and seed matches the server after one snapshot', () => {
    for (const terrain of ['plains', 'broken-house', 'frozen-lake'] as const) {
      const settings = { ...DEFAULT_SETTINGS, terrain, mode: 'infection' as const };
      const server = played(settings, 11, 400);
      const client = createMatchWorld(settings, 3, 11);
      applySnapshot(client, encodeSnapshot(server, 400, [5, 6, 7], [], true));
      expect(client.tiles).toEqual(server.tiles);
      expect(client.doorState).toEqual(server.doorState);
      expect(client.snakes.map((s) => [s.id, s.cells, s.prev, s.under, s.pilot])).toEqual(server.snakes.map((s) => [s.id, s.cells, s.prev, s.under, s.pilot]));
      for (let i = 0; i < server.snakes.length; i++) {
        server.snakes[i].pos.forEach((p, k) => {
          expect(close(client.snakes[i].pos[k].x, p.x) && close(client.snakes[i].pos[k].z, p.z)).toBe(true);
        });
      }
      expect(client.pellets).toEqual(server.pellets);
      expect(client.drops).toEqual(server.drops);
      expect(client.match).toEqual(server.match);
      expect(client.status).toBe(server.status);
      server.players.forEach((p, i) => {
        const c = client.players[i];
        for (const k of ['x', 'z', 'y', 'yaw', 'stamina', 'down'] as const) expect(close(c[k], p[k]), `${terrain} player ${i} ${k}`).toBe(true);
        for (const k of ['lives', 'out', 'snakeId', 'tired', 'egg', 'selectedSlot'] as const) expect(c[k]).toEqual(p[k]);
        expect(c.inventory.map((h) => h?.item ?? null)).toEqual(p.inventory.map((h) => h?.item ?? null));
      });
    }
  });

  it('a snapshot is small: a few kilobytes for 4 players without the ground', () => {
    const w = played({ ...DEFAULT_SETTINGS, mapSize: 96 }, 3, 600);
    const snap = encodeSnapshot(w, 1, [0, 0, 0], [], false);
    expect(JSON.stringify(snap).length).toBeLessThan(6000);
    expect(snap.tiles).toBeUndefined();
  });
});

describe('inputs and codes', () => {
  it('an input survives the wire, and the view goes as an absolute direction', () => {
    const input = { ...NO_INPUT, forward: 0.5, strafe: -1, sprint: true, jump: true, interact: true, selectSlot: 1 };
    const back = unpackInput(packInput(42, input, 1.25, -0.3));
    expect(back?.seq).toBe(42);
    expect(back?.input).toEqual({ ...input, turn: 0, lookYaw: 0, lookPitch: 0 });
    expect(back?.yaw).toBeCloseTo(1.25);
    const sim = toSimInput({ yaw: 1, pitch: 0 }, back?.input ?? NO_INPUT, back?.yaw ?? 0, back?.pitch ?? 0);
    expect(sim.lookYaw).toBeCloseTo(0.25);
    expect(sim.lookPitch).toBeCloseTo(-0.3);
  });

  it('rejects junk input', () => {
    expect(unpackInput('hi')).toBeNull();
    expect(unpackInput([1, 2, 3])).toBeNull();
    const huge = unpackInput([1, 1e9, -1e9, 255, 99, -99, 0, 0]);
    expect(huge?.input.forward).toBe(1);
    expect(huge?.input.strafe).toBe(-1);
    expect(huge?.input.selectSlot).toBe(8);
  });

  it('room codes use only unambiguous characters; typed codes are tidied', () => {
    const rng = createRng(5);
    for (let i = 0; i < 200; i++) {
      const code = makeRoomCode(() => rng.next());
      expect(code).toMatch(new RegExp(`^[${CODE_ALPHABET}]{6}$`));
    }
    expect(normalizeCode(' abc-def ')).toBe('ABCDEF');
    expect(normalizeCode('k7q2xp9')).toBe('K7Q2XP');
    expect(normalizeName('  <b>Rafi</b>  ')).toBe('bRafib');
    expect(normalizeName('')).toBe('Player');
  });
});

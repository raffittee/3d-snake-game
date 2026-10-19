/**
 * The game server end to end, in-process: real WebSocket rooms, real SDK clients (the same code the
 * browser runs), four bots playing a Classic round. Checks room codes, the lobby, the host's rights,
 * that every client sees the same match as the server (no desync), and the host leaving.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import type { Server } from '@colyseus/core';
import { createServer } from '../server/index';
import type { SnakeRoom } from '../server/SnakeRoom';
import { CODE_ALPHABET, CODE_LENGTH, MSG } from '../src/net/protocol';
import type { RoundStart, Snapshot } from '../src/net/protocol';
import { NetMatch } from '../src/net/netMatch';
import { NO_INPUT } from '../src/sim/player';
import type { World } from '../src/sim/types';

const PORT = 20000 + Math.floor(Math.random() * 20000);
let server: Server;

beforeAll(async () => {
  server = createServer();
  await server.listen(PORT);
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 5000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await sleep(10);
  }
}

/** A bot: joins, builds the round when it starts, sends inputs every frame and applies snapshots. */
class Bot {
  room!: Room;
  match: NetMatch | null = null;
  lastSnap: Snapshot | null = null;
  ended: string | null = null;
  starts = 0;
  constructor(readonly name: string) {}

  async create(): Promise<this> {
    this.room = await new Client(`ws://localhost:${PORT}`).create('snake', { name: this.name });
    this.wire();
    return this;
  }
  async join(code: string): Promise<this> {
    this.room = await new Client(`ws://localhost:${PORT}`).joinById(code, { name: this.name });
    this.wire();
    return this;
  }
  private wire(): void {
    this.room.onMessage(MSG.start, (s: RoundStart) => {
      this.match = new NetMatch(s);
      this.starts++;
    });
    this.room.onMessage(MSG.snapshot, (snap: Snapshot) => {
      this.lastSnap = snap;
      this.match?.receive(snap, Date.now());
    });
    this.room.onMessage(MSG.ended, (e: { reason: string }) => (this.ended = e.reason));
    this.room.onMessage(MSG.rtc, () => {});
  }
  /** One frame: wander in a circle, sometimes sprint. */
  step(t: number, dt: number): void {
    const m = this.match;
    if (!m) return;
    const yaw = Math.sin(t * 0.7 + m.you) * 2;
    for (const packet of m.frame(dt, { ...NO_INPUT, forward: 1, sprint: (t | 0) % 3 === 0 }, yaw, 0)) this.room.send(MSG.input, packet);
  }
}

const roomOf = (code: string): SnakeRoom => matchMaker.getLocalRoomById(code) as unknown as SnakeRoom;
const serverWorld = (code: string): World => (roomOf(code) as unknown as { world: World }).world;

describe('game server', () => {
  it('creates a private room with a 6-character code and fills a lobby', async () => {
    const host = await new Bot('Ana').create();
    const code = host.room.roomId;
    expect(code).toHaveLength(CODE_LENGTH);
    expect([...code].every((c) => CODE_ALPHABET.includes(c))).toBe(true);
    const guest = await new Bot('Ben').join(code);
    await until(() => guest.room.state.players?.size === 2);
    expect(guest.room.state.host).toBe(host.room.sessionId);
    expect([...guest.room.state.players.values()].map((p: { name: string }) => p.name).sort()).toEqual(['Ana', 'Ben']);
    await guest.room.leave();
    await host.room.leave();
  });

  it('only the host changes settings, and bad values are refused', async () => {
    const host = await new Bot('Ana').create();
    const guest = await new Bot('Ben').join(host.room.roomId);
    guest.room.send(MSG.settings, { terrain: 'cave' });
    host.room.send(MSG.settings, { mode: 'hotEgg', mapSize: 999 });
    await until(() => host.room.state.mode === 'hotEgg');
    expect(host.room.state.terrain).toBe('plains');
    expect(host.room.state.mapSize).toBe(64);
    await guest.room.leave();
    await host.room.leave();
  });

  it('four players finish a Classic round and every client sees what the server sees', { timeout: 30000 }, async () => {
    const host = await new Bot('P1').create();
    const code = host.room.roomId;
    const bots = [host, ...(await Promise.all(['P2', 'P3', 'P4'].map((n) => new Bot(n).join(code))))];
    await until(() => host.room.state.players?.size === 4);
    host.room.send(MSG.settings, { mode: 'classic', terrain: 'plains', rounds: 1 });
    await until(() => host.room.state.rounds === 1);
    host.room.send(MSG.begin);
    await until(() => bots.every((b) => b.match));
    expect(new Set(bots.map((b) => b.match?.you))).toEqual(new Set([0, 1, 2, 3]));
    // A late joiner is turned away once the match is on.
    await expect(new Bot('Late').join(code)).rejects.toBeTruthy();

    // Play for a few seconds of real time.
    const t0 = Date.now();
    let last = t0;
    while (Date.now() - t0 < 3000) {
      await sleep(16);
      const now = Date.now();
      for (const b of bots) b.step((now - t0) / 1000, (now - last) / 1000);
      last = now;
    }
    await sleep(150);
    const w = serverWorld(code);
    // Everyone moved, and the server applied their inputs.
    for (const b of bots) expect(b.lastSnap?.acks[b.match?.you ?? 0]).toBeGreaterThan(30);
    // No desync: every client holds the same snakes, pellets and players as the latest snapshot,
    // and their own predicted position stays close to the server's.
    const ref = bots[0].match?.world as World;
    for (const b of bots) {
      const cw = b.match?.world as World;
      expect(cw.snakes.map((s) => s.cells)).toEqual(ref.snakes.map((s) => s.cells));
      expect(cw.pellets).toEqual(ref.pellets);
      expect(b.match?.lastCorrection ?? 99).toBeLessThan(1.5);
    }
    expect(ref.snakes.map((s) => s.cells.length)).toEqual(w.snakes.map((s) => s.cells.length));
    expect(ref.tiles).toEqual(w.tiles);
    expect(ref.pillars).toEqual(w.pillars);

    // End the round (fill the nest) and see everyone get the result.
    const m = w.match;
    if (!m?.nest) throw new Error('no nest');
    m.nest.filled = m.nest.need;
    await until(() => bots.every((b) => b.match?.world.match?.winners !== null && b.match?.world.match?.winners !== undefined));
    expect(bots[1].match?.world.match?.winners).toEqual([0, 1, 2, 3]);
    await until(() => host.room.state.phase === 'between');
    // One round: after the break the match is over and the room is back in the lobby.
    await until(() => bots.every((b) => b.ended === 'done'), 10000);
    await until(() => host.room.state.phase === 'lobby');
    await Promise.all(bots.map((b) => b.room.leave()));
  });

  it('when the host leaves, the match ends for everyone', async () => {
    const host = await new Bot('Ana').create();
    const guest = await new Bot('Ben').join(host.room.roomId);
    let left = false;
    guest.room.onLeave(() => (left = true));
    await host.room.leave();
    await until(() => left && guest.ended !== null);
    expect(guest.ended).toMatch(/host left/i);
  });

  it('a mode that needs two players cannot start alone', async () => {
    const host = await new Bot('Ana').create();
    host.room.send(MSG.settings, { mode: 'infection' });
    await until(() => host.room.state.mode === 'infection');
    host.room.send(MSG.begin);
    await sleep(200);
    expect(host.room.state.phase).toBe('lobby');
    await host.room.leave();
  });
});

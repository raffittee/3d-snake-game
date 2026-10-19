import { randomInt } from 'node:crypto';
import { CloseCode, Room } from '@colyseus/core';
import type { Client } from '@colyseus/core';
import { BALANCE } from '../src/config/balance';
import { MSG, SNAPSHOT_MS, TICK_DT, TICK_HZ, encodeSnapshot, makeRoomCode, normalizeName, toSimInput, unpackInput } from '../src/net/protocol';
import type { RoundStart } from '../src/net/protocol';
import { LobbyPlayer, LobbyState } from '../src/net/schema';
import { createMatchWorld, matchOver, minPlayers, sanitizeSettings } from '../src/sim/match';
import type { MatchSettings } from '../src/sim/match';
import { NO_INPUT } from '../src/sim/player';
import type { PlayerInput, SimEvent, World } from '../src/sim/types';
import { drainEvents, updateWorld } from '../src/sim/world';

/** Codes of the rooms open on this server, so a new one never repeats a live one. */
const liveCodes = new Set<string>();

/** Seconds a dropped player (the host included) has to reconnect before they count as gone. */
const RECONNECT_SECONDS = 12;
/** Testing: `SNAKE_ROUND_SECONDS` makes every round this short (the e2e test plays a whole match). */
const ROUND_SECONDS = Number(process.env.SNAKE_ROUND_SECONDS) || 0;
/** Inputs a player may have waiting; older ones are dropped so lag never builds up. */
const MAX_QUEUE = 6;

interface Queued {
  seq: number;
  input: PlayerInput;
  yaw: number;
  pitch: number;
}

const random01 = (): number => randomInt(0, 2 ** 32) / 2 ** 32;

/**
 * One private room: a lobby with a 6-character code, then a match of rounds. The server runs the
 * sim (src/sim, unchanged) at a fixed tick and is the only authority; clients send inputs and draw
 * snapshots. The host picks the settings and starts; if the host leaves, the match ends for everyone.
 */
export class SnakeRoom extends Room<{ state: LobbyState }> {
  maxClients = BALANCE.multiplayer.maxPlayers;
  state = new LobbyState();

  private world: World | null = null;
  private seed = 0;
  private tick = 0;
  private acc = 0;
  /** Session id to player id for the current match. */
  private slots = new Map<string, number>();
  private queues: Queued[][] = [];
  private lastInput: Queued[] = [];
  private acks: number[] = [];
  private events: SimEvent[] = [];
  private sentTiles: Uint8Array | null = null;
  private sentDoors: Uint8Array | null = null;
  private forceKeyframe = true;
  private breakLeft = 0;

  onCreate(): void {
    let code = makeRoomCode(random01);
    while (liveCodes.has(code)) code = makeRoomCode(random01);
    liveCodes.add(code);
    this.roomId = code;
    this.state.code = code;
    // Private: only joinable by its code, never matched with strangers.
    void this.setPrivate(true);

    this.onMessage(MSG.settings, (client, raw: unknown) => {
      if (client.sessionId !== this.state.host || this.state.phase !== 'lobby') return;
      const s = sanitizeSettings({ ...this.settings(), ...(raw && typeof raw === 'object' ? raw : {}) });
      Object.assign(this.state, s);
    });
    this.onMessage(MSG.begin, (client) => {
      if (client.sessionId !== this.state.host || this.state.phase !== 'lobby') return;
      if (this.clients.length < minPlayers(this.settings().mode)) return;
      this.beginMatch();
    });
    this.onMessage(MSG.input, (client, raw: unknown) => {
      const slot = this.slots.get(client.sessionId);
      if (slot === undefined || !this.world) return;
      const packed = unpackInput(raw);
      if (!packed || packed.seq <= (this.lastInput[slot]?.seq ?? 0)) return;
      const q = this.queues[slot];
      q.push(packed);
      if (q.length > MAX_QUEUE) q.splice(0, q.length - MAX_QUEUE);
      this.lastInput[slot] = packed;
    });
    this.onMessage(MSG.hostMute, (client, raw: unknown) => {
      if (client.sessionId !== this.state.host || !raw || typeof raw !== 'object') return;
      const { sessionId, muted } = raw as { sessionId?: unknown; muted?: unknown };
      const p = typeof sessionId === 'string' ? this.state.players.get(sessionId) : undefined;
      if (p && sessionId !== this.state.host) p.hostMuted = !!muted;
    });
    // Voice setup (WebRTC offers, answers, ICE candidates): relayed to the one player it is for.
    this.onMessage(MSG.rtc, (client, raw: unknown) => {
      if (!raw || typeof raw !== 'object') return;
      const { to, data } = raw as { to?: unknown; data?: unknown };
      const target = this.clients.find((c) => c.sessionId === to);
      if (target && JSON.stringify(data ?? null).length < 20000) target.send(MSG.rtc, { from: client.sessionId, data });
    });

    this.setSimulationInterval((ms) => this.update(ms / 1000), 1000 / TICK_HZ);
    this.clock.setInterval(() => this.sendSnapshot(), SNAPSHOT_MS);
  }

  onJoin(client: Client, options?: { name?: unknown }): void {
    if (this.state.phase !== 'lobby') throw new Error('That match has already started.');
    if (!this.state.host) this.state.host = client.sessionId;
    const used = new Set([...this.state.players.values()].map((p) => p.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    this.state.players.set(client.sessionId, new LobbyPlayer({ name: normalizeName(options?.name), slot }));
  }

  onDrop(client: Client): void {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = false;
    try {
      void this.allowReconnection(client, RECONNECT_SECONDS).catch(() => {});
    } catch {
      // The room is shutting down: nothing to come back to.
    }
  }

  onReconnect(client: Client): void {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = true;
    // Back mid-round: rebuild the arena and get the ground with the next snapshot.
    if (this.world && this.state.phase === 'playing') {
      client.send(MSG.start, this.roundStart(client.sessionId));
      this.forceKeyframe = true;
    }
  }

  onLeave(client: Client, code?: number): void {
    if (client.sessionId === this.state.host) {
      this.broadcast(MSG.ended, { reason: code === CloseCode.CONSENTED ? 'The host left. The match is over.' : 'Lost the host. The match is over.' });
      void this.disconnect();
      return;
    }
    this.state.players.delete(client.sessionId);
    const slot = this.slots.get(client.sessionId);
    this.slots.delete(client.sessionId);
    // Gone for good mid-match: their player drops out of the round.
    if (slot !== undefined && this.world) {
      const pl = this.world.players[slot];
      pl.out = true;
      pl.egg = false;
      if (pl.snakeId !== null) {
        const s = this.world.snakes.find((q) => q.id === pl.snakeId);
        if (s) s.pilot = null;
        pl.snakeId = null;
      }
    }
  }

  onDispose(): void {
    liveCodes.delete(this.state.code);
  }

  private settings(): MatchSettings {
    const s = this.state;
    return sanitizeSettings({ terrain: s.terrain, mode: s.mode, mapSize: s.mapSize, snakeSpeed: s.snakeSpeed, rounds: s.rounds, roundMinutes: s.roundMinutes, items: s.items, proximityVoice: s.proximityVoice });
  }

  private beginMatch(): void {
    // Player ids in join order, 0 up.
    const players = [...this.state.players.entries()].sort((a, b) => a[1].slot - b[1].slot);
    this.slots = new Map(players.map(([id], i) => [id, i]));
    players.forEach(([, p], i) => (p.slot = i));
    void this.lock();
    this.startRound(1, []);
  }

  private startRound(round: number, points: number[]): void {
    const count = this.slots.size;
    this.seed = randomInt(1, 2 ** 31);
    this.world = createMatchWorld(this.settings(), count, this.seed, { round, points });
    if (ROUND_SECONDS > 0 && this.world.match) this.world.match.timeLeft = this.world.match.roundLength = ROUND_SECONDS;
    this.tick = 0;
    this.acc = 0;
    this.queues = Array.from({ length: count }, () => []);
    this.lastInput = [];
    this.acks = Array.from({ length: count }, () => 0);
    this.events = [];
    this.forceKeyframe = true;
    this.state.round = round;
    this.state.phase = 'playing';
    // Someone who left in the lobby before the start is not in the match; anyone who left since is out.
    for (const client of this.clients) client.send(MSG.start, this.roundStart(client.sessionId));
  }

  private roundStart(sessionId: string): RoundStart {
    const names: string[] = [];
    for (const [id, slot] of this.slots) names[slot] = this.state.players.get(id)?.name ?? 'Player';
    const m = this.world?.match;
    return { seed: this.seed, settings: this.settings(), count: this.slots.size, you: this.slots.get(sessionId) ?? -1, round: m?.round ?? 1, points: m ? [...m.points] : [], names };
  }

  /** Fixed-step sim: whatever time passed is run in whole ticks, each consuming one queued input per player. */
  private update(dt: number): void {
    if (this.state.phase === 'between') {
      this.breakLeft -= dt;
      if (this.breakLeft <= 0) this.nextRound();
      return;
    }
    const world = this.world;
    if (!world || this.state.phase !== 'playing') return;
    this.acc = Math.min(this.acc + dt, TICK_DT * 5);
    while (this.acc >= TICK_DT) {
      this.acc -= TICK_DT;
      const inputs = world.players.map((p, slot) => {
        const next = this.queues[slot]?.shift();
        if (next) {
          this.acks[slot] = next.seq;
          return toSimInput(p, next.input, next.yaw, next.pitch);
        }
        // Nothing new arrived: keep walking the way they were, without repeating presses.
        const last = this.lastInput[slot];
        if (!last) return NO_INPUT;
        return toSimInput(p, { ...last.input, jump: false, useItem: false, interact: false, selectSlot: -1, cycleSlot: 0 }, last.yaw, last.pitch);
      });
      updateWorld(world, inputs, TICK_DT);
      this.tick++;
      this.events.push(...drainEvents(world));
      if (world.status !== 'playing') {
        this.sendSnapshot();
        this.state.phase = 'between';
        this.breakLeft = BALANCE.multiplayer.roundBreak;
        return;
      }
    }
  }

  private nextRound(): void {
    const m = this.world?.match;
    if (!m || matchOver(m)) {
      // All rounds played: back to the lobby (the final scoreboard stays up on the clients).
      this.broadcast(MSG.ended, { reason: 'done', points: m?.points ?? [] });
      this.world = null;
      this.state.phase = 'lobby';
      this.state.round = 0;
      void this.unlock();
      return;
    }
    this.startRound(m.round + 1, m.points);
  }

  private sendSnapshot(): void {
    const world = this.world;
    if (!world) return;
    // The ground and doors go out whenever they changed since the last send (and after a start or a
    // reconnect). WebSocket messages arrive reliably and in order, so nothing else is needed.
    const tilesChanged = !this.sentTiles || !sameBytes(this.sentTiles, world.tiles) || !this.sentDoors || !sameBytes(this.sentDoors, world.doorState);
    const keyframe = this.forceKeyframe || tilesChanged;
    if (keyframe) {
      this.sentTiles = world.tiles.slice();
      this.sentDoors = world.doorState.slice();
      this.forceKeyframe = false;
    }
    const snap = encodeSnapshot(world, this.tick, this.acks, this.events, keyframe);
    this.events = [];
    this.broadcast(MSG.snapshot, snap);
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

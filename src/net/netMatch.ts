/**
 * The client's copy of a multiplayer round (plain TypeScript, no DOM): the arena built from the
 * server's settings and seed, kept up to date from snapshots.
 *
 * - Your own player is predicted: each tick runs your input through the same movement code the
 *   server runs (sim/player.ts, collidePlayer) right away, and when a snapshot arrives your player
 *   is reset to the server's and the inputs it has not applied yet are run again (reconciliation).
 * - Other players are drawn `INTERP_MS` in the past, blended between the two snapshots around that time.
 * - Snakes come from the latest snapshot; between snapshots their step progress runs on locally, so
 *   they glide between cells exactly as the sim draws them.
 */
import { createMatchWorld } from '../sim/match';
import { onFoot } from '../sim/hunt';
import { computeSegmentPositions } from '../sim/snake';
import { updatePlayer } from '../sim/player';
import type { PlayerInput, PlayerState, SimEvent, World } from '../sim/types';
import { collidePlayer } from '../sim/world';
import { TICK_DT, applySnapshot, packInput, toSimInput } from './protocol';
import type { NetInput, RoundStart, Snapshot } from './protocol';

/** How far behind other players are drawn, so there is always a snapshot on each side. */
export const INTERP_MS = 110;

interface Pending {
  seq: number;
  input: PlayerInput;
  yaw: number;
  pitch: number;
}

interface Sample {
  t: number;
  x: number;
  z: number;
  y: number;
  yaw: number;
  pitch: number;
}

/** Where a remote player is drawn right now. */
export interface RemoteView {
  x: number;
  z: number;
  y: number;
  yaw: number;
  pitch: number;
}

const lerpAngle = (a: number, b: number, t: number): number => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export class NetMatch {
  readonly world: World;
  readonly you: number;
  readonly start: RoundStart;
  private seq = 0;
  private pending: Pending[] = [];
  private samples = new Map<number, Sample[]>();
  /** Your player's position at the last two predicted ticks, for smooth drawing between ticks. */
  private prevPos = { x: 0, z: 0, y: 0 };
  private tickAcc = 0;
  /** The newest snapshot tick seen (late ones are dropped). */
  private lastTick = -1;
  /** Snapshots received (for the debug panel), and how far the last correction moved you. */
  snapshots = 0;
  lastCorrection = 0;

  constructor(start: RoundStart) {
    this.start = start;
    this.you = start.you;
    this.world = createMatchWorld(start.settings, start.count, start.seed, { round: start.round, points: start.points });
    // On this client, world.player (what the HUD and the camera follow) is you.
    const world = this.world;
    const you = Math.max(0, Math.min(start.count - 1, start.you));
    Object.defineProperty(world, 'player', { get: () => world.players[you], enumerable: false, configurable: true });
    const me = this.me;
    this.prevPos = { x: me.x, z: me.z, y: me.y };
  }

  get me(): PlayerState {
    return this.world.players[this.you];
  }

  /**
   * Advance by a frame of `dt` seconds. Every whole tick in it sends one input (returned, to put on
   * the wire) and predicts your movement. `edges` (jump, use, slot keys) go out on the first tick.
   */
  frame(dt: number, frameInput: PlayerInput, yaw: number, pitch: number): NetInput[] {
    const out: NetInput[] = [];
    // Presses from a frame with no tick in it wait for the next tick, so a quick tap is never lost.
    const input = mergeEdges(this.carry, frameInput);
    this.carry = null;
    this.tickAcc += dt;
    let first = true;
    while (this.tickAcc >= TICK_DT) {
      this.tickAcc -= TICK_DT;
      const tickInput = first ? input : { ...input, jump: false, useItem: false, interact: false, selectSlot: -1, cycleSlot: 0 };
      first = false;
      const seq = ++this.seq;
      this.pending.push({ seq, input: tickInput, yaw, pitch });
      if (this.pending.length > 90) this.pending.shift();
      const me = this.me;
      this.prevPos = { x: me.x, z: me.z, y: me.y };
      this.predict(tickInput, yaw, pitch);
      out.push(packInput(seq, tickInput, yaw, pitch));
    }
    if (first) this.carry = input;
    this.advanceSnakes(dt);
    return out;
  }

  /** Button presses from a frame with no tick in it. */
  private carry: PlayerInput | null = null;

  /** Run one tick of your own movement locally. Events it makes (a jump) are yours to play now. */
  readonly localEvents: SimEvent[] = [];

  private predict(input: PlayerInput, yaw: number, pitch: number): void {
    const me = this.me;
    if (!onFoot(me) || this.world.status !== 'playing') return;
    const events = this.world.events;
    this.world.events = this.localEvents;
    updatePlayer(this.world, me, toSimInput(me, input, yaw, pitch), TICK_DT);
    collidePlayer(this.world, me);
    this.world.events = events;
  }

  /** Between snapshots, each snake's step progress runs on, as on the server. */
  private advanceSnakes(dt: number): void {
    for (const s of this.world.snakes) {
      // Frozen (stunned, pinned, about to break the surface): it holds still on the server too.
      if (s.stunTimer > 0 || s.interval <= 0 || s.burrow.mode === 'rising') continue;
      s.timer = Math.min(s.interval, s.timer + dt);
      computeSegmentPositions(s, this.world.grid, s.timer / s.interval);
    }
  }

  /** A snapshot arrived (at `now` ms, client clock). Returns the server's events since the last one. */
  receive(snap: Snapshot, now: number): SimEvent[] {
    if (snap.tick <= this.lastTick) return [];
    this.lastTick = snap.tick;
    this.snapshots++;
    const me = this.me;
    const before = { x: me.x, z: me.z };
    applySnapshot(this.world, snap);
    // Reconcile: start from the server's view of you and replay what it has not seen yet.
    const ack = snap.acks[this.you] ?? 0;
    this.pending = this.pending.filter((p) => p.seq > ack);
    const scratch = this.localEvents.length;
    for (const p of this.pending) this.predict(p.input, p.yaw, p.pitch);
    // Replayed jumps were already played when first predicted.
    this.localEvents.length = scratch;
    this.lastCorrection = Math.hypot(me.x - before.x, me.z - before.z);
    // The view is yours: keep the newest look direction rather than the server's slightly older one.
    const last = this.pending[this.pending.length - 1];
    if (last) {
      me.yaw = last.yaw;
      me.pitch = last.pitch;
    }
    this.prevPos = { x: me.x, z: me.z, y: me.y };
    for (const p of this.world.players) {
      if (p.id === this.you) continue;
      const list = this.samples.get(p.id) ?? [];
      list.push({ t: now, x: p.x, z: p.z, y: p.y, yaw: p.yaw, pitch: p.pitch });
      while (list.length > 20) list.shift();
      this.samples.set(p.id, list);
    }
    return snap.events.filter((e) => !(e.type === 'jumped' && e.pid === this.you));
  }

  /** Where to draw your own player: blended between the last two ticks by how far into the next one we are. */
  myView(): { x: number; z: number; y: number } {
    const me = this.me;
    const t = Math.min(1, this.tickAcc / TICK_DT);
    return { x: this.prevPos.x + (me.x - this.prevPos.x) * t, z: this.prevPos.z + (me.z - this.prevPos.z) * t, y: this.prevPos.y + (me.y - this.prevPos.y) * t };
  }

  /** Where to draw remote player `id` at client time `now` (ms). */
  remoteView(id: number, now: number): RemoteView {
    const p = this.world.players[id];
    const list = this.samples.get(id);
    if (!list || list.length === 0) return { x: p.x, z: p.z, y: p.y, yaw: p.yaw, pitch: p.pitch };
    const t = now - INTERP_MS;
    let i = list.length - 1;
    while (i > 0 && list[i - 1].t > t) i--;
    const b = list[i];
    const a = list[Math.max(0, i - 1)];
    if (a === b || b.t <= a.t) return { x: b.x, z: b.z, y: b.y, yaw: b.yaw, pitch: b.pitch };
    const k = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, y: a.y + (b.y - a.y) * k, yaw: lerpAngle(a.yaw, b.yaw, k), pitch: a.pitch + (b.pitch - a.pitch) * k };
  }
}

/** Presses (edges) from either input; held axes from `now`. */
function mergeEdges(prev: PlayerInput | null, now: PlayerInput): PlayerInput {
  if (!prev) return now;
  return {
    ...now,
    jump: now.jump || prev.jump,
    useItem: now.useItem || prev.useItem,
    interact: now.interact || prev.interact,
    selectSlot: now.selectSlot >= 0 ? now.selectSlot : prev.selectSlot,
    cycleSlot: now.cycleSlot || prev.cycleSlot,
  };
}

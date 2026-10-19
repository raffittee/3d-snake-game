/**
 * The browser's connection to the game server (Colyseus SDK): create a room or join one by code,
 * then the lobby state, round starts and snapshots come in through callbacks.
 */
import { Client } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';
import type { MatchSettings } from '../sim/match';
import { MSG } from './protocol';
import type { NetInput, RoundStart, Snapshot } from './protocol';
import type { LobbyState } from './schema';

/** One lobby player as the UI sees it. */
export interface LobbyMember {
  sessionId: string;
  name: string;
  slot: number;
  connected: boolean;
  hostMuted: boolean;
}

/** The lobby as the UI sees it (a plain copy of the synced room state). */
export interface LobbyView {
  code: string;
  host: string;
  phase: string;
  round: number;
  settings: MatchSettings;
  members: LobbyMember[];
}

export interface NetHandlers {
  lobby(view: LobbyView): void;
  start(start: RoundStart): void;
  snapshot(snap: Snapshot): void;
  ended(reason: string, points: number[]): void;
  rtc(from: string, data: unknown): void;
  /** The connection is gone (left, kicked, or lost and not regained). */
  closed(reason: string): void;
}

/**
 * Where the server is: `?server=` (a ws:// or wss:// URL, or host:port), else the build's
 * VITE_SERVER_URL, else this page's host on port 2567 (running `npm run server` next to `npm run dev`).
 */
export function serverUrl(search: string = location.search): string {
  const param = new URLSearchParams(search).get('server');
  const env = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? '';
  const raw = param || env;
  const secure = location.protocol === 'https:';
  if (raw) return /^wss?:\/\//.test(raw) ? raw : `${secure ? 'wss' : 'ws'}://${raw}`;
  return `${secure ? 'wss' : 'ws'}://${location.hostname || 'localhost'}:2567`;
}

export class NetClient {
  private room: Room | null = null;
  private leaving = false;

  constructor(private readonly handlers: NetHandlers, private readonly url = serverUrl()) {}

  get sessionId(): string {
    return this.room?.sessionId ?? '';
  }

  get connected(): boolean {
    return this.room !== null;
  }

  async create(name: string): Promise<void> {
    this.attach(await new Client(this.url).create('snake', { name }));
  }

  async join(code: string, name: string): Promise<void> {
    this.attach(await new Client(this.url).joinById(code, { name }));
  }

  private attach(room: Room): void {
    this.room = room;
    this.leaving = false;
    room.onStateChange((state: LobbyState) => this.handlers.lobby(lobbyView(state)));
    room.onMessage(MSG.start, (s: RoundStart) => this.handlers.start(s));
    room.onMessage(MSG.snapshot, (s: Snapshot) => this.handlers.snapshot(s));
    room.onMessage(MSG.ended, (e: { reason: string; points?: number[] }) => this.handlers.ended(e.reason, e.points ?? []));
    room.onMessage(MSG.rtc, (m: { from: string; data: unknown }) => this.handlers.rtc(m.from, m.data));
    room.onLeave((code: number) => {
      this.room = null;
      this.handlers.closed(this.leaving ? '' : code === 1000 || code === 4000 ? '' : 'Lost the connection to the server.');
    });
  }

  send(type: string, payload?: unknown): void {
    this.room?.send(type, payload);
  }

  sendInput(packet: NetInput): void {
    this.room?.send(MSG.input, packet);
  }

  setSettings(s: Partial<MatchSettings>): void {
    this.send(MSG.settings, s);
  }

  begin(): void {
    this.send(MSG.begin);
  }

  hostMute(sessionId: string, muted: boolean): void {
    this.send(MSG.hostMute, { sessionId, muted });
  }

  rtc(to: string, data: unknown): void {
    this.send(MSG.rtc, { to, data });
  }

  async leave(): Promise<void> {
    this.leaving = true;
    const room = this.room;
    this.room = null;
    await room?.leave().catch(() => undefined);
  }
}

function lobbyView(s: LobbyState): LobbyView {
  const members: LobbyMember[] = [];
  s.players?.forEach((p, sessionId) => members.push({ sessionId, name: p.name, slot: p.slot, connected: p.connected, hostMuted: p.hostMuted }));
  members.sort((a, b) => a.slot - b.slot);
  return {
    code: s.code,
    host: s.host,
    phase: s.phase,
    round: s.round,
    settings: {
      terrain: s.terrain as MatchSettings['terrain'],
      mode: s.mode as MatchSettings['mode'],
      mapSize: s.mapSize as MatchSettings['mapSize'],
      snakeSpeed: s.snakeSpeed as MatchSettings['snakeSpeed'],
      rounds: s.rounds as MatchSettings['rounds'],
      roundMinutes: s.roundMinutes as MatchSettings['roundMinutes'],
      items: s.items as MatchSettings['items'],
      proximityVoice: s.proximityVoice,
    },
    members,
  };
}

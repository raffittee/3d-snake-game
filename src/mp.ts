/**
 * Multiplayer in the browser: the "Play with friends" card, the lobby, the match and the
 * scoreboard, voice. Owns the connection (src/net/client.ts), the client's copy of the round
 * (src/net/netMatch.ts) and voice (src/net/voice.ts); draws through the game's renderer and HUD.
 * The server runs the rules: this only sends inputs and shows what comes back.
 */
import type { Audio8 } from './audio';
import { BALANCE } from './config/balance';
import type { Input } from './input';
import { NetClient } from './net/client';
import type { LobbyView } from './net/client';
import { NetMatch } from './net/netMatch';
import { normalizeCode, normalizeName } from './net/protocol';
import type { RoundStart, Snapshot } from './net/protocol';
import { Voice } from './net/voice';
import type { CameraView, GameRenderer } from './render/renderer';
import { MODE_INFO } from './levels/modes';
import { clamp } from './sim/math';
import { NO_INPUT } from './sim/player';
import { onFoot } from './sim/hunt';
import { wallBetween } from './sim/probe';
import type { PlayerInput, PlayerState, SimEvent, World } from './sim/types';
import { dangerLevel, gapToSnake } from './sim/world';
import { loadName, loadTalkMode, saveName, saveTalkMode } from './storage';
import { $ } from './ui/dom';
import type { Hud } from './ui/hud';
import { LobbyPanel } from './ui/lobby';
import type { VoiceInfo } from './ui/lobby';
import { MpHud, ROUND_BREAK } from './ui/mpHud';
import type { PanelName, Panels } from './ui/panels';

export interface MpDeps {
  renderer: GameRenderer;
  hud: Hud;
  panels: Panels;
  audio: Audio8;
  input: Input;
  cam: CameraView;
  /** Play the sounds and HUD flashes for sim events, as in single player. `me` is your player id. */
  events(events: SimEvent[], world: World, me: number): void;
  /** Back to the title card. */
  exit(): void;
  /** Open the settings card; Back returns to `back`. */
  settings(back: PanelName): void;
}

type Phase = 'off' | 'entry' | 'connecting' | 'lobby' | 'play' | 'round';

export class Multiplayer {
  phase: Phase = 'off';
  private net: NetClient | null = null;
  private voice: Voice | null = null;
  private lobby: LobbyView | null = null;
  match: NetMatch | null = null;
  private names: string[] = [];
  private paused = false;
  private viewYaw = 0;
  private viewPitch = 0;
  private bob = 0;
  private breakLeft = 0;
  private talking = new Set<string>();
  private readonly lobbyPanel: LobbyPanel;
  private readonly mpHud = new MpHud();
  /** Whether the round in hand is over (the scoreboard is up). */
  private roundDone = false;

  constructor(private readonly d: MpDeps) {
    this.lobbyPanel = new LobbyPanel({
      setting: (key, value) => this.net?.setSettings({ [key]: value }),
      start: () => this.net?.begin(),
      leave: () => void this.leave(),
      talkMode: (mode) => {
        this.voice?.setMode(mode);
        saveTalkMode(mode);
      },
      peerVolume: (id, v) => this.voice?.setPeerVolume(id, v),
      peerMute: (id, m) => {
        this.voice?.setPeerMuted(id, m);
        this.refreshLobby();
      },
      hostMute: (id, m) => this.net?.hostMute(id, m),
    });
    $<HTMLInputElement>('mpName').value = loadName();
    $<HTMLSelectElement>('talkMode').value = loadTalkMode();
    // A shared link can carry the code: ?room=K7Q2XP.
    const fromLink = normalizeCode(new URLSearchParams(location.search).get('room') ?? '');
    if (fromLink) $<HTMLInputElement>('mpCode').value = fromLink;
    $('mpCreate').addEventListener('click', () => void this.connect(null));
    $('mpJoin').addEventListener('click', () => void this.connect($<HTMLInputElement>('mpCode').value));
    $('mpCode').addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') void this.connect($<HTMLInputElement>('mpCode').value);
    });
    $('mpBack').addEventListener('click', () => this.close());
    $('roundLeave').addEventListener('click', () => void this.leave());
    $('roundLobby').addEventListener('click', () => this.toLobby());
    $('mpResumeBtn').addEventListener('click', () => this.resume());
    $('mpLeaveBtn').addEventListener('click', () => void this.leave());
    $('settingsFromLobby').addEventListener('click', () => this.d.settings('lobby'));
    $('settingsFromMpPause').addEventListener('click', () => this.d.settings('mpPause'));
  }

  /** In a round (playing, or looking at its scoreboard): the game loop hands frames to us. */
  get inMatch(): boolean {
    return (this.phase === 'play' || this.phase === 'round') && this.match !== null;
  }

  /** The panel to go back to from Settings. */
  get backPanel(): PanelName {
    if (this.phase === 'lobby') return 'lobby';
    if (this.phase === 'play') return 'mpPause';
    return 'mp';
  }

  /** The "Play with friends" card. */
  open(): void {
    this.phase = 'entry';
    this.error('');
    this.d.panels.show('mp');
  }

  private close(): void {
    this.phase = 'off';
    this.d.exit();
  }

  private error(text: string): void {
    $('mpError').textContent = text;
  }

  private async connect(code: string | null): Promise<void> {
    if (this.phase === 'connecting') return;
    const name = normalizeName($<HTMLInputElement>('mpName').value);
    $<HTMLInputElement>('mpName').value = name;
    saveName(name);
    const clean = code === null ? null : normalizeCode(code);
    if (clean !== null && clean.length !== 6) {
      this.error('A room code is 6 characters.');
      return;
    }
    this.phase = 'connecting';
    this.error(clean ? `Joining ${clean}…` : 'Creating a room…');
    this.d.audio.unlock();
    const net = new NetClient({
      lobby: (v) => this.onLobby(v),
      start: (s) => this.onStart(s),
      snapshot: (s) => this.onSnapshot(s),
      ended: (reason) => this.onEnded(reason),
      rtc: (from, data) => void this.voice?.onSignal(from, data),
      closed: (reason) => this.onClosed(reason),
    });
    try {
      if (clean) await net.join(clean, name);
      else await net.create(name);
    } catch (err) {
      this.phase = 'entry';
      this.error(joinError(err, clean));
      return;
    }
    this.net = net;
    this.phase = 'lobby';
    this.error('');
    this.voice = new Voice((to, data) => this.net?.rtc(to, data), net.sessionId);
    this.voice.setMode(loadTalkMode());
    if (this.lobby) this.voice.syncMembers(this.lobby.members.map((m) => m.sessionId), new Set());
    this.d.panels.show('lobby');
    this.refreshLobby();
    // The browser asks for the mic here; declining still lets you play and hear everyone.
    await this.voice.start();
    this.refreshLobby();
  }

  private voiceInfo(): VoiceInfo {
    const v = this.voice;
    const state = !v ? '' : v.micError || (v.hostMutedYou ? 'The host muted you' : v.talkMode === 'ptt' ? 'Mic on: hold V to talk' : 'Mic on: open');
    return { micState: state, volume: (id) => v?.peerVolume(id) ?? 1, muted: (id) => v?.peerMuted(id) ?? false };
  }

  private refreshLobby(): void {
    if (this.lobby && this.net) this.lobbyPanel.update(this.lobby, this.net.sessionId, this.voiceInfo(), this.talking);
  }

  private onLobby(v: LobbyView): void {
    this.lobby = v;
    this.voice?.syncMembers(
      v.members.map((m) => m.sessionId),
      new Set(v.members.filter((m) => m.hostMuted).map((m) => m.sessionId)),
    );
    this.refreshLobby();
  }

  private onStart(s: RoundStart): void {
    this.match = new NetMatch(s);
    this.names = s.names;
    this.roundDone = false;
    this.phase = 'play';
    this.paused = false;
    const me = this.match.me;
    this.viewYaw = me.yaw;
    this.viewPitch = me.pitch;
    this.d.input.reset();
    this.d.input.active = true;
    this.d.panels.show(null);
    this.d.panels.setPlayUI(true);
    this.mpHud.show(true);
    this.d.renderer.avatars.names = s.names;
    this.d.input.requestLock();
    this.d.audio.start();
  }

  private onSnapshot(snap: Snapshot): void {
    const m = this.match;
    if (!m) return;
    const events = m.receive(snap, performance.now());
    this.d.events(events, m.world, m.you);
    if (m.world.match?.winners && !this.roundDone) this.showRound();
  }

  private showRound(): void {
    const m = this.match;
    if (!m) return;
    this.roundDone = true;
    this.phase = 'round';
    this.breakLeft = ROUND_BREAK;
    this.d.input.active = false;
    this.d.input.reset();
    this.d.input.releaseLock();
    this.d.panels.setPlayUI(false);
    this.d.hud.clearDanger();
    this.d.cam.danger = 0;
    this.mpHud.show(false);
    this.mpHud.showRound(m.world, m.you, this.names, this.breakLeft);
    const won = m.world.match?.winners?.includes(m.you);
    if (won) this.d.audio.gateOpened();
    else this.d.audio.death();
    this.d.panels.show('round');
  }

  private onEnded(reason: string): void {
    if (reason === 'done') {
      // All rounds played: the scoreboard stays up with "Back to the lobby".
      if (this.match && !this.roundDone) this.showRound();
      $('roundLobby').hidden = false;
      $('roundNext').textContent = 'Match over. Final points above.';
      return;
    }
    void this.leave(reason);
  }

  private onClosed(reason: string): void {
    if (this.phase === 'off') return;
    this.cleanup();
    if (reason) {
      this.d.exit();
      this.open();
      this.error(reason);
    }
  }

  private toLobby(): void {
    this.match = null;
    this.phase = 'lobby';
    this.d.panels.setPlayUI(false);
    this.mpHud.show(false);
    this.d.panels.show('lobby');
    this.refreshLobby();
  }

  /** Esc mid-round: the pause card (the match goes on without you). */
  pause(): void {
    if (this.phase !== 'play' || this.paused) return;
    this.paused = true;
    this.d.input.active = false;
    this.d.input.reset();
    this.d.input.releaseLock();
    this.lobbyPanel.updatePause(this.voiceInfo(), this.talking);
    this.d.panels.show('mpPause');
  }

  private resume(): void {
    if (this.phase !== 'play') return;
    this.paused = false;
    this.d.input.active = true;
    this.d.panels.show(null);
    this.d.input.requestLock();
  }

  async leave(reason = ''): Promise<void> {
    const net = this.net;
    this.cleanup();
    await net?.leave();
    this.d.exit();
    if (reason) {
      this.open();
      this.error(reason);
    }
  }

  private cleanup(): void {
    this.d.hud.clearDanger();
    this.voice?.stop();
    this.voice = null;
    this.net = null;
    this.match = null;
    this.lobby = null;
    this.phase = 'off';
    this.paused = false;
    this.d.input.active = false;
    this.d.input.releaseLock();
    this.d.panels.setPlayUI(false);
    this.mpHud.show(false);
  }

  /** Each frame while multiplayer is open. Returns true when it drew the frame (a round is on). */
  frame(dt: number, now: number): boolean {
    this.updateVoice();
    const m = this.match;
    if (!m || !this.inMatch) return false;
    if (this.phase === 'round') {
      this.breakLeft -= dt;
      this.mpHud.showRound(m.world, m.you, this.names, this.breakLeft);
    }
    const me = m.me;
    const raw = this.phase === 'play' && !this.paused ? this.d.input.sample() : NO_INPUT;
    const piloting = me.snakeId !== null;
    // Your view turns right away (mouse, Q/E; A/D too while steering a snake): never wait for a tick.
    const keyTurn = piloting ? BALANCE.pilot.keyTurnRate : BALANCE.player.keyTurnRate;
    this.viewYaw += raw.lookYaw + (raw.turn - (piloting ? raw.strafe : 0)) * keyTurn * dt;
    this.viewPitch = piloting ? clamp(this.viewPitch + raw.lookPitch, -1.2, 0.3) : clamp(this.viewPitch + raw.lookPitch, -BALANCE.player.maxPitch, BALANCE.player.maxPitch);
    const input: PlayerInput = piloting ? { ...raw, forward: 0, strafe: 0, turn: 0 } : { ...raw, turn: 0 };
    for (const packet of m.frame(dt, input, this.viewYaw, this.viewPitch)) this.net?.sendInput(packet);
    if (m.localEvents.length) this.d.events(m.localEvents.splice(0), m.world, m.you);
    if (onFoot(me) && me.moving && me.y === 0) this.bob += dt * (me.sprinting ? 14 : 9);
    this.draw(dt, now);
    return true;
  }

  private draw(dt: number, now: number): void {
    const m = this.match;
    if (!m) return;
    const w = m.world;
    const me = m.me;
    const cam = this.d.cam;
    // Drawn where they look smooth: you between ticks, everyone else a little in the past.
    const saved = w.players.map((p) => ({ x: p.x, z: p.z, y: p.y, yaw: p.yaw, pitch: p.pitch }));
    Object.assign(me, m.myView(), { yaw: this.viewYaw, pitch: this.viewPitch });
    for (const p of w.players) if (p !== me && p.snakeId === null) Object.assign(p, m.remoteView(p.id, now));
    cam.danger = onFoot(me) ? dangerLevel(gapToSnake(w, me)) : 0;
    cam.bob = this.bob;
    const follow = this.followTarget(w, me);
    if (follow) {
      cam.mode = 'follow';
      cam.follow = follow;
    } else {
      cam.mode = 'play';
      cam.yaw = this.viewYaw;
      cam.pitch = this.viewPitch;
    }
    this.d.renderer.avatars.talking = new Set(this.talkingIds());
    this.d.renderer.render(w, cam, dt, now);
    if (this.phase === 'play') {
      this.d.hud.drawMap(w);
      this.d.hud.update(w, cam.danger, false, 0, { levelNumber: w.match?.round ?? 1, levelName: w.match ? MODE_INFO[w.match.mode].name : '', xpLevel: 0, xpFraction: 0, keenEars: false, snakeBearing: 0 });
      this.mpHud.update(w, me, this.names, new Set(this.talkingIds()), !!this.voice?.sending);
    }
    this.proximity(w, me);
    w.players.forEach((p, i) => Object.assign(p, saved[i]));
  }

  /** Steering a snake: behind its head. Out of the round: behind someone still in it. Otherwise first person. */
  private followTarget(w: World, me: PlayerState): CameraView['follow'] | null {
    if (me.snakeId !== null) {
      const s = w.snakes.find((q) => q.id === me.snakeId);
      if (s) return { x: s.pos[0].x, z: s.pos[0].z, yaw: this.viewYaw, back: 7, height: 4.6 };
    }
    if (me.out) {
      const other = w.players.find((p) => p !== me && onFoot(p));
      if (other) return { x: other.x, z: other.z, yaw: other.yaw, back: 5, height: 3.4 };
      const s = w.snakes[0];
      if (s) return { x: s.pos[0].x, z: s.pos[0].z, yaw: this.viewYaw, back: 9, height: 7 };
    }
    return null;
  }

  private sessionOf(slot: number): string | undefined {
    return this.lobby?.members.find((mm) => mm.slot === slot)?.sessionId;
  }

  private talkingIds(): number[] {
    if (!this.lobby) return [];
    return this.lobby.members.filter((mm) => this.talking.has(mm.sessionId)).map((mm) => mm.slot);
  }

  private updateVoice(): void {
    const v = this.voice;
    if (!v) return;
    v.setPushToTalk(this.d.input.pushToTalk);
    const before = [...this.talking].join();
    this.talking = v.update();
    if ([...this.talking].join() !== before) {
      if (this.phase === 'lobby') this.refreshLobby();
      if (this.paused) this.lobbyPanel.updatePause(this.voiceInfo(), this.talking);
    }
  }

  /** Proximity voice (host option): each voice by distance, muffled behind walls. */
  private proximity(w: World, me: PlayerState): void {
    const v = this.voice;
    if (!v) return;
    if (!w.match?.settings.proximityVoice) {
      v.setProximity(null);
      return;
    }
    const info = new Map<string, { distance: number; walled: boolean }>();
    for (const p of w.players) {
      if (p === me) continue;
      const sid = this.sessionOf(p.id);
      if (!sid) continue;
      info.set(sid, { distance: Math.hypot(p.x - me.x, p.z - me.z), walled: wallBetween(w, me.x, me.z, p.x, p.z) });
    }
    v.setProximity(info);
  }

  /** For the debug panel. */
  debugText(): string {
    const m = this.match;
    const peers = this.voice ? Object.values(this.voice.peerStates()).join(',') : '-';
    if (!m) return `mp ${this.phase}  room ${this.lobby?.code ?? '-'}  voice ${peers}`;
    return `mp ${this.phase}  room ${this.lobby?.code ?? '-'}  you ${m.you}  snaps ${m.snapshots}  correction ${m.lastCorrection.toFixed(2)}  voice ${peers}`;
  }
}

function joinError(err: unknown, code: string | null): string {
  const text = err instanceof Error ? err.message : String(err);
  if (/already started/i.test(text)) return 'That match has already started.';
  if (/not found|invalid|no rooms/i.test(text) || (code && /4212|locked|full/i.test(text))) return code ? `No open room ${code}. Check the code (or it is full).` : text;
  if (/ECONNREFUSED|Failed to fetch|NetworkError|network/i.test(text)) return 'Could not reach the game server.';
  return text || 'Could not connect.';
}

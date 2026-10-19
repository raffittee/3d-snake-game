/**
 * Voice chat for a room (docs/GAME_DESIGN.md, Voice chat): WebRTC, every browser sending its mic
 * straight to each of the others (a mesh: 6 connections for 4 players). The game server only relays
 * the setup messages; audio never goes through it and is never recorded. No relay (TURN) server, so
 * a player behind a strict firewall may not connect (a known, accepted gap).
 *
 * Talk modes: push-to-talk (hold V, the default) or open mic, which only sends while you are
 * actually talking (a simple voice gate). Per player: mute and volume. The host can mute anyone for
 * everyone. Proximity voice (a host option): voices fade with distance and muffle behind walls.
 */

export type TalkMode = 'ptt' | 'open';

/** Something to send a setup message to one other player through the game server. */
export type Signal = (to: string, data: unknown) => void;

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  /** The remote stream's chain: source -> muffle (low-pass) -> gain -> speakers. */
  gain: GainNode | null;
  muffle: BiquadFilterNode | null;
  analyser: AnalyserNode | null;
  /** Chrome only plays a remote WebRTC stream through Web Audio if a media element holds it too. */
  sink: HTMLAudioElement | null;
  volume: number;
  muted: boolean;
  hostMuted: boolean;
  /** 0..1 from proximity (1 = full). */
  near: number;
  walled: boolean;
  /** ICE candidates that came before the remote description. */
  early: RTCIceCandidateInit[];
}

const ICE: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
/** Open mic: send while the mic level is over this (RMS, 0..1), and a moment after. */
const GATE_LEVEL = 0.025;
const GATE_HOLD_MS = 350;
/** Proximity voice: full volume within `NEAR`, silent past `FAR` (world units). Behind a wall: muffled and quieter. */
const NEAR = 8;
const FAR = 40;
const WALL_MUFFLE_HZ = 900;
const WALL_GAIN = 0.55;

export class Voice {
  private ctx: AudioContext | null = null;
  private mic: MediaStream | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private peers = new Map<string, Peer>();
  private mode: TalkMode = 'ptt';
  private pttDown = false;
  private gateUntil = 0;
  private selfHostMuted = false;
  private buf: Float32Array<ArrayBuffer> = new Float32Array(512);
  /** Why there is no mic (permission refused, no device), or '' when it works. */
  micError = '';

  /** `me`: your session id in the room. Made on a click (create or join), so the browser lets audio play. */
  constructor(private readonly signal: Signal, private readonly me: string) {
    this.ctx = new AudioContext();
  }

  /** Ask for the mic (the browser shows its permission prompt). Declining still lets you hear everyone. */
  async start(): Promise<void> {
    this.ctx ??= new AudioContext();
    void this.ctx.resume();
    if (this.mic || !navigator.mediaDevices?.getUserMedia) {
      if (!navigator.mediaDevices?.getUserMedia) this.micError = 'No microphone access here (voice needs HTTPS).';
      return;
    }
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const src = this.ctx.createMediaStreamSource(this.mic);
      this.micAnalyser = this.ctx.createAnalyser();
      this.micAnalyser.fftSize = 512;
      src.connect(this.micAnalyser);
      this.applySend(false);
      for (const p of this.peers.values()) this.addMic(p);
      this.micError = '';
    } catch (err) {
      this.micError = err instanceof DOMException && err.name === 'NotAllowedError' ? 'Microphone blocked: you can still hear everyone.' : 'No microphone found: you can still hear everyone.';
    }
  }

  get hasMic(): boolean {
    return this.mic !== null;
  }

  setMode(mode: TalkMode): void {
    this.mode = mode;
  }

  get talkMode(): TalkMode {
    return this.mode;
  }

  /** Push-to-talk key (V) held or released. */
  setPushToTalk(down: boolean): void {
    this.pttDown = down;
  }

  /** The players in the room now (session ids): connect to new ones, drop ones who left. */
  syncMembers(ids: string[], hostMuted: Set<string>): void {
    for (const id of ids) {
      if (id === this.me) continue;
      if (!this.peers.has(id)) this.connect(id);
      const p = this.peers.get(id);
      if (p) p.hostMuted = hostMuted.has(id);
    }
    for (const id of [...this.peers.keys()]) if (!ids.includes(id)) this.drop(id);
    this.selfHostMuted = hostMuted.has(this.me);
    this.refreshGains();
  }

  private connect(id: string): void {
    const pc = new RTCPeerConnection(ICE);
    const peer: Peer = { id, pc, gain: null, muffle: null, analyser: null, sink: null, volume: 1, muted: false, hostMuted: false, near: 1, walled: false, early: [] };
    this.peers.set(id, peer);
    pc.onicecandidate = (e) => {
      if (e.candidate) this.signal(id, { kind: 'ice', candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => this.hear(peer, e.streams[0] ?? new MediaStream([e.track]));
    // Always receive, even without a mic of our own.
    pc.addTransceiver('audio', { direction: 'sendrecv' });
    this.addMic(peer);
    // One side makes the offer (the lower session id) so the two never offer at once.
    if (this.me < id) void this.offer(peer);
  }

  private addMic(peer: Peer): void {
    const track = this.mic?.getAudioTracks()[0];
    if (!track) return;
    const sender = peer.pc.getTransceivers().find((t) => t.receiver.track.kind === 'audio')?.sender;
    if (sender && !sender.track) void sender.replaceTrack(track);
  }

  private async offer(peer: Peer): Promise<void> {
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    this.signal(peer.id, { kind: 'sdp', sdp: peer.pc.localDescription?.toJSON() });
  }

  /** A setup message from another player, relayed by the server. */
  async onSignal(from: string, data: unknown): Promise<void> {
    if (!data || typeof data !== 'object') return;
    const msg = data as { kind?: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
    let peer = this.peers.get(from);
    if (!peer) {
      this.connect(from);
      peer = this.peers.get(from);
    }
    if (!peer) return;
    try {
      if (msg.kind === 'sdp' && msg.sdp) {
        await peer.pc.setRemoteDescription(msg.sdp);
        for (const c of peer.early.splice(0)) await peer.pc.addIceCandidate(c);
        if (msg.sdp.type === 'offer') {
          await peer.pc.setLocalDescription(await peer.pc.createAnswer());
          this.signal(from, { kind: 'sdp', sdp: peer.pc.localDescription?.toJSON() });
        }
      } else if (msg.kind === 'ice' && msg.candidate) {
        if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(msg.candidate);
        else peer.early.push(msg.candidate);
      }
    } catch (err) {
      console.warn('Voice setup failed', err);
    }
  }

  private hear(peer: Peer, stream: MediaStream): void {
    const ctx = this.ctx;
    if (!ctx || peer.gain) return;
    peer.sink = new Audio();
    peer.sink.srcObject = stream;
    peer.sink.muted = true;
    void peer.sink.play().catch(() => undefined);
    const src = ctx.createMediaStreamSource(stream);
    peer.analyser = ctx.createAnalyser();
    peer.analyser.fftSize = 512;
    peer.muffle = ctx.createBiquadFilter();
    peer.muffle.type = 'lowpass';
    peer.muffle.frequency.value = 20000;
    peer.gain = ctx.createGain();
    src.connect(peer.analyser);
    src.connect(peer.muffle).connect(peer.gain).connect(ctx.destination);
    this.refreshGains();
  }

  private drop(id: string): void {
    const p = this.peers.get(id);
    if (!p) return;
    p.pc.close();
    p.gain?.disconnect();
    if (p.sink) p.sink.srcObject = null;
    this.peers.delete(id);
  }

  setPeerVolume(id: string, volume: number): void {
    const p = this.peers.get(id);
    if (p) p.volume = Math.max(0, Math.min(1.5, volume));
    this.refreshGains();
  }

  setPeerMuted(id: string, muted: boolean): void {
    const p = this.peers.get(id);
    if (p) p.muted = muted;
    this.refreshGains();
  }

  peerVolume(id: string): number {
    return this.peers.get(id)?.volume ?? 1;
  }

  peerMuted(id: string): boolean {
    return this.peers.get(id)?.muted ?? false;
  }

  /**
   * Proximity voice: how far each player is from you and whether a wall stands between. Pass null
   * to turn it off (everyone at full volume).
   */
  setProximity(info: Map<string, { distance: number; walled: boolean }> | null): void {
    for (const p of this.peers.values()) {
      const i = info?.get(p.id);
      p.near = i ? Math.max(0, Math.min(1, 1 - (i.distance - NEAR) / (FAR - NEAR))) : 1;
      p.walled = !!i?.walled;
    }
    this.refreshGains();
  }

  private refreshGains(): void {
    const now = this.ctx?.currentTime ?? 0;
    for (const p of this.peers.values()) {
      if (!p.gain || !p.muffle) continue;
      const g = p.muted || p.hostMuted ? 0 : p.volume * p.near * (p.walled ? WALL_GAIN : 1);
      p.gain.gain.setTargetAtTime(g, now, 0.05);
      p.muffle.frequency.setTargetAtTime(p.walled ? WALL_MUFFLE_HZ : 20000, now, 0.05);
    }
  }

  /** Call every frame: the talk gate, and who is talking (session ids; '' for you). */
  update(): Set<string> {
    const talking = new Set<string>();
    const level = this.micAnalyser ? rms(this.micAnalyser, this.buf) : 0;
    const now = performance.now();
    if (level > GATE_LEVEL) this.gateUntil = now + GATE_HOLD_MS;
    const sending = !this.selfHostMuted && (this.mode === 'ptt' ? this.pttDown : now < this.gateUntil);
    this.applySend(sending);
    if (sending && level > GATE_LEVEL * 0.6) talking.add(this.me);
    for (const p of this.peers.values()) {
      if (p.analyser && !p.muted && !p.hostMuted && rms(p.analyser, this.buf) > GATE_LEVEL * 0.6) talking.add(p.id);
    }
    return talking;
  }

  private sendingNow: boolean | null = null;
  private applySend(on: boolean): void {
    if (this.sendingNow === on) return;
    this.sendingNow = on;
    for (const t of this.mic?.getAudioTracks() ?? []) t.enabled = on;
  }

  /** Whether you are sending right now (for the HUD's mic icon). */
  get sending(): boolean {
    return !!this.sendingNow && this.hasMic;
  }

  get hostMutedYou(): boolean {
    return this.selfHostMuted;
  }

  /** Connected peers (for tests and the debug panel). */
  peerStates(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const p of this.peers.values()) out[p.id] = p.pc.connectionState;
    return out;
  }

  stop(): void {
    for (const id of [...this.peers.keys()]) this.drop(id);
    for (const t of this.mic?.getTracks() ?? []) t.stop();
    this.mic = null;
    this.micAnalyser = null;
    this.sendingNow = null;
  }
}

function rms(a: AnalyserNode, buf: Float32Array<ArrayBuffer>): number {
  const n = Math.min(buf.length, a.fftSize);
  const view = buf.subarray(0, n);
  a.getFloatTimeDomainData(view);
  let s = 0;
  for (let i = 0; i < n; i++) s += view[i] * view[i];
  return Math.sqrt(s / n);
}

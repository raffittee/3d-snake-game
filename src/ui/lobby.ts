import type { LobbyMember, LobbyView } from '../net/client';
import { SETTING_OPTIONS, minPlayers } from '../sim/match';
import type { MatchSettings } from '../sim/match';
import { MODE_INFO, TERRAIN_NAMES } from '../levels/modes';
import { playerColorVar } from '../render/palette';
import { $ } from './dom';

type Key = keyof MatchSettings;

/**
 * A link that opens this game on the same server (`?server=`, e.g. a tunnel from `npm run host`)
 * with the room code filled in.
 */
export function inviteLink(code: string, at: Location = location): string {
  const params = new URLSearchParams(at.search);
  const keep = new URLSearchParams();
  const server = params.get('server');
  if (server) keep.set('server', server);
  keep.set('room', code);
  return `${at.origin}${at.pathname}?${keep.toString()}`;
}

const LABELS: { [K in Key]: (v: MatchSettings[K]) => string } = {
  mode: (v) => MODE_INFO[v].name,
  terrain: (v) => TERRAIN_NAMES[v],
  mapSize: (v) => `${v} × ${v}`,
  snakeSpeed: (v) => ({ slow: 'Slow', normal: 'Normal', fast: 'Fast', ramping: 'Ramping (speeds up)' })[v],
  rounds: (v) => `${v} round${v === 1 ? '' : 's'}`,
  roundMinutes: (v) => `${v} min`,
  items: (v) => ({ on: 'On', rare: 'Rare', off: 'Off' })[v],
  proximityVoice: (v) => (v ? 'On: voices fade with distance' : 'Off: everyone hears everyone'),
};

export interface LobbyHandlers {
  setting<K extends Key>(key: K, value: MatchSettings[K]): void;
  start(): void;
  leave(): void;
  talkMode(mode: 'ptt' | 'open'): void;
  peerVolume(sessionId: string, volume: number): void;
  peerMute(sessionId: string, muted: boolean): void;
  hostMute(sessionId: string, muted: boolean): void;
}

/** What the voice side tells the player list. */
export interface VoiceInfo {
  micState: string;
  volume(sessionId: string): number;
  muted(sessionId: string): boolean;
}

/**
 * The lobby card: the room code, who is in, the host's settings (everyone else sees them greyed
 * out), voice controls per player, and Start (host only, once enough players are in). The same
 * player list, with its voice controls, also shows on the multiplayer pause card.
 */
export class LobbyPanel {
  private view: LobbyView | null = null;
  private me = '';
  private listKey = '';
  private pauseKey = '';

  constructor(private readonly h: LobbyHandlers) {
    for (const key of Object.keys(SETTING_OPTIONS) as Key[]) {
      const sel = $<HTMLSelectElement>(`ls-${key}`);
      for (const v of SETTING_OPTIONS[key] as readonly MatchSettings[Key][]) {
        const o = document.createElement('option');
        o.value = String(v);
        o.textContent = (LABELS[key] as (x: MatchSettings[Key]) => string)(v);
        sel.append(o);
      }
      sel.addEventListener('change', () => {
        const raw = sel.value;
        const value = key === 'mapSize' || key === 'rounds' || key === 'roundMinutes' ? Number(raw) : key === 'proximityVoice' ? raw === 'true' : raw;
        h.setting(key, value as MatchSettings[Key]);
      });
    }
    $('lobbyStart').addEventListener('click', () => h.start());
    $('lobbyLeave').addEventListener('click', () => h.leave());
    $('lobbyCopy').addEventListener('click', () => {
      const code = this.view?.code ?? '';
      const link = inviteLink(code);
      void navigator.clipboard?.writeText(link).then(
        () => this.flash('Invite link copied: send it to your friends.'),
        () => this.flash(`Send your friends: ${link}`),
      );
    });
    $<HTMLSelectElement>('talkMode').addEventListener('change', (e) => h.talkMode((e.target as HTMLSelectElement).value === 'open' ? 'open' : 'ptt'));
  }

  private flash(text: string): void {
    $('lobbyNote').textContent = text;
  }

  /** The lobby changed (or who you are). Redraws the card. */
  update(view: LobbyView, me: string, voice: VoiceInfo, talking: Set<string>): void {
    this.view = view;
    this.me = me;
    const host = view.host === me;
    $('lobbyCode').textContent = view.code;
    for (const key of Object.keys(SETTING_OPTIONS) as Key[]) {
      const sel = $<HTMLSelectElement>(`ls-${key}`);
      sel.value = String(view.settings[key]);
      sel.disabled = !host;
    }
    $('lsModeNote').textContent = MODE_INFO[view.settings.mode].rule;
    const need = minPlayers(view.settings.mode);
    const start = $<HTMLButtonElement>('lobbyStart');
    start.hidden = !host;
    start.disabled = view.members.length < need;
    const note = $('lobbyNote');
    if (!note.textContent?.startsWith('Invite') && !note.textContent?.startsWith('Send')) {
      note.textContent = host
        ? view.members.length < need ? `${MODE_INFO[view.settings.mode].name} needs at least ${need} players.` : 'You are the host: pick the settings, then start.'
        : 'The host picks the settings and starts the match.';
    }
    $('micState').textContent = voice.micState;
    this.drawMembers('lobbyMembers', view.members, voice, talking, 'lobby');
  }

  /** The pause card's player list (voice controls only). */
  updatePause(voice: VoiceInfo, talking: Set<string>): void {
    if (this.view) this.drawMembers('pauseMembers', this.view.members, voice, talking, 'pause');
  }

  /** Talking dots change every frame; the rest only when the room does. */
  private drawMembers(id: string, members: LobbyMember[], voice: VoiceInfo, talking: Set<string>, which: 'lobby' | 'pause'): void {
    const list = $(id);
    const host = this.view?.host === this.me;
    const key = JSON.stringify([members, host, this.me, members.map((m) => [voice.muted(m.sessionId), voice.volume(m.sessionId)])]);
    if ((which === 'lobby' ? this.listKey : this.pauseKey) !== key) {
      if (which === 'lobby') this.listKey = key;
      else this.pauseKey = key;
      list.replaceChildren(...members.map((m) => this.memberRow(m, voice, host)));
    }
    for (const li of list.children) {
      const sid = (li as HTMLElement).dataset.sid ?? '';
      const talk = li.querySelector('.talk');
      if (talk) (talk as HTMLElement).hidden = !talking.has(sid);
    }
  }

  private memberRow(m: LobbyMember, voice: VoiceInfo, host: boolean): HTMLElement {
    const li = document.createElement('li');
    li.className = `member${m.connected ? '' : ' offline'}`;
    li.dataset.sid = m.sessionId;
    li.style.setProperty('--c', playerColorVar(m.slot));
    const dot = document.createElement('span');
    dot.className = 'dot';
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = m.name + (m.sessionId === this.me ? ' (you)' : '');
    const tags = document.createElement('span');
    tags.className = 'tags';
    const bits = [this.view?.host === m.sessionId ? 'host' : '', m.connected ? '' : 'reconnecting', m.hostMuted ? 'muted by host' : ''].filter(Boolean);
    tags.textContent = bits.join(' · ');
    const talk = document.createElement('span');
    talk.className = 'talk';
    talk.textContent = bits.length ? ' · talking' : 'talking';
    talk.hidden = true;
    tags.append(talk);
    li.append(dot, who, tags);
    if (m.sessionId !== this.me) {
      const row = document.createElement('div');
      row.className = 'voice';
      const vol = document.createElement('input');
      vol.type = 'range';
      vol.min = '0';
      vol.max = '150';
      vol.value = String(Math.round(voice.volume(m.sessionId) * 100));
      vol.setAttribute('aria-label', `${m.name}'s volume`);
      vol.addEventListener('input', () => this.h.peerVolume(m.sessionId, Number(vol.value) / 100));
      const mute = document.createElement('button');
      const muted = voice.muted(m.sessionId);
      mute.textContent = muted ? 'Unmute' : 'Mute';
      mute.className = muted ? 'on' : '';
      mute.addEventListener('click', () => this.h.peerMute(m.sessionId, !voice.muted(m.sessionId)));
      row.append(vol, mute);
      if (host) {
        const hm = document.createElement('button');
        hm.textContent = m.hostMuted ? 'Unmute for all' : 'Mute for all';
        hm.className = m.hostMuted ? 'on' : '';
        hm.addEventListener('click', () => this.h.hostMute(m.sessionId, !m.hostMuted));
        row.append(hm);
      }
      li.append(row);
    }
    return li;
  }
}

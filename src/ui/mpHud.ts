import { BALANCE } from '../config/balance';
import { cellToWorld } from '../sim/grid';
import { matchOver } from '../sim/match';
import type { PlayerState, World } from '../sim/types';
import { playerColorVar } from '../render/palette';
import { $ } from './dom';
import { MODE_INFO } from '../levels/modes';

const clock = (s: number): string => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/** What the objective line says for you right now. */
function goalText(world: World, me: PlayerState, names: string[]): string {
  const m = world.match;
  if (!m) return '';
  const name = (id: number): string => names[id] ?? `Player ${id + 1}`;
  switch (m.mode) {
    case 'classic': {
      const nest = m.nest;
      const fill = nest ? `Nest ${nest.filled} / ${nest.need}` : '';
      return me.carrying > 0 ? `${fill}\nCarrying ${me.carrying}: take them to the nest` : `${fill}\nGrab pellets, bring them home`;
    }
    case 'snakeAndPlayers':
      if (me.snakeId !== null) return 'You are the snake: catch them all\nDash click · Burrow Space · Whip R';
      return `Lives ${me.lives} · ${name(m.snakePilot)} is the snake\nSurvive, or shrink it`;
    case 'infection': {
      const humans = world.players.filter((p) => !p.out && p.snakeId === null && !m.infecting.some((e) => e.id === p.id)).length;
      if (me.snakeId !== null) return `${humans} human${humans === 1 ? '' : 's'} left: catch them\nDash click · Burrow Space · Whip R`;
      return `${humans} humans left\nStay human`;
    }
    case 'hotEgg': {
      const carrier = world.players.find((p) => p.egg);
      if (me.egg) return 'You have the egg!\nTouch someone to pass it on';
      return carrier ? `${name(carrier.id)} has the egg\nKeep your distance` : '';
    }
    case 'escapeRace': {
      const gx = cellToWorld(world.grid, world.gate.x);
      const gz = cellToWorld(world.grid, world.gate.z);
      return `Exit ${Math.round(Math.hypot(gx - me.x, gz - me.z))}m away\nFirst one out wins`;
    }
  }
}

/** The big message in the middle of the screen, or '' for none. */
function statusText(world: World, me: PlayerState): string {
  const m = world.match;
  if (!m || world.status !== 'playing') return '';
  if (me.escaped) return 'You got out!';
  if (me.out) return 'Out of the round\nWatching the others';
  if (m.infecting.some((e) => e.id === me.id)) return 'Caught!\nYou rise as a snake…';
  if (me.down > 0 && m.mode === 'classic') {
    const pct = Math.round(me.revive * 100);
    return pct > 0 ? `Getting up… ${pct}%` : `Downed\nA teammate standing by you gets you up\nBack up on your own in ${Math.ceil(me.down)}s`;
  }
  if (me.down > 0) return `Caught\nBack at the start in ${Math.ceil(me.down)}s`;
  return '';
}

/** One player's state in the list: snake, down, out, egg, lives. */
function playerStatus(world: World, p: PlayerState): string {
  const m = world.match;
  if (p.escaped) return 'escaped';
  if (p.out) return 'out';
  if (p.snakeId !== null) return 'snake';
  if (m?.infecting.some((e) => e.id === p.id)) return 'caught';
  if (p.down > 0) return 'down';
  if (p.egg) return 'egg';
  if (m?.mode === 'snakeAndPlayers') return `${p.lives} ♥`;
  if (m?.mode === 'classic' && p.carrying > 0) return `carrying ${p.carrying}`;
  return '';
}

/** The multiplayer layer of the HUD, over the normal one. */
export class MpHud {
  private readonly root = $('mpHud');
  private listKey = '';

  show(on: boolean): void {
    this.root.hidden = !on;
    // No XP or perks in a match.
    $('xpLabel').parentElement?.toggleAttribute('hidden', on);
  }

  update(world: World, me: PlayerState, names: string[], talking: Set<number>, sendingVoice: boolean): void {
    const m = world.match;
    if (!m) return;
    $('mpMode').textContent = `${MODE_INFO[m.mode].name} · Round ${m.round} of ${m.rounds}`;
    $('mpTimer').textContent = clock(m.timeLeft);
    $('mpTimer').classList.toggle('low', m.timeLeft < 30 && m.timeLeft > 0);
    $('mpGoal').textContent = goalText(world, me, names);
    const status = statusText(world, me);
    $('mpStatus').hidden = !status;
    $('mpStatus').textContent = status;
    $('mpTalk').hidden = !sendingVoice;
    const rows = world.players.map((p) => [p.id, names[p.id] ?? `Player ${p.id + 1}`, playerStatus(world, p), m.points[p.id] ?? 0, talking.has(p.id), p.out] as const);
    const key = JSON.stringify(rows);
    if (key === this.listKey) return;
    this.listKey = key;
    $('mpPlayers').replaceChildren(
      ...rows.map(([id, name, st, pts, talk, out]) => {
        const li = document.createElement('li');
        li.className = `${talk ? 'talking' : ''}${out ? ' out' : ''}`;
        li.style.setProperty('--c', playerColorVar(id));
        const dot = document.createElement('span');
        dot.className = 'dot';
        const n = document.createElement('span');
        n.textContent = id === me.id ? `${name} (you)` : name;
        const s = document.createElement('span');
        s.className = 'st';
        s.textContent = [st, m.rounds > 1 ? `${pts} pt${pts === 1 ? '' : 's'}` : '', talk ? 'talking' : ''].filter(Boolean).join(' · ');
        li.append(dot, n, s);
        return li;
      }),
    );
  }

  /** The scoreboard between rounds, and after the last one. */
  showRound(world: World, me: number, names: string[], breakLeft: number): void {
    const m = world.match;
    if (!m) return;
    const last = matchOver(m);
    const winners = m.winners ?? [];
    const won = winners.includes(me);
    $('roundEyebrow').textContent = `${MODE_INFO[m.mode].name} · Round ${m.round} of ${m.rounds}`;
    const team = m.mode === 'classic';
    const who = winners.map((id) => names[id] ?? `Player ${id + 1}`);
    let title = 'Nobody won';
    if (team) title = won ? 'You made it' : 'The snake won';
    else if (won) title = 'You win';
    else if (who.length === 1) title = `${who[0]} wins`;
    else if (who.length > 1) title = `${who.join(', ')} win`;
    $('roundTitle').textContent = title;
    $('roundReason').textContent = m.reason;
    const order = world.players.map((p) => p.id).sort((a, b) => (m.points[b] ?? 0) - (m.points[a] ?? 0));
    $('roundStandings').replaceChildren(
      ...order.map((id) => {
        const li = document.createElement('li');
        li.className = winners.includes(id) ? 'won' : '';
        li.style.setProperty('--c', playerColorVar(id));
        const dot = document.createElement('span');
        dot.className = 'dot';
        const n = document.createElement('span');
        n.textContent = (names[id] ?? `Player ${id + 1}`) + (id === me ? ' (you)' : '');
        const pts = document.createElement('span');
        pts.className = 'pts';
        pts.textContent = String(m.points[id] ?? 0);
        li.append(dot, n, document.createElement('span'), pts);
        return li;
      }),
    );
    $('roundNext').textContent = last ? 'Match over. Final points above.' : `Next round in ${Math.max(0, Math.ceil(breakLeft))}s${m.mode === 'snakeAndPlayers' ? `: ${names[m.round % world.players.length] ?? 'the next player'} is the snake` : ''}`;
    $('roundLobby').hidden = !last;
  }
}

/** How long to wait between rounds on the client's own clock (the server decides; this is just the countdown shown). */
export const ROUND_BREAK = BALANCE.multiplayer.roundBreak;

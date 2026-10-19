import { BALANCE } from '../config/balance';
import type { PlayerState, SnakeState, World } from './types';

/** In the game on foot: not out, not downed, not steering a snake. */
export const onFoot = (p: PlayerState): boolean => !p.out && p.down <= 0 && p.snakeId === null;

/** A player a snake can catch: on foot. */
export const catchable = onFoot;

/**
 * Who `snake` hunts this update (a player id), or -1 when there is nobody to hunt.
 * Aggro: whoever hit it last (a stone, a cut), while that grudge lasts and they are still catchable.
 * Otherwise the catchable player nearest its head. Hot Egg: only the egg carrier.
 */
export function choosePrey(world: World, snake: SnakeState): number {
  const players = world.players;
  if (players.length === 1) return players[0].id;
  const allowed = (p: PlayerState): boolean => catchable(p) && p.id !== snake.pilot && (!world.match?.eggHunt || p.egg);
  if (snake.aggro) {
    const p = players[snake.aggro.id];
    if (p && allowed(p)) return p.id;
  }
  const head = snake.pos[0];
  let best = -1;
  let bestD = Infinity;
  for (const p of players) {
    if (!allowed(p)) continue;
    const d = Math.hypot(p.x - head.x, p.z - head.z);
    if (d < bestD) {
      bestD = d;
      best = p.id;
    }
  }
  return best;
}

/**
 * The player `snake` is hunting, as the AI behaviors see them. With nobody to hunt (everyone down or
 * out) it is the first player, so a behavior always has someone to aim at.
 */
export function preyOf(world: World, snake: SnakeState): PlayerState {
  return world.players[snake.prey] ?? world.players[0];
}

/** Player `pid` hit `snake` (a stone, a machete cut): it holds a grudge against them for a while (Classic's aggro). */
export function provoke(snake: SnakeState, pid: number): void {
  snake.aggro = { id: pid, time: BALANCE.multiplayer.aggroSeconds };
}

/** World units from (x, z) to the nearest player still in the game (pellets and drops fall away from everyone). */
export function minDistanceToPlayers(world: World, x: number, z: number): number {
  let best = Infinity;
  for (const p of world.players) {
    if (p.out) continue;
    best = Math.min(best, Math.hypot(p.x - x, p.z - z));
  }
  return best;
}

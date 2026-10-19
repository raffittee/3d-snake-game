import type { ModeId } from '../sim/match';
import type { TerrainId } from './types';

/** Terrain names for the lobby and the match HUD. */
export const TERRAIN_NAMES: Record<TerrainId, string> = {
  plains: 'Plains',
  ruins: 'Ruins',
  riverside: 'Riverside',
  'tall-grass': 'Tall grass',
  'corn-maze': 'Corn maze',
  swamp: 'Swamp',
  desert: 'Sandstorm desert',
  'frozen-lake': 'Frozen lake',
  'broken-house': 'Broken house',
  cave: 'Dark cave',
};

/** Names and one-line rules for each mode (the lobby, the HUD, the scoreboard). */
/** `short`: a few words for the corner guide. */
export const MODE_INFO: Record<ModeId, { name: string; rule: string; short: string }> = {
  classic: { short: 'Fill the nest, or beat the snake', name: 'Classic', rule: 'Co-op. Carry pellets to the nest, or shrink the snake away. Caught, you go down: a teammate standing by you gets you up.' },
  snakeAndPlayers: { short: 'Survive the clock, or shrink the snake', name: 'Snake and Players', rule: 'One of you is the snake (it rotates each round). Runners survive the clock or shrink it; the snake catches them all.' },
  infection: { short: "Don't get caught", name: 'Infection', rule: 'Whoever the snake catches becomes a snake too. Last human standing wins.' },
  hotEgg: { short: "Don't hold the egg when it bites", name: 'Hot Egg', rule: 'The snake only hunts whoever holds its egg. Touch someone to pass it on. Last one left wins.' },
  escapeRace: { short: 'First one out wins', name: 'Escape Race', rule: 'Everyone races for one exit while the snake hunts. Throw a firecracker near a rival to send it their way. First out wins.' },
};

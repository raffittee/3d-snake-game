/**
 * The lobby, as Colyseus room state: synced to every client automatically (Colyseus sends only what
 * changed). The match itself does not live here; it goes as snapshots (src/net/protocol.ts).
 * Shared by the server and the browser.
 */
import { schema, t } from '@colyseus/schema';
import type { SchemaType } from '@colyseus/schema';

export const LobbyPlayer = schema(
  {
    name: t.string().default('Player'),
    /** Player id in the match (0..3): join order. */
    slot: t.number().default(0),
    /** Still connected (a dropped player has a few seconds to come back). */
    connected: t.boolean().default(true),
    /** The host has muted this player's voice for everyone. */
    hostMuted: t.boolean().default(false),
  },
  'LobbyPlayer',
);
export type LobbyPlayer = SchemaType<typeof LobbyPlayer>;

export const LobbyState = schema(
  {
    code: t.string().default(''),
    /** Session id of the host (who created the room). */
    host: t.string().default(''),
    /** `lobby` (picking settings), `playing` (a round is on), `between` (scoreboard), `ended` (all rounds played). */
    phase: t.string().default('lobby'),
    round: t.number().default(0),
    terrain: t.string().default('plains'),
    mode: t.string().default('classic'),
    mapSize: t.number().default(64),
    snakeSpeed: t.string().default('normal'),
    rounds: t.number().default(3),
    roundMinutes: t.number().default(5),
    items: t.string().default('on'),
    proximityVoice: t.boolean().default(false),
    players: t.map(LobbyPlayer),
  },
  'LobbyState',
);
export type LobbyState = SchemaType<typeof LobbyState>;

# 0004: Multiplayer runs the same sim on a server; clients predict themselves and draw snapshots

Date: 2026-10-19. Status: accepted.

## Context

Phase 4 adds friends-only multiplayer: 2 to 4 players in a private room, five modes, voice chat. The gate is "4 friends finish a Classic match with no desync". The sim was written for this (ADR 0001: no DOM, no three.js, seeded randomness), but it held exactly one player: `world.player`, the inventory, lives, noise and the battery all lived on the world, and about 90 places read them.

## Decision

**Several players in one world.** `world.players[]` holds every player, each with their own body, inventory, lives, noise, battery and multiplayer state (downed, out, steering a snake, carrying the egg). `updateWorld` takes one input per player. Every game rule takes the player it acts on; a lint rule (`no-restricted-properties`) keeps `world.player` out of `src/sim`, `src/ai`, `src/items` and `server/`. `world.player` survives as the *local* player: `players[0]` in single player, and a multiplayer client points it at its own player, so the renderer and HUD did not change. Each snake picks its prey every update (`sim/hunt.ts`): whoever hit it last while the grudge lasts (Classic's aggro), else the nearest player it can catch.

**Modes are rules on top.** `world.match` (null in the campaign) holds the round: mode, clock, spawns, nest, egg, points. `sim/modes.ts` has one rule set per mode with fixed hooks (setup, before the snakes move, a catch, a pellet, end of update). `sim/match.ts` turns any campaign terrain into an arena at 64, 80 or 96 cells. A player can steer a snake (`sim/pilot.ts`): heading with momentum, no reversing, dash, burrow and tail whip on cooldowns.

**An authoritative server.** `server/` is a Node process (Colyseus 0.18, `@colyseus/core` and the ws transport only) that imports `src/sim` unchanged and steps it at a fixed 30 Hz. Clients send inputs (one per tick, numbered, with the view direction absolute so a lost or repeated packet never turns anyone); the server queues them per player, applies one per tick and repeats the last held keys when none arrived.

**Lobby on room state, match on messages.** The lobby (players, the host's settings, phase) is Colyseus Schema state, synced automatically. The match is not: the sim is plain objects, so it goes as our own compact snapshots 20 times a second (`src/net/protocol.ts`), about 1 KB for 4 players and their snakes. The ground and doors only go when they change. Clients build the arena themselves from the settings and seed (the same seed gives the same arena), so it is never sent.

**What each client draws.** Your own player is predicted: your input runs through the same movement and collision code right away, and each snapshot resets you to the server's state and replays the inputs it has not applied yet. Other players are drawn about 110 ms in the past, blended between snapshots. Snakes come from the latest snapshot with their step progress running on locally between snapshots, which is exactly how the sim already draws them between grid cells.

**Voice is peer to peer.** WebRTC between every pair of browsers (a mesh; 6 connections for 4 players); the server only relays the setup messages, so audio never touches it. No TURN relay (the design's call: free for now).

## Consequences

- No desync by construction: the server is the only state, and a client's copy is overwritten by every snapshot. The server test plays a 4-bot round and checks every client against the server; the e2e test plays two real browsers through a whole match.
- Single player is unchanged: one player, `match` null, the same 228 tests still pass.
- Latency shows as other players being about a tenth of a second behind, and as your own corrections when the server disagrees (small: the same code runs on both ends). Being caught is decided on the server, so with a slow connection you can be caught a moment after you think you got away.
- The network code (the Colyseus SDK) is loaded only when you open "Play with friends", so single player downloads nothing extra.
- The server is one process holding rooms in memory: fine for friends, nothing to scale. It needs an always-on host with HTTPS (browsers only allow the microphone over HTTPS), which is the remaining deploy step.

# 0001: Separate the simulation from rendering

Date: 2026-10-16. Status: accepted.

## Context

The prototype was one 535-line inline script where game rules, three.js meshes, DOM and audio were interleaved. The design plan needs things that make that hard: ten levels with different rules, unit tests for pathfinding and collision, and later a server that runs the same rules for friends-only multiplayer.

## Decision

- `src/sim` holds all game rules as plain TypeScript with no three.js, DOM or `window`. It advances in steps from a `dt` and a `PlayerInput`, using a seeded RNG, and reports what happened through `world.events`.
- `src/render`, `src/ui`, `src/input.ts`, `src/audio.ts` and `src/game.ts` read the world and turn events into pixels, sound and screens.
- Levels are `LevelConfig` data and AI behaviors are a registry, so adding a level or a behavior does not touch the engine.
- Tuning numbers live in `src/config/balance.ts`.

## Consequences

- The sim runs headless in Vitest, including a 3-minute bot run that checks invariants and a determinism test (same seed, same result).
- A Node server (for example Colyseus) can later import `src/sim` unchanged to be authoritative in multiplayer.
- Cost: a little more plumbing (events, camera view object) than a single script. Accepted.
- Rule to keep: never import three.js or touch the DOM from `src/sim`, and never use `Math.random()` there.

# Backlog

Ordered by the roadmap in `GAME_DESIGN.md`. Do the phases in order; each phase ends at a gate. Work one item at a time. "Done when" is the check for finishing it.

## Done (the port)

- Vite + TypeScript project, ES modules, three.js ^0.186, fonts bundled locally (works offline).
- Sim split from rendering: `src/sim` (no three.js/DOM), seeded RNG, levels as `LevelConfig`, `BEHAVIORS` registry, tuning in `src/config/balance.ts`.
- Prototype Level 1 ported with the same look and controls; WebGL-failure message; pause releases pointer lock.
- 41 unit tests (pathfinding, snake, player, world, 3-minute bot run, determinism) and a Playwright smoke test.
- Fixed a prototype bug: when the snake had no path to you, its fixed direction order made it coil in a corner; it now picks the roomiest neighbor with random tie-break.

## Phase 1: Foundation (gate: Level 1 plays end to end with its goal and corner guide)

1. **Playtest the port in a real browser and tune.** Pointer lock, feel, speed ramp, stamina, crush fairness at high snake speed. Done when: notes of what feels off are turned into `balance.ts` changes or backlog items.
2. **Corner guide.** A small HUD panel: goal, progress, snake rule. Driven by `LevelConfig.guide`. Done when: Level 1 shows it and no other tutorial text exists.
3. **Goals.** Extend `Goal` in `src/levels/types.ts` beyond `endless` with `survive` (seconds), `collect` (pellets), and `either`. World reports `levelComplete`; add a level-complete card. Level 1: survive 90 s or collect 10 pellets. Done when: unit tests cover each goal kind and Level 1 can be won.
4. **Lives.** 3 per level, refilled between levels. A death respawns you at the level start point and the snake stays as it was; losing all 3 ends the run. Done when: tested in sim, and the HUD shows lives.
5. **48x48 map for Levels 1 and 2.** Check BFS cost per step, minimap scale (currently 5 px per cell, 140 px canvas), and re-tune snake speed for the bigger map. Done when: Level 1 runs at 48x48 with the minimap readable.
6. **Jumping.** Vertical movement in the sim (`y`, gravity, stamina cost per jump). Clears low walls, logs and the snake's last 4 segments; not the rest of the body. Needs collision to become height-aware. Done when: unit tests for clearing a tail segment but not a body segment.
7. **Grounded realistic look** (ADR 0002). Replaces the Nokia LCD look before landmarks and terrains are built on it. Render only; `src/sim` is untouched.
   - Renderer: sRGB output and tone mapping (drop `ColorManagement.enabled = false` and the light times pi hack), full resolution with antialiasing, soft shadows, HDRI sky and fog, and a `?quality=low` switch.
   - Per-terrain look registry keyed by `LevelConfig.terrain`, with `plains` filled in.
   - Arena: CC0 textures (Poly Haven: `leafy_grass` ground, `castle_wall_slates` walls, `mossy_rock` pillars, `kloofendal_48d_partly_cloudy_puresky` sky) with a credits file. No outlines.
   - Snake: one smooth tube body along a curve through `snake.pos`, with procedural scales, a slither drawn inside the collision boxes, and support for `head`/`tail`/`cut` ends. A sculpted head with jaws that open on the death camera, and a forked tongue.
   - Pellets: a glowing gem instead of the outlined octahedron.
   - HUD and menus: dark translucent panels, a modern bundled font, a restyled minimap, and no pixel mini-snake.
   - Done when: `npm run check` and `npm run test:e2e` pass, the screenshots show no blocks or outlines, the scales travel with the body, and default quality holds 60 fps on desktop.
8. **Level start/respawn point and landmarks** (a tower, big tree etc.) so you can find your way in first person at 48x48.
9. **Settings menu:** mouse sensitivity, volume, FOV, render scale, graphics quality (all are literals or URL switches today).

## Phase 2: Core loop (gate: a run through Levels 1 to 3 feels fair in playtests)

- Inventory (2 slots) with draining spoil rings; item tiers (white, blue, gold) with rarer drops at higher levels.
- Items: slingshot (stun 2 s, 3 shots, first drops Level 1), machete (5 cuts), swim ring (30 s in water).
- Snake as HP: tail cut, mid-body cut that splits it into two snakes (back half grows a head; under 4 segments it withers), growth split at a set length (Level 3) with a 2 s body flash, floor length where the machete bounces, defeat under 3 only where allowed. Cut feel: red flesh cross-section caps on cut ends, a short blood spray, and a severed piece that twitches before it withers. No lingering gore. This needs `world.snake` to become `world.snakes[]` and the pathfinder to avoid other snakes' bodies.
- XP from pellets, perk pick on level-up (3 offered, pick 1), perks reset each run.
- Between-level perk pick screen; items clear at level end.
- Level 2 Ruins (jumpable low walls, crumbling walls the snake smashes, Predict behavior, find 5 relics then reach the gate). Level 3 Riverside (water, bridges, snake swims slower, pellet speed boost that fades after about 8 s, cross to the far dock).
- AI: `predict` behavior (target the player's position about 1 s ahead).

## Phase 3: Campaign (gate: a full 10-level run can be beaten and the boss feels fair)

- Terrain looks (4 to 5 tone palette, textures, lighting, fog, particles, weather) in the terrain registry from Phase 1 item 7. Cave last.
- Levels 4 to 10 per the table in `GAME_DESIGN.md`: Tall grass, Corn maze, Swamp, Sandstorm desert, Frozen lake, Broken house, Dark cave (Mother Snake boss, 3 phases).
- AI behaviors: stalk, flank (two snakes), burrow, ambush, coil (boss only).
- Remaining items: firecracker, smoke bomb, energy drink, mongoose, ice cleats, flashlight battery. Remaining perks.
- Terrain mechanics: tall-grass hiding, mud slowdown, ice sliding and cracking, doors and hiding spots, flashlight and battery, visibility waves.

## Phase 4: Multiplayer (gate: 4 friends finish a Classic match with no desync)

- Node game server that imports `src/sim` unchanged (authoritative, fixed tick), with private rooms and 6-character codes; host leaving ends the match.
- Client prediction/interpolation for the player; snapshot interpolation for the snake.
- Modes: Classic co-op (downed and revive, aggro switching, nest), then Snake and Players, Infection, Hot Egg, Escape Race.
- Voice: WebRTC mesh, push-to-talk (V) and open mic, per-player mute/volume, optional proximity voice, host can mute. No relay server for now.
- Deploy: static client plus a small always-on server.

## Later

- Phones: touch layout and testing (the touch controls exist from the prototype but are untested on a device).
- Gamepad support.
- Global leaderboard / daily seed (needs a backend).

## Tech debt and open questions

- `createWorld` builds the world with an `as unknown as World` cast because the snake needs the world to exist first. Clean up when the world type is reworked for multiple snakes.
- BFS can target a cell occupied by the snake's own body, so it can very rarely overlap itself. Add a test that reproduces it before fixing.
- Pillar generation does not check connectivity of the arena.
- Collision is circle versus axis-aligned boxes in 2D only; jumping will need a height dimension.
- three.js is about 500 kB minified in one chunk; fine now, consider splitting later.
- Visual regression: only manual screenshot review today.

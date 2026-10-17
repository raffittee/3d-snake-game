# Tasks

A tick-box view of everything in [BACKLOG.md](BACKLOG.md), plus the loose ends found while working. `[x]` = done, `[ ]` = not done. Details and "done when" checks stay in the backlog and in [GAME_DESIGN.md](GAME_DESIGN.md); tick boxes here as items finish.

## In progress / loose ends

- [x] **Mouse-look "teleport" glitch.** Fixed: pointer lock now requests raw, unaccelerated mouse input (falls back to plain lock). Frame times were fine (60 fps, 17 ms worst); Windows pointer acceleration was inflating fast swipes. Debug panel keeps `fps`, `worst frame` and `mouse peak` (`?debug=1`).
- [x] Unit tests failed once on a cold first run (`Cannot read properties of undefined (reading 'config')` in all files). Cause: Vitest's on-disk module cache (`node_modules/.vitest-cache`) is shared between processes; when two runs start against a stale cache, one deletes it while the other reads it (reproduced as `EPERM rmdir .vitest-cache`). Fixed: `fsModuleCache: false` in `vite.config.ts`; the same scenario then passed 3 of 3 times.
- [x] Commit the debug-panel stats and raw-mouse fix (c020102).
- [x] Commit the look decision as its own commit (e33d3c6). Phase 1 work followed in two more: game rules + tests (2b3493e), the look, HUD, menus, settings and assets (the commit after it).
- [x] Update the external design doc ("Snake Hunt Game Design" on claude.ai) to the new look: Look decision + Cut gore row, Look and feel section, "How a cut looks", roadmap Phase 3 label. Matches `docs/GAME_DESIGN.md`.

## Done (the port)

- [x] Vite + TypeScript project, ES modules, three.js, fonts bundled locally
- [x] Sim split from rendering (`src/sim`), seeded RNG, levels as `LevelConfig`, `BEHAVIORS` registry, tuning in `balance.ts`
- [x] Prototype Level 1 ported; WebGL-failure message; pause releases pointer lock
- [x] 41 unit tests and a Playwright smoke test (passing)
- [x] Fixed the snake coiling in a corner when it has no path to you
- [x] Playwright Chromium installed and e2e smoke test passes

## Phase 1: Foundation

Gate: Level 1 plays end to end with its goal and corner guide.

- [ ] 1. Playtest the port in a real browser and tune (needs a human: pointer lock, feel, speed ramp, stamina, crush fairness at high snake speed)
  - [x] Speed-ramp numbers worked out from `balance.ts` (snake passes walk speed at ~18 s, sustainable sprint pace at ~76 s, sprint speed at ~97 s)
  - [ ] Play a few minutes with `?debug=1` and write down what feels off
  - [ ] Turn each note into a `balance.ts` change or a backlog item
- [x] 2. Corner guide (HUD panel driven by `LevelConfig.guide`; goal, progress, snake rule; title-card rules text removed). Restyled with item 7.
- [x] 3. Goals: `survive`, `collect`, `either`; `levelComplete` event and card; Level 1 = survive 90 s or collect 10 pellets. Restyled with item 7.
- [x] 4. Lives: 3 per level, respawn at start point, snake stays as it was, HUD shows lives. 2 s respawn grace (`BALANCE.lives`). Restyled with item 7.
- [x] 5. 48x48 map for Level 1 (Level 2 does not exist yet): BFS cost test (64x64), minimap scales per map size, fog and title orbit fit the arena, snake speed/pellets/pillars re-tuned as first guesses. The sun's shadow area is fitted to the arena size (item 7); fps on a real GPU still to check.
- [x] 6. Jumping (Space): height in the sim, stamina cost, clears the last 4 snake segments, height-aware collision (ADR 0003). The tube body keeps the last 4 segments visibly low. No low walls/logs exist yet (Level 2). No touch jump button.
- [x] 7. Grounded realistic look (ADR 0002)
  - [x] Decision recorded: ADR 0002, design doc, backlog, CLAUDE.md
  - [x] Renderer foundation: sRGB + ACES tone mapping, full res + antialiasing, soft sun shadows fitted to the arena, HDRI sky and image-based light, fog, `?quality=low|high`
  - [x] Terrain look registry (`render/terrains.ts`, `plains`)
  - [x] Arena: Poly Haven CC0 grass ground, stone walls, rock pillars (noise-shaped standing stones) + `public/assets/CREDITS.md`
  - [x] Snake body: one tube through `snake.pos`, procedural diamondback skin that travels with the body, slither, `head`/`tail`/`cut` ends (cut = flesh cap)
  - [x] Snake head: sculpted skull and hinged jaw, slit-pupil eyes, fangs, forked tongue; death camera: head rears up with jaws open and the camera backs off to face it
  - [x] Pellets: glowing amber gem with a soft halo
  - [x] HUD and menus modernized: dark translucent panels, Inter font, restyled minimap, pixel mini-snake removed; guide, lives, complete card and settings restyled
  - [x] Check: body inside the collision boxes (top ~1.35 vs box 1.7, tail < 0.7), scales travel with the body, staged high-quality screenshots and e2e screenshots reviewed
  - [ ] Check: default quality holds 60 fps on a real desktop GPU (needs you: `?debug=1`, look at `fps`)
- [x] 8. Level start/respawn point and landmarks (tower, big tree)
  - [x] Sim: `LevelConfig.start` and `LevelConfig.landmarks` (with a `size` footprint); landmark cells are solid, pillars keep clear; minimap shows them
  - [x] Realistic visuals: a stone watchtower on a 3x3 footprint built from the wall texture, the CC0 quiver tree model, a stone start disc
- [x] 9. Settings menu: mouse sensitivity, volume, FOV, render scale, graphics quality (title and pause cards, saved in `localStorage` as `snake-hunt-settings`)

## Phase 2: Core loop

Gate: a run through Levels 1 to 3 feels fair in playtests.

- [x] Inventory (2 slots) with draining spoil rings; item tiers (white, blue, gold): drops fall on a per-level timer (`LevelConfig.items`), pick up by walking over, tiers scale uses and spoil time, kept on a lost life, Click/F use, 1/2/wheel select, `ITEMS` registry in `src/items`. Using the slingshot only spends a shot until its own item lands.
- [x] First-person arms and hands (asked for mid-phase): gloved hands hold the selected item and play its use motion; every item has a rig (`render/viewmodel.ts`): slingshot draw and release, machete swing, swim ring held in both hands (lower in the water)
- [x] Items: slingshot, machete, swim ring
  - [x] Slingshot: a visible stone along the crosshair; head hit = 2 s stun (resets, never stacks); dazed head, hit marker, sounds
  - [x] Machete (5 cuts): cuts the segment under the crosshair within 2.6 units; head and floor bounce it off; a swing at nothing still costs a cut; chop, clank and whoosh sounds
  - [x] Swim ring (first drops Level 3): passive while carried; its 30 s (45 / 60 at higher tiers) drain only while you swim; run out in deep water and you drown (a life)
- [x] Snake as HP: `world.snakes[]`; tail cut (piece under 4 withers), mid-body split (back half grows a head, dazed 1 s), growth split (`splitAt`, 2 s warning flash), floor 5 on Levels 1 to 3 (cuts bounce), defeat under 3 where `defeatable`; a cut leaves a stump (not jumpable) until 4 growth steps regrow the tail
- [x] Cut feel: flesh cross-section caps, a burst of blood, the severed piece twitches and sinks as it withers; a split-off snake grows its head in
- [x] Pathfinder avoids other snakes' bodies (and never steps into any blocked cell: this also fixed the old self-overlap bug)
- [x] XP from pellets (level-ups at 3, 5, 7... XP); perks: Big lungs, Packrat, Preserver, Spring legs, Keen ears, Sharp edge, Second wind (Light feet waits for Phase 3's ambushing snake); perks reset each run
- [x] Between-level perk pick screen (3 offered, pick 1 per level-up) and the campaign flow: Level 1 → 2 → 3 with lives refilled and items cleared; level and run scores; losing all lives ends the run; `?level=N` debug switch
- [x] Level 2 Ruins (48x48): seeded rooms of low walls (jump them) and crumbling walls (the snake smashes them, with dust); 5 relics then the gate; Predict snake; machete drops; ruins look (sandstone, cobbles, old stone)
- [x] Level 3 Riverside (64x64): a winding river with 3 plank bridges; deep water needs the swim ring; the snake swims 1.6x slower; pellets give a +15% speed boost that fades over 8 s and stacks; growth split at 22; reach the dock on the far bank; riverside look (grass, rocky banks, water, planks)
- [x] AI: `predict` behavior (aims where you will be 1 s from now; falls back to your cell when that one is blocked)
- [x] Docs for Phase 2: CLAUDE.md (layout, rules, controls), GAME_DESIGN.md decisions (tiers, items on a lost life, controls, hands, perk timing, machete aim, floor), CREDITS.md (new textures and skies)
- [x] e2e: the campaign flow (win Level 1, pick a perk, Level 2 starts with it), a machete cut that splits the snake, Level 3 loading (7 e2e tests, all passing)
- [ ] Playtest gate: a run through Levels 1 to 3 feels fair (needs you)

## Phase 3: Campaign

Gate: a full 10-level run can be beaten and the boss feels fair.

- [ ] Terrain looks (4 to 5 tone palettes, textures, lighting/fog/particles/weather) in the terrain registry (Cave last)
- [ ] Level 4 Tall grass
- [ ] Level 5 Corn maze
- [ ] Level 6 Swamp
- [ ] Level 7 Sandstorm desert
- [ ] Level 8 Frozen lake (segments that fall through the ice reuse the cut-end visuals)
- [ ] Level 9 Broken house
- [ ] Level 10 Dark cave (Mother Snake boss, 3 phases)
- [ ] AI behaviors: stalk, flank, burrow, ambush, coil
- [ ] Items: firecracker, smoke bomb, energy drink, mongoose, ice cleats, flashlight battery
- [ ] Remaining perks (big lungs, light feet, packrat, preserver, spring legs, keen ears, sharp edge, second wind)
- [ ] Terrain mechanics: tall-grass hiding, mud, ice sliding/cracking, doors and hiding spots, flashlight and battery, visibility waves

## Phase 4: Multiplayer

Gate: 4 friends finish a Classic match with no desync.

- [ ] Node game server importing `src/sim` unchanged (authoritative, fixed tick), private rooms, 6-character codes, host leaving ends the match
- [ ] Client prediction/interpolation for the player; snapshot interpolation for the snake
- [ ] Mode: Classic co-op (downed and revive, aggro, nest)
- [ ] Mode: Snake and Players
- [ ] Mode: Infection
- [ ] Mode: Hot Egg
- [ ] Mode: Escape Race
- [ ] Voice: WebRTC mesh, push-to-talk (V) and open mic, per-player mute/volume, optional proximity voice, host mute
- [ ] Deploy: static client plus a small always-on server (HTTPS for the mic)

## Later

- [ ] Phones: touch layout and real-device testing; default to low graphics quality on phones
- [ ] Gamepad support
- [ ] Global leaderboard / daily seed (needs a backend)

## Tech debt and open questions

- [ ] `createWorld` uses an `as unknown as World` cast (clean up when the world becomes multi-snake)
- [x] BFS can target the snake's own body, so it can very rarely overlap itself: fixed with the multi-snake pathing (a snake never steps into a blocked cell); covered by the several-snakes test
- [ ] Pillar generation does not check arena connectivity
- [x] Collision is 2D only; jumping needs a height dimension (snake segments are height-aware now; pillars and walls are always full height)
- [ ] three.js and the game are ~700 kB in one JS chunk (184 kB gzipped); consider splitting. Assets in `public/assets` add ~15 MB (loaded at start).
- [ ] Visual regression is manual screenshot review only (matters more once the realistic look lands)

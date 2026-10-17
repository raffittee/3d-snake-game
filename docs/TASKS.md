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

- [x] Terrain looks (4 to 5 tone palettes, textures, lighting/fog/particles/weather) in the terrain registry (Cave last)
  - [x] tall-grass (dusk), corn-maze (late afternoon), swamp (misty evening, fireflies), desert (hot midday, sandstorms), frozen-lake (overcast, snowfall), broken-house (late dusk, warm lamps)
  - [x] cave (pitch dark, a flashlight beam, glowing fungus)
- [x] Level 4 Tall grass (playtest pending)
  - [x] Sim: `Grass` tile and a seeded `meadow` layout (grass patches, open clearings; the snake starts hidden; pellets only in grass)
  - [x] AI: `stalk` (moves only through grass, strikes within 4 cells and gives up past 7, lurks at the patch edge nearest you, back to cover after a strike)
  - [x] Item: firecracker (thrown arc, 1 s fuse, snakes within earshot head for the bang for 5 s), model, drop, throw rig, icon, sounds, flash and smoke
  - [x] Render: shoulder-high grass (1.4) that sways and parts and shakes where something moves; the snake and pellets keep low inside it; `tall-grass` look (olive, straw, dusk orange; Poly Haven withered grass ground and dusk sky)
  - [x] Audio: a panned rustle when a hidden snake moves, louder when close (replaces its step thud while hidden); your own steps swish in grass; fuse hiss and bang
  - [x] HUD: minimap shows grass, hides snake segments in grass and the hidden pellets
  - [x] Level 4 config (collect 8 pellets hidden in the grass), guide, campaign order, 12 unit tests, e2e (loads, throws a firecracker), docs
- [x] Level 5 Corn maze (playtest pending)
  - [x] Sim: `Corn` tile (2.6 tall: blocks sight, you, stones and the snake) and a seeded `maze` layout (2-cell corridors, 16% of walls knocked through for loops, clearings for the start, the tower, the exit and the snakes)
  - [x] Goal `mapThenExit`: the map lies at the far end of the maze by walking; it opens the exit and turns the minimap on
  - [x] AI: `flank` (the first snake chases; the other heads 6 cells ahead of you, or to your far side from the chaser; it chases once within 3 cells); two snakes (`extraSpawns`)
  - [x] Item: smoke bomb (smashed at your feet: every snake loses track and wanders to a spot 12+ cells away for 6 s)
  - [x] Render: corn walls (painted corn rows on cut-out cards, a dark core, a few 3D plants, all swaying), the map board, the smoke cloud, smoke bomb model/drop/throw rig/icon; `corn-maze` look (farm soil, late-afternoon sky, plank fence); minimap blank until the map, then the maze in corn gold
  - [x] Level 5 config, guide, campaign order, 11 unit tests, e2e (no map, smoke bomb, map, exit), docs
- [x] Level 6 Swamp (playtest pending)
  - [x] Sim: `Mud`, `Log`, `Pad` tiles and a seeded `swamp` layout (islands from a noise field; every island joined to the start by a log or a lily-pad chain); mud halves your speed, not the snake's
  - [x] Goal: light 4 signal lanterns (they stay standing, lit), then board the boat (`relicsThenGate` with `relic: 'lantern'`, `exit: 'boat'`)
  - [x] Item: energy drink (full stamina, sprinting costs nothing for 5 s)
  - [x] Render: murky water over the mud, fallen logs, lily pads, reeds and cattails, fireflies, lanterns, the boat and jetty, the energy drink (model/drop/drink rig/icon, glowing stamina bar); `swamp` look; your eye sinks a little in mud
  - [x] Level 6 config, guide, campaign order, 8 unit tests, e2e (energy drink, lanterns, boat), docs
- [x] Level 7 Sandstorm desert (playtest pending)
  - [x] Sim: sandstorm waves (`LevelConfig.storm`, `sim/weather.ts`; a warning event before each); a `desert` layout (open sand, rocks, 3 flasks far apart)
  - [x] AI: `burrow` (dives after a cooldown when you are far, travels under the sand faster toward where you are heading, the sand heaves for 1 s, then it surfaces about 4 cells from you; underground segments cannot touch you and stones pass over them; cuts keep each piece's underground flags)
  - [x] Item: mongoose (rare; runs to the nearest snake above ground and pins it for 10 s, then leaves)
  - [x] Goal: collect 3 water flasks, then reach the oasis
  - [x] Render: dust veil, blowing sand and closing fog in a storm; the body sinking under the sand and a heap of sand over the head (heaving before it surfaces); the mongoose (run and fight), its cage (model/drop/release rig/icon); flasks; the oasis; `desert` look; wind and sand sounds
  - [x] Level 7 config, guide, campaign order, 9 unit tests, e2e (storm, burrow, mongoose), docs
- [x] Level 8 Frozen lake (segments that fall through the ice reuse the cut-end visuals) (playtest pending)
  - [x] Sim: `Ice`, `CrackedIce`, `Hole` tiles and a seeded `lake` layout (snowy shore and islands, 18 cracked patches); you slide on ice
  - [x] Cracked ice: a snake 7+ long cracks it; once its 5th segment behind the head is on it, the whole patch breaks into open water and cuts the snake there (front of 5 goes on, the piece behind becomes a snake or withers; a head over it takes the snake down; you fall in if you stand on it)
  - [x] First level the snake can be beaten: goal `defeatAll` (every snake under 3 segments); guide shows length / snakes left
  - [x] Item: ice cleats (no sliding for 20 s; a HUD chip shows the seconds left, as for the energy drink)
  - [x] Render: glossy ice, darker cracked ice, cracks spreading white, holes of dark water with chunks of ice, falling snow; cleats (model/drop/strap-on rig/icon); `frozen-lake` look; crack/break/buckle sounds; "Fell in" on the death card
  - [x] Level 8 config, guide, campaign order, 8 unit tests, e2e (cleats, a crack cutting the snake, the win), docs
- [x] Level 9 Broken house (playtest pending)
  - [x] Sim: `HouseWall`, `Door`, `Closet` tiles and a seeded `house` layout (48x48 binary-split rooms, doorways with doors, closets, rubble; the key in the farthest room)
  - [x] Doors: R opens or shuts the door in reach (both leaves of a doorway together; not on you or a snake); a shut door is a wall; a snake bashes one down in 3 s; a slam is loud
  - [x] Closets: inside one you are hidden unless the snake is right beside you
  - [x] Noise: walking carries 6 cells, sprinting 10, standing still none, a slam 11; Light feet makes steps 40% quieter (now offered)
  - [x] AI: `ambush` (lies in wait near pellets, items, doors and the key; strikes when it hears you or sees you beside it; gives up at 12 cells or when you hide)
  - [x] Render: wallpapered walls with broken tops, doors that swing, jolt when bashed and lie on the floor when broken, wardrobes, standing lamps (real lights at high quality), the key on a side table; `broken-house` look; the R prompt and a Noise meter; door and hiss sounds
  - [x] Level 9 config, guide, campaign order, 9 unit tests, e2e (a door with R, key, front door), docs
- [x] Level 10 Dark cave (Mother Snake boss, 3 phases) (playtest pending)
  - [x] Sim: `CaveWall` tile and a seeded `cave` layout (cellular automaton, one connected cave); a flashlight battery that drains (kept on a lost life); the minimap shows only the cave near you and no snakes
  - [x] Mother Snake (`sim/boss.ts`): phase 1 she hunts (cut-off pieces wither), at half length she splits in two (phase 2), the last one coils (phase 3); a cut too deep to split goes straight to phase 3; win by beating every snake
  - [x] AI: `coil` (circles you on a ring a little ahead of its head and pulls it in while close, not while stunned)
  - [x] Item: flashlight battery (+60 s)
  - [x] Render: the cave (lumpy rock walls, a ceiling, stalactites, glowing fungus), the flashlight beam (flickers when low, dark when out), glowing eyes (with a halo you can see across the cave), dim hands in the dark, the battery (model/drop/insert rig/icon), a Light meter; boss roars; snake steps panned (and heard further in the dark)
  - [x] Level 10 config, guide (phase lines), campaign end ("Campaign complete"), 9 unit tests, e2e (three phases to the end), docs
- [x] AI behaviors: stalk, flank, burrow, ambush, coil
  - [x] stalk (Level 4)
  - [x] flank (Level 5)
  - [x] burrow (Level 7)
  - [x] ambush (Level 9)
  - [x] coil (Level 10, boss only)
- [x] Items: firecracker, smoke bomb, energy drink, mongoose, ice cleats, flashlight battery
  - [x] firecracker (Level 4)
  - [x] smoke bomb (Level 5)
  - [x] energy drink (Level 6)
  - [x] mongoose (Level 7)
  - [x] ice cleats (Level 8)
  - [x] flashlight battery (Level 10)
- [x] Remaining perks: Light feet (with Level 9's ambushing snake: footsteps carry 40% less far). The other seven shipped in Phase 2.
- [x] Terrain mechanics: tall-grass hiding, mud, ice sliding/cracking, doors and hiding spots, flashlight and battery, visibility waves
- [ ] Playtest gate: a full 10-level run can be beaten and the boss feels fair (needs you; see `docs/CHANGES.md`)
- [ ] Measure fps at high quality on a real GPU for the heavy levels (Tall grass, Corn maze, Broken house lamps, Dark cave beam)

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

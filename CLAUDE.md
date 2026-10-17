# Snake Hunt

A first-person 3D reversal of Snake. You are the food. A snake that grows and keeps speeding up hunts you across a walled grid arena. Survive, collect pellets for points.

Owner: Rafi. The plan for where this is going is in `docs/GAME_DESIGN.md` (10-level campaign, items and perks, friends-only multiplayer with voice). Work items are in `docs/BACKLOG.md`. Read both before starting a feature.

## Commands

- `npm install`, then `npm run dev` (Vite, http://localhost:5173).
- `npm run check`: typecheck + lint + unit tests. Run it before saying a task is done. It must pass.
- `npm run build`: typecheck + production build into `dist/` (deploys to any static host; `base` is `./`).
- `npm run test:e2e`: Playwright smoke test against a production build (about 2 minutes: software WebGL draws the textured arena at a few fps). First time: `npx playwright install chromium`. Software WebGL flags are already set and the tests use `?quality=low`. Set `CHROMIUM_PATH` to use a specific browser binary.
- Debug URL switches: `?debug=1` (debug panel, exposes `window.__snake`), `?seed=N` (same arena every run), `?god=1` (the snake cannot kill you), `?quality=low|high` (overrides the saved graphics quality), `?level=N` (runs start on level N).

## Architecture rules (the important part)

1. **`src/sim` never imports three.js, the DOM, or `window`.** It is plain TypeScript: state in, state out. That keeps it unit-testable and lets a future multiplayer server run the same code. If you need something from the browser, it belongs in `src/render`, `src/ui`, `src/input.ts`, `src/audio.ts`, or `src/game.ts`.
2. **Sim reports, outer layers react.** The sim pushes `SimEvent`s onto `world.events`; `game.ts` drains them into sound and UI. Do not call audio or touch the DOM from the sim.
3. **Randomness goes through the seeded RNG** (`world.rng`, mulberry32). Never `Math.random()` in `src/sim` or `src/ai`, or runs stop being reproducible and the bot/determinism tests break. (Cosmetic effects like camera shake in the renderer may use it.)
4. **Tuning numbers live in `src/config/balance.ts`** (global) or in a `LevelConfig` (per level). No new magic numbers in logic.
5. **Levels are data.** A level is a `LevelConfig` in `src/levels/`. Terrain, size, pillar count, snake behavior and speed, pellets and goal are all config. Add levels to `LEVELS` in `src/levels/index.ts`.
6. **AI behaviors are pluggable.** `src/ai/index.ts` has a `BEHAVIORS` registry; each behavior takes the world and returns the target cell/point. New behaviors extend `BehaviorId` in `src/levels/types.ts` and register there.
7. **The renderer only reads the world.** `GameRenderer.render(world, cameraView, ...)` builds meshes from state and holds no game rules.

## Layout

```
src/
  config/balance.ts     all global tuning numbers
  sim/                  headless game rules (no three.js, no DOM)
    world.ts            createWorld, updateWorld, updateDemo, score, danger, lives/respawn, swimming, relics
    goals.ts            goalMet (endless/survive/collect/either/relicsThenGate/reachExit)
    items.ts            inventory: slots, use, spoil, drops falling and pickup
    projectiles.ts      slingshot stones (flight, hits, snake stun); firecrackers (arc, fuse, bang lures snakes)
    probe.ts            what a point or a view ray touches (stones, machete)
    snake.ts            snake steps (around other snakes), growth, segment positions and heights
    cut.ts              cuts (shrink, split, floor bounce, defeat) and the growth split
    burrow.ts           Burrow's dive / travel under the sand / rise cycle
    mongoose.ts         the mongoose companion: runs to a snake, pins it, leaves
    weather.ts          sandstorm waves (strength over time, warnings)
    ice.ts              cracked ice giving way under a long snake (a whole patch breaks; cuts the snake)
    house.ts            doors (open/shut with R, bashed down), hiding in closets, how far your noise carries
    boss.ts             the flashlight's battery and the Mother Snake's three phases
    perks.ts run.ts     perk effects; the run (level, perks, XP, banked score)
    tiles.ts layouts.ts ground types (low/crumbling walls, water, bridges, tall grass, corn, mud, logs, lily pads, ice, cracked ice, holes, house walls, doors, closets, cave rock) and seeded layouts (ruins, river, meadow, maze, swamp, desert, lake, house, cave)
    player.ts           walk/sprint/stamina/jump/swim, pellet boost
    collision.ts        circle vs box overlap and push-out
    pathfinding.ts      grid BFS + open-room measure
    pillars.ts pellets.ts grid.ts math.ts rng.ts types.ts
  ai/index.ts           BEHAVIORS registry: chase, predict, stalk, flank, burrow, ambush, coil
  items/index.ts        ITEMS registry: what each item does when used (sim code)
  levels/               LevelConfig types, level01 (Plains), level02 (Ruins), level03 (Riverside), level04 (Tall grass), level05 (Corn maze), level06 (Swamp), level07 (Sandstorm desert), level08 (Frozen lake), level09 (Broken house), level10 (Dark cave), LEVELS, guide
  render/               three.js only reads the world
    renderer.ts         GameRenderer: lights, sky, fog, shadows, quality, camera
    terrains.ts         per-terrain look registry (textures, sky, fog, sun, palette)
    arena.ts            ground, walls, rock pillars, start pad, landmarks (tower, tree)
    snakes.ts           every snake's body and head, severed pieces, blood bursts
    snakeBody.ts        one tube body through snake.pos; head/tail/cut ends
    snakeHead.ts        sculpted head, jaw, eyes, tongue
    skin.ts             procedural snake skin and flesh textures
    pellets.ts          glowing gem pellets
    drops.ts            item drops (model, tier glow, ground ring), stones in flight, firecrackers (flight, fuse, bang), smoke clouds
    itemModels.ts       machete, swim ring, firecracker, smoke bomb, energy drink, mongoose cage, ice cleats and battery models (shared by drops and the hands)
    layoutViews.ts      walls (smashed with dust), relics, the corn maze's map, signal lanterns, water flasks, the house key, the gate, the river, bridges, the dock, the boat, the oasis
    grass.ts            tall grass: instanced tufts that sway, and part and shake where something moves; the wind sway shader
    corn.ts             corn maze walls: painted corn rows (cut-out cards), a dark core, a few 3D plants
    swamp.ts            murky water over the mud, fallen logs, lily pads, reeds and cattails, fireflies
    desert.ts           sandstorm (dust veil, blowing sand, fog), the heap of sand over a burrowing snake
    mongoose.ts         the mongoose (model, run and fight)
    ice.ts              ice, cracked ice, cracks spreading, holes with floating chunks, snowfall
    house.ts            wallpapered walls, swinging doors, wardrobes, standing lamps
    cave.ts             lumpy rock walls, the ceiling, stalactites, glowing fungus (the flashlight is in renderer.ts)
    viewmodel.ts        first-person gloved arms holding the selected item, own render pass; per-item rigs (pose + use motion)
    assets.ts           texture/HDRI/glTF loading from public/assets
    palette.ts          minimap colors (reads CSS variables)
  ui/                   DOM: panels, HUD, minimap, inventory slots, item icons, settings form
  input.ts              keyboard, pointer lock, touch -> PlayerInput
  audio.ts              WebAudio square-wave beeps (no audio files)
  settings.ts           player settings: defaults, ranges, sanitize (pure)
  storage.ts            best score and settings (localStorage, guarded)
  game.ts               state machine (menu/play/paused/dead/complete/perk), the campaign flow, frame loop
  main.ts               entry, URL switches, WebGL-failure message
  style.css             design tokens + layout
tests/                  Vitest unit tests (sim only, incl. a headless bot run)
e2e/                    Playwright smoke test
public/assets/          CC0 textures, sky, tree model (see CREDITS.md); copied into the build as-is
docs/                   GAME_DESIGN.md, BACKLOG.md, decisions/ (ADRs)
prototype/              the original single-file version, kept for reference
```

## Look

**Grounded realistic 3D, never blocky or toy-like** (`docs/decisions/0002-grounded-realistic-look.md`). Built in Phase 1 item 7. Keep to it:
- Real lighting and PBR materials: sRGB output with ACES tone mapping, a sun with soft shadows fitted to the arena, the HDRI sky as background and image-based light, fog. Full resolution with antialiasing. No edge outlines, pixelated upscale or scanlines.
- Assets are CC0 from Poly Haven in `public/assets/`, each listed in `public/assets/CREDITS.md`. Add any new asset there. 1k textures; keep the bundle in mind (about 15 MB of assets today).
- Each terrain's look (textures, sky, fog, sun, 4 to 5 tone palette) is data in `render/terrains.ts`, keyed by `LevelConfig.terrain`. All ten exist (plains, ruins, riverside, tall grass, corn maze, swamp, desert, frozen lake, broken house, cave). The cave has no sky (`noSky`): black beyond the fog, no image-based light, lit by the flashlight (a spot light on the camera) alone.
- The snake is one smooth tube through `snake.pos` (`render/snakeBody.ts`) with a procedural diamondback skin whose texture coordinates travel with the body, a gentle slither tied to its track (it only moves when the snake moves), and a sculpted head (`render/snakeHead.ts`). It is drawn inside its collision boxes: body top about 1.9, above your eyes (box `BALANCE.snake.bodyHeight` 2.2); it tapers over 1.5 segments into the last 4 segments, which stay below 0.7 so they look jumpable (ADR 0003), and ends in a long pointed tip. Ends can be `head`, `tail` or `cut`; a cut end shows a flesh cap (for the Phase 2 machete). In tall grass each segment (and the head) is drawn low, under the grass tops (`LOW_BODY_SCALE`), and rises again in the open; its collision box does not change.
- First-person hands (`render/viewmodel.ts`): gloved arms hold the selected item and play its use motion (slingshot: release, reach, draw). Drawn in a second pass so they never clip. Every new item adds a rig to `RIGS` (a hold pose and a use motion); no item ships without one.
- Death camera: the head rears up and opens its jaws, and the camera backs off to face it.
- Graphics quality (`Settings.quality`, `?quality=`): high = shadows + image-based light; low = neither, lower pixel ratio, coarser body. e2e uses low.
- HUD and menus: dark translucent panels, Inter (bundled via `@fontsource-variable/inter`, works offline). Tokens are CSS variables at the top of `src/style.css`; `render/palette.ts` reads the minimap colors from them. Red (`--alert`) means danger only: the danger vignette, the snake head on the minimap, the tired stamina bar, and blood.

## Game rules (current: the full campaign, Levels 1 to 10)

- A run plays Level 1 (Plains, 48x48: survive 90 s or collect 10 pellets), Level 2 (Ruins, 48x48: find 5 relics, then reach the gate), Level 3 (Riverside, 64x64: cross the river to the far dock), Level 4 (Tall grass, 64x64: collect 8 pellets hidden in the grass), Level 5 (Corn maze, 64x64: find the map, then the exit), Level 6 (Swamp, 64x64: light 4 signal lanterns, then board the boat), Level 7 (Sandstorm desert, 64x64: collect 3 water flasks, then reach the oasis), Level 8 (Frozen lake, 64x64: beat the snake, the first level where you can: shrink every snake under 3 segments, goal `defeatAll`), Level 9 (Broken house, 48x48: find the key, then leave by the front door) and Level 10 (Dark cave, 64x64: beat the Mother Snake; winning it completes the campaign). Lives refill and items clear between levels; perks and XP last the run. Losing all lives ends the run and the next one starts at Level 1 with no perks.
- Arenas: 2 world units per cell, perimeter walls, landmarks (tower, tree) that fill their footprint, random pillars (never touching anything solid, never in the snake lane or near the start). Ruins add seeded rooms of low walls (you jump them, the snake goes around) and crumbling walls (they block you and stones; the snake smashes through). Riverside adds a winding river (deep water needs the swim ring) with plank bridges. Tall grass adds seeded patches of shoulder-high grass (1.4, under your eyes): everyone walks through it; it hides the snake (drawn low inside it, left off the minimap) and the pellets (they only lie in grass there, and the minimap leaves them out: `LevelConfig.pelletsIn`, `minimap.hidePellets`). You track a hidden snake by the grass parting and shaking where it moves and by its rustle, panned to its side. Corn maze is a seeded maze of corn walls (2.6 tall: they block sight, you, stones and the snake) around 2-cell corridors, with some loops, a tower in a central clearing and no rocks; the minimap is blank until you pick up the map (the one "relic", at the far end of the maze by walking), which also opens the exit gate (`LevelConfig.minimap.offUntilMap`, goal `mapThenExit`). Swamp is seeded islands of firm ground in mud (`BALANCE.swamp`: you move at half speed in mud and your eye sinks a little; the snake is not slowed); every island is joined to the start by a fallen log or a chain of lily pads (firm, full speed). Its 4 signal lanterns stand on islands; walking up to one lights it (it stays standing, lit), and the last one readies the boat at the north jetty (goal `relicsThenGate` with `relic: 'lantern'`, `exit: 'boat'`). Desert is open sand with sandstone rocks; sandstorms blow through in waves (`LevelConfig.storm`, `sim/weather.ts`: the wind rises 4 s before; visibility drops to a few cells while one blows); its 3 water flasks lie far apart and the oasis is on the north edge. Frozen lake is ice with a snowy shore and islands (`BALANCE.ice`): on ice you slide (your speed only eases toward what you ask for; ice cleats stop it); darker patches of cracked ice give way under a snake 7+ long (`sim/ice.ts`): once the 5th segment behind its head is on a cracked cell, the whole patch becomes open water (a hole: blocks everyone), each snake over it is cut at its first segment there (losing what lies over the hole; the front goes on, the piece behind becomes its own snake or withers), and you fall in (a life) if you stand on it. Broken house is a roofless ruin of seeded rooms behind full-height walls (`BALANCE.house`): doorways hold doors (both leaves move together; `world.doorState`), R opens or shuts the one in reach (a prompt shows; it won't shut on you or a snake), a shut door is a wall for you and stones, and a snake bashes one down in 3 s; in a closet you are hidden unless the snake is right beside you; rubble lies about. Your noise (`world.noise`, `BALANCE.noise`; a Noise meter shows it on Ambush levels): walking carries 6 cells, sprinting 10, still or hidden none, a slammed door 11 for a moment; Light feet makes footsteps 40% quieter. Dark cave is a seeded cave (cellular automaton, one connected space) under a rock ceiling, pitch dark: your flashlight's battery (`world.battery`, 90 s to start, kept when you lose a life, `BALANCE.cave`) drains, the beam flickers under 10 s and goes out at 0; a Light meter shows it; snakes show only in the beam but their eyes glow; their steps are panned and carry further; the minimap shows only the cave within 10 cells of you and no snakes. The Mother Snake (`sim/boss.ts`, `LevelConfig.snake.boss`; 30 long, beatable): phase 1 she hunts like Predict and every piece cut off her withers; at half her length she splits in two (phase 2); when one is left it switches to Coil (phase 3); a cut too deep to split skips to phase 3. The player starts and respawns on `LevelConfig.start`.
- Player: walk/sprint speed, stamina that drains while sprinting, "tired" state until it recovers, and a jump that costs stamina. See `BALANCE.player`.
- Jumping clears the snake's last 4 segments (drawn low) but never the rest of the body or the head. Collision with the snake is height-aware (ADR 0003).
- Snakes: each moves cell by cell using BFS toward its behavior's target (Chase: your cell; Predict: where you will be in 1 s; Stalk: through grass only, to your cell if you are in its grass, else to the edge of its patch nearest you where it lurks, and it breaks cover to charge once you are within 4 cells, until you are 7 away; out of grass it heads back into cover; Flank: the first snake chases, every other one heads 6 cells ahead of where you run, or to your far side from the chaser, and chases once within 3 cells; Burrow (`sim/burrow.ts`): Predict on the surface; after 9 s up and with you 7+ cells away it dives and travels under the sand 30% faster toward where you will be in 1.5 s; within 4 cells of you (or after 10 s) the sand heaves for 1 s, then it breaks the surface; segments under the sand (`snake.under`) cannot touch you, stones pass over them and the minimap leaves them out; Ambush: lies in wait near pellets, items, doors and the key, strikes when your noise reaches it or you are within 2 cells, gives up at 12 cells or when you hide in a closet; Coil (boss phase 3 only): circles you on a ring a little ahead of its head and pulls the ring in from 5 cells to 1 while close (not while stunned), so you cut your way out or stun it; a firecracker's bang or a smoke bomb overrides any of them), around pillars, low walls and every snake's body (never into a blocked cell); step interval shrinks over time (1.6x slower with its head in water); grows on a timer and by eating pellets; length is capped. Bodies block you. No path: it heads for the roomiest neighbor; completely stuck: it sheds tail cells.
- Length is HP (`sim/cut.ts`): a machete cut on the segment under the crosshair shrinks the snake (a piece under 4 behind the cut withers) or splits it (the back half grows a head and is dazed 1 s). The head bounces the blade. Where the snake cannot be beaten (every level but 8 and 10) a cut that would leave it under its floor (5) bounces; on Levels 8 and 10 (`defeatable`) a cut that leaves the front under 3 beats it. A cut leaves a stump, not jumpable, until 4 growth steps regrow the tail. Level 3: a snake past 22 segments flashes for 2 s, then splits in half by itself.
- Items: 2 inventory slots. Drops fall on a timer from `LevelConfig.items` (Level 1: slingshot, mostly white) on free cells away from you; walk over one to pick it up (both slots full: it stays). Tiers white/blue/gold give 1x/1.5x/2x the uses and spoil time (`BALANCE.items`); each held item's ring drains and it spoils when empty. Items are kept when you lose a life. What an item does lives in the `ITEMS` registry (`src/items`); new items extend `ItemId` and register there.
- Machete (5 cuts, first drops Level 2): reach 2.6 from your eye; every swing costs a cut, hit or miss.
- Firecracker (1, first drops Level 4): thrown in an arc along the crosshair (about 11 cells on flat ground; it drops at the foot of whatever it hits), it lies with its fuse burning for 1 s, then bangs: every snake whose head is within 20 cells heads for that spot for 5 s, out of cover if it must. Numbers in `BALANCE.items.defs.firecracker`.
- Flashlight battery (1, first drops Level 10): snapped into the flashlight, +60 s of light.
- Ice cleats (1, first drops Level 8): strapped on, no sliding on ice for 20 s (`BALANCE.items.defs.iceCleats`). Effects that are running (energy drink, cleats) show as chips with the seconds left under the stamina bar.
- Mongoose (1, rare, first drops Level 7): let out of its cage, it runs to the nearest snake whose head is above ground and pins it for 10 s (no steps, no growth; its body still blocks and its head still bites), then leaves; with no snake above ground it waits by you (`BALANCE.items.defs.mongoose`).
- Energy drink (1, first drops Level 6): drunk on the spot; stamina fills and sprinting costs nothing for 5 s (the stamina bar glows). `BALANCE.items.defs.energyDrink`.
- Smoke bomb (1, first drops Level 5): smashed at your feet; a cloud of smoke hangs there, and every snake loses track of you and wanders off toward a spot at least 12 cells from you for 6 s (`BALANCE.items.defs.smokeBomb`).
- Swim ring (first drops Level 3): passive while carried; its 30 s drain only while you swim (slow, no sprint or jump); running out in deep water drowns you (a life). Using it does nothing.
- XP and perks: each pellet is 1 XP; level-ups at 3, then 5, 7... more XP. Level-ups are spent between levels: 3 perks offered, pick 1 each. Perks: Big lungs, Light feet (quieter footsteps), Packrat (3rd slot), Preserver, Spring legs (one more jumpable tail segment), Keen ears (arrow to a near snake), Sharp edge (2-segment cuts), Second wind (once per level a catch knocks you back).
- Slingshot: fires a stone along the crosshair (40 u/s, slight drop, 1.5 s). A head hit stuns the snake for 2 s: no steps, no growth, body still blocks, the head still catches; a second hit resets the stun. Body, pillars, walls and the ground just stop the stone; the low tail is flown over. Numbers in `BALANCE.items.defs.slingshot`.
- Lives: 3 per level (`BALANCE.lives`). Head overlap ("Eaten") or being squeezed against a wall/pillar ("Crushed") costs a life: you respawn on the start point with 2 s of grace, and the snake and the clock carry on. Losing the last life plays the 1.1 s death camera, then the game-over card.
- Goals live in `LevelConfig.goal` and are checked by `sim/goals.ts`; meeting one sets `status: 'complete'` and shows the level-complete card (Continue: perk picks, then the next level). Riverside pellets also give a +15% speed boost each that fades over 8 s (`LevelConfig.pelletBoost`). A corner guide under the minimap shows goal, progress and snake rule (`LevelConfig.guide`); it is the only tutorial text.
- Score per level = floor(elapsed * 10) + pellets * 100; the run score adds the levels up. Best run score in `localStorage` under `snake-hunt-best`.
- Controls: WASD/arrows move, mouse looks (click to lock the pointer), Shift sprints, Q/E turn, Space jumps, click or F uses the selected item, R opens or shuts a door (Broken house), 1/2 or the mouse wheel picks the slot (the first click only locks the pointer), Esc/P pause, M mute, Enter starts. Settings (title and pause cards): mouse sensitivity, volume, FOV, render scale, graphics quality, saved under `snake-hunt-settings`. Touch: left side stick, right side look, RUN and pause buttons (no jump or item buttons yet). Pausing releases the pointer lock (otherwise the Resume button cannot be clicked).

## Known gaps

- Touch controls and the game on a real phone have not been tested. Desktop first (design decision).
- Balance numbers are guesses. Playtest and tune `balance.ts`.
- Pillar generation does not verify the arena stays connected (the no-adjacent rule makes blocking unlikely).
- The minimap shows the whole snake and every pellet. Intentional for now; some levels will turn it off.
- No automated check of visuals; the e2e smoke test only proves the game loads, runs, jumps, pauses, ends a run, plays the campaign flow into Level 2 with a perk, cuts the snake, loads Levels 3 to 7, throws a firecracker, uses a smoke bomb, finds the maze map and exit, drinks an energy drink, lights the swamp lanterns and boards the boat, sends the desert snake under the sand in a storm and lets a mongoose go, straps on ice cleats and has cracked ice cut the snake and wins Level 8, opens a door with R and takes the house key out the front door, takes the Mother Snake through her three phases to "Campaign complete", uses items and saves settings without console errors.
- The default (high) quality has not been measured on a real GPU yet; check `fps` in the `?debug=1` panel. The software-WebGL e2e run gets a few fps, which says nothing about real hardware.
- The landmark tree is a quiver tree (a desert aloe), the only light CC0 tree on Poly Haven. Other Poly Haven trees are 150k to millions of polygons or 200+ MB.
- The floor no longer shows the cell grid, so the snake's grid is less readable than in the LCD look. Watch for it in playtests.
- River banks and walls follow the cell grid, so the water's edge is stepped rather than smooth. The edges of tall-grass patches follow the grid too (softened by shorter tufts at the edge).
- Grass density is set by the graphics quality when a level starts; changing quality mid-level keeps the old density. High quality draws about 1.3 million grass triangles on Level 4: check its fps on a real GPU.
- The danger vignette still reacts to a snake hidden in tall grass (it reads the distance, not what you can see). Watch for it in playtests: it gives away how close a stalker is.
- Severed pieces and blood are cosmetic: pieces have no collision.
- Assets are ~61 MB in the repo; a player only downloads the current terrain's textures.
- The house has no furniture besides wardrobes, lamps and the key's table; touch has no R button yet.
- When the last life is lost to anything but a snake (drowned, fell in), the death camera still turns to the nearest snake's head.
- The desert floor is flat (no dunes): the grid has no height.
- Swamp island shores follow the grid (stepped edges), like the river banks.
- The corn maze's corn is painted cards plus a few 3D plants: up close a card is flat if you press your face into it.

## Working with Claude in this repo

- Work one backlog item at a time. Say which item, ask for a plan first on anything touching more than 3 files.
- Write the failing test first for sim changes; use `?seed=` and `?god=1` to reproduce things by hand.
- After any rendering or UI change, run `npm run test:e2e` and look at the screenshots in `test-results/` (the test writes `title.png`, `play.png`, `dead.png`, `complete.png`, `perk.png`, `level3.png`, `level4.png`, `level5.png`, `level6.png`, `level7.png`, `level8.png`, `level9.png`, `level10.png`, `settings.png`, `inventory.png`).
- Record meaningful architecture decisions as a short file in `docs/decisions/`.
- Do not commit unless asked. Keep commits small, one backlog item each.

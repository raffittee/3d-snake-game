# Changes for review (Phase 3, while you were away)

Written for Rafi, to review on your return. Nothing here is committed. `npm run check` and the e2e smoke tests pass at the end of each level below.

The **Decisions I made** lists are the calls I would normally have asked you about. Each one says what I picked and why, so you can overturn it.

## At a glance

- **Phase 3 is built:** Levels 4 to 10, the full 10-level campaign through to the Mother Snake. "Campaign complete" shows after Level 10.
  - **Behaviors:** all five new ones (Stalk, Flank, Burrow, Ambush, Coil).
  - **Items:** all six (firecracker, smoke bomb, energy drink, mongoose, ice cleats, flashlight battery), each with a model, a drop, a hands motion and an icon.
  - **Perks:** the last one, Light feet.
  - **Terrain rules:** grass hiding, a maze with no map, mud, sandstorms, sliding and cracking ice, doors, closets and noise, darkness with a flashlight.
- **Tests:** 228 unit tests (66 of them new) and 14 e2e tests (7 new), all passing. TASKS.md is ticked as each part landed.
- **Visual check:** every level got a staged high-quality screenshot review (software WebGL), and I fixed what looked wrong. Each level's section says what changed.
- **Still yours:**
  - the Phase 3 playtest gate: "a full 10-level run can be beaten and the boss feels fair"
  - Phase 2's gate
  - fps on a real GPU (grass, corn, lamps and the cave beam are the heavy parts)
  - committing: nothing is committed. I can split it into commits per level if you like, as with Phase 2.
- **New controls:** R opens and shuts doors (Level 9). Touch has no R or item buttons yet.
- **Assets:** about 61 MB in the repo now (+30 MB of CC0 Poly Haven textures and skies, all in `CREDITS.md`). A player only downloads one level's worth.

## How to try it

- `npm run dev`, then open `http://localhost:5173/?debug=1&level=4` (or `&level=5`, up to `&level=10`) to start a run on that level.
- Add `&god=1` to look around without being caught, and `&seed=7` to get the same map every time.

---

## Level 4: Tall grass

**What you get**
- A 64x64 meadow: seeded patches of shoulder-high grass (1.4, just under your eyes at 1.6) with open clearings between them. You start in a clearing in the middle; the snake starts hidden in a patch.
- **Goal:** collect 8 pellets hidden in the grass. They only lie in grass, sit low under the grass tops (a faint glow shows between the blades), and are not on the minimap.
- **Stalk snake:**
  - It moves only through grass, toward you if you are in its grass, otherwise to the edge of its patch nearest you, where it lurks.
  - It breaks cover and charges when you come within 4 cells, and gives up once you are 7 cells away. Then it heads back into the nearest grass.
- **Hiding:**
  - Inside grass the snake is drawn low (body and head), under the grass tops, and rises to full height in the open. Only the drawing changes: its collision box is as tall as ever, so you still can't jump it.
  - The minimap leaves out every snake segment that lies in grass.
- **Tracking it:**
  - The grass bows and shakes where the snake moves (and where you walk), then settles.
  - A hidden snake's steps are a rustle, panned to its side and louder when close, instead of the usual thud.
  - Your own steps swish in grass.
- **Firecracker** (first drops here, 1 use; 2 at blue and gold):
  - Click/F throws it in an arc along the crosshair, about 11 cells on flat ground. If it hits a rock, a wall or the snake, it drops at that thing's foot.
  - It lies with its fuse sputtering for 1 s, then bangs with a flash, smoke and a crack-and-boom.
  - Every snake whose head is within 20 cells heads for the bang for 5 s, out of the grass if it has to.
  - The hands hold it lit, wind back, throw and recover.
- **Look:** dusk light (low orange sun from the west, warm haze), olive-to-straw grass, a withered-grass ground. New CC0 assets: `withered_grass` texture, `qwantani_dusk_2_puresky` sky (in `CREDITS.md`).

**Decisions I made** (you picked the first four before you left)
1. Grass shoulder-high, minimap hides the snake in grass, Stalk strikes within 4 cells, firecracker thrown: your picks.
2. **Stalk gives up at 7 cells** (not 4), so it doesn't flicker between charging and hiding at the edge of its range.
3. **Firecracker range and timing:** about 11 cells, a 1 s fuse, heard within 20 cells, a 5 s lure. First guesses; see `BALANCE.items.defs.firecracker`.
4. **Firecracker colour:** kraft-paper tan with dark bands, not red, because red is reserved for danger.
5. **Pellets glow faintly through the grass** rather than being invisible: a cue to search for, not a beacon.
6. **Pillars can stand in grass** (they are taller than it, so they read as landmarks).

**Watch for in a playtest**
- **Danger vignette:** the red screen edge still reacts to a hidden snake. It reads distance, not what you can see. If it gives the stalker away too much, I can turn it off for snakes in grass.
- **Firecracker as an escape:** a firecracker pulls the stalker out of cover. Check that this feels like a fair tool, not a free escape.
- **Frame rate:** high quality draws about 1.3 million grass triangles. Check `fps` in `?debug=1` on your GPU. If it's low, I can thin the grass or add distance fading.
- **Patch edges:** they follow the grid (softened with shorter tufts at the edge), like the river banks.

**Files (Level 4)**
- New: `src/levels/level04.ts`, `src/render/grass.ts`, `tests/tallgrass.test.ts` (12 tests).
- Changed:
  - sim: `tiles.ts` (Grass, `hiddenInGrass`), `layouts.ts` (meadow), `snake.ts` (cover-only paths), `projectiles.ts` (firecracker), `world.ts` (lures), `pellets.ts`, `types.ts`
  - rules and data: `ai/index.ts` (stalk), `items/index.ts`, `balance.ts`, `levels/types.ts`, `levels/index.ts`
  - render: `drops.ts`, `itemModels.ts`, `viewmodel.ts`, `snakes.ts`, `snakeBody.ts`, `pellets.ts`, `terrains.ts`, `renderer.ts`, `palette.ts`
  - UI and audio: `hud.ts` (minimap), `icons.ts`, `audio.ts`, `game.ts`, `style.css`
  - tests and docs: `e2e/smoke.spec.ts`, `CLAUDE.md`, `GAME_DESIGN.md`, `TASKS.md`, `CREDITS.md`

---

## Level 5: Corn maze

**What you get**
- A 64x64 corn maze, seeded: corridors two cells wide between corn walls 2.6 tall. The corn is over your eyes, so it blocks sight, and it also blocks you, stones, firecrackers and the snake.
  - **Shape:** about 16% of the inner walls are knocked through, so the maze has loops, not only dead ends.
  - **Clearings:** at the start (bottom middle), around a watchtower in the middle (you can see it above the corn, to get your bearings), at the exit (north edge) and where the snakes start (the top corners).
  - **No rocks:** rocks would seal corridors.
- **Goal:** find the map, then the exit.
  - The minimap reads "No map" until you find it.
  - The map stands on a board at the far end of the maze by walking (never near the exit or the snakes' corners).
  - Picking it up turns the minimap on (the maze in corn gold, the exit, the snakes) and opens the exit gate.
  - The guide says "Map not found", then "Map found: reach the exit".
- **Two snakes, Flank:**
  - The first one chases you.
  - The second heads 6 cells ahead of where you're running (or, when you stand still, round to your far side from the chaser) to cut you off.
  - Once it's within 3 cells it simply chases. In the maze, the "ahead" spot is pulled back toward you until it's a cell it can reach.
- **Smoke bomb** (first drops here, 1 use):
  - Smashed at your feet; a thick cloud hangs there.
  - Every snake loses track of you for 6 s and wanders off toward a spot at least 12 cells from you.
  - The hands throw it down.
- **Look:** late-afternoon sun, amber haze, farm-soil ground, a plank fence around the field. New CC0 assets: `farm_soil` texture, `lonely_road_afternoon_puresky` sky.
  - **The corn:** painted rows of corn on cut-out cards along every corridor face and crossed inside each wall cell, a dark mass behind them, and a few real 3D plants in front for depth. Everything sways.

**Decisions I made**
1. **Corridors two cells wide** (one-cell corridors make a snake an impassable plug), with **loops**, so two snakes can't trap you in every dead end.
2. **The map turns the minimap on and opens the exit.** The exit doesn't count until you have the map.
3. **Flank:** "cut off your escape" means 6 cells ahead of your running direction; standing still, your far side from the chaser.
4. **Smoke bomb affects every snake, at any distance.** The design said "the snake loses track", and with two hunters, one still on you would make the bomb feel broken.
5. **Smoke bomb and lure timers keep running while a snake is stunned.** I found this while testing: a stunned snake used to pause its lure.
6. **Snakes grow 1.5x slower here, capped at 40 segments.** Long snakes in 2-wide corridors would choke the maze.
7. **A tower in a central clearing,** so you're not totally lost before you find the map.

**Watch for in a playtest**
- **Difficulty:** is the maze too hard before the map? The minimap is fully off; the tower is the only landmark.
- **Flank fairness in tight corridors:** if it's too brutal, raise `loops` in `level05.ts` or slow the snakes.
- **Smoke cloud:** it's thick around you on purpose. Check that it doesn't feel like a white screen.
- **Frame rate** on high quality (thousands of corn cards and 3D plants): check `fps`.

**Files (Level 5)**
- New: `src/levels/level05.ts`, `src/render/corn.ts`, `tests/cornmaze.test.ts` (11 tests).
- Changed:
  - sim: `tiles.ts` (Corn), `layouts.ts` (maze), `snake.ts` (several spawns), `world.ts` (map pickup, smoke, lure clock), `goals.ts`, `types.ts`
  - rules and data: `ai/index.ts` (flank), `items/index.ts` (smoke bomb), `balance.ts`, `levels/types.ts`, `levels/guide.ts`, `levels/index.ts`
  - render: `drops.ts` (effects renamed `ItemEffects`, smoke cloud), `itemModels.ts`, `viewmodel.ts` (one throw rig for thrown items), `grass.ts` (shared wind shader), `layoutViews.ts` (map board), `terrains.ts`, `renderer.ts`, `palette.ts`
  - UI and audio: `hud.ts` (minimap off until the map), `icons.ts`, `audio.ts`, `game.ts`, `style.css`
  - tests and docs: `e2e/smoke.spec.ts`, `CLAUDE.md`, `GAME_DESIGN.md`, `TASKS.md`, `CREDITS.md`

---

## Level 6: Swamp

**What you get**
- A 64x64 swamp, seeded: islands of firm ground (about 40% of the map) in mud.
  - **Mud:** you move at half speed in it, walking or sprinting (jumping still works), and your view sinks a little as you wade. The snake isn't slowed at all.
  - **Paths:** every island is joined to the start by a firm path at full speed, either a fallen log or a chain of lily pads (some flowering).
- **Goal:** light 4 signal lanterns, then board the boat.
  - Walk up to a lantern to light it. It stays standing, lit and flickering.
  - The guide counts "Lanterns 1/4" and, after the 4th, says "The boat is ready: board it". The boat's lamp comes on at the north jetty.
  - The lanterns stand on islands, at least 16 cells from the start and apart from each other.
- **Snake:** Predict (aims where you will be in 1 s), at full speed in the mud. That is the danger: the mud slows only you.
- **Energy drink** (first drops here, 1 use; 2 at gold):
  - Stamina fills, and sprinting costs nothing for 5 s. The stamina bar glows lime meanwhile.
  - The hands lift the can and drink.
  - Teal and lime, not red.
- **Look:** a misty evening (green-grey haze, a weak low sun), murky dark water over the mud, reeds and cattails along the shores, fireflies blinking, a palisade of old logs around the edge.
  - New CC0 assets: `brown_mud_leaves_01` (islands), `bark_willow` (logs and palisade), `kloofendal_28d_misty_puresky` (sky). The mud bed reuses Level 5's `farm_soil`.
- **Sounds:** your steps squelch in mud; a lantern catches with a whoomp and a chime; the can cracks, fizzes and gulps.

**Decisions I made**
1. **Mud halves your speed, and there's a dry path to everything.** You can always reach every lantern and the boat without wading (a test checks this on 10 seeds). Mud is a shortcut that costs you, never a wall.
2. **Lanterns stay lit** (the Ruins relics vanish when taken). A lit lantern also shows you where you've been.
3. **The energy drink has no speed boost**, only free sprinting, as the design says. It's strongest crossing mud, since sprinting in mud is still only half speed.
4. **The boat is boarded by walking onto the jetty end** (like the Ruins gate). There's no boarding animation.
5. **Asset budget:** the repo's assets are now about 48 MB. I reused `farm_soil` for the mud bed to save about 3 MB. A player still downloads only the current level's textures.

**Watch for in a playtest**
- **Mud pressure:** a full-speed snake against a half-speed you in mud may be harsh. The knobs are `BALANCE.swamp.mudSpeed` and the island share (`firm` in `level06.ts`).
- **Shore edges:** island shores follow the grid (stepped), like the river banks.
- **Lanterns at a distance:** check they read well; the lit glow is subtle on purpose.

**Files (Level 6)**
- New: `src/levels/level06.ts`, `src/render/swamp.ts`, `tests/swamp.test.ts` (8 tests).
- Changed:
  - sim: `tiles.ts` (Mud, Log, Pad), `layouts.ts` (swamp, value noise), `player.ts` (mud speed, energy), `world.ts` (in mud, lanterns stay recorded), `types.ts`
  - rules and data: `items/index.ts` (energy drink), `balance.ts`, `levels/types.ts`, `levels/guide.ts`, `levels/index.ts`
  - render: `layoutViews.ts` (lanterns, boat and jetty), `itemModels.ts`, `drops.ts`, `viewmodel.ts` (drink motion), `terrains.ts`, `renderer.ts` (mud eye drop, the water's sky sheen), `grass.ts` (shared tuft)
  - UI and audio: `hud.ts` (glowing stamina bar, mud on the minimap), `palette.ts`, `icons.ts`, `audio.ts`, `game.ts`, `style.css`
  - tests and docs: `e2e/smoke.spec.ts`, `CLAUDE.md`, `GAME_DESIGN.md`, `TASKS.md`, `CREDITS.md`

---

## Level 7: Sandstorm desert

**What you get**
- A 64x64 desert of open sand and sandstone rocks under a hot, hazy sky.
- **Sandstorms:**
  - **Timing:** the first blows in 20 s into the level, then one every 32 s. Each lasts 10 s: 2.5 s to blow in, 5 s at full strength, 2.5 s to die down.
  - **Warning:** 4 s before each one, the wind rises with a long roar. During a storm the wind's loudness follows its strength.
  - **What you see:** visibility drops to about 6 cells. An ochre dust veil covers everything (the sky too), grains of sand stream past, and the fog closes in.
- **Goal:** collect 3 water flasks (canteens on stones, far apart and far from the start), then reach the oasis on the north edge: a pool with reeds and two quiver trees that shimmers once you have all three.
- **Burrow snake:**
  - **Surface:** it hunts like Predict.
  - **Diving:** after 9 s on the surface, if you're at least 7 cells away, it dives. The body follows the head down into the hole cell by cell, with a deep rumble.
  - **Underground:** a heap of sand rolls along over its head. It's 30% faster down there and heads for where you'll be in 1.5 s.
  - **Surfacing:** within 4 cells of you (or after 10 s under) it stops, and the sand heaves and shakes for 1 s with a low tremor. Then it breaks the surface and the body follows it up.
  - **While under:** it can't touch you (you can walk over it), stones and blades pass over it, and the minimap leaves it out.
- **Mongoose** (rare, first drops here):
  - You carry it in a slatted cage. Use it: the cage tips, the door drops and it runs out.
  - It runs to the nearest snake above ground and pins it for 10 s: no steps, no growth, though the body still blocks and the head still bites if you walk into it. It darts, hops and lunges around the head, chattering.
  - Then it runs off. With no snake above ground, it waits by you.
- New CC0 assets: `sand_02` (ground), `sandstone_cracks` (rocks and walls), `syferfontein_0d_clear_puresky` (sky).

**Decisions I made**
1. **Burrow is fair:** it never comes up on top of you. It always heaves for 1 s about 4 cells away, and it can't hurt you underground. The scare is where it pops up, not a hit you can't see coming.
2. **The mongoose pins rather than damages:** it doesn't shorten or beat the snake (Level 7's snake can't be defeated). It buys you 10 s.
3. **Storms are on a fixed schedule** (seeded runs feel the same), always announced by the wind.
4. **The oasis** reuses the quiver tree (the only light CC0 tree we have). It looks right in a desert.
5. **No dunes:** the arena floor is flat (the grid has no height). The look comes from the sand texture, the rocks and the haze.

**Watch for in a playtest**
- **Storm visibility:** is 6 cells too blind? The knobs are the `storm` near/far in `terrains.ts` and `level07.ts`'s `storm`.
- **Burrow at speed:** late in the level its surface speed is high. Check the 1 s heave is enough warning.
- **Mongoose strength:** 10 s of a pinned snake may be very strong, which is why it's rare.

**Files (Level 7)**
- New:
  - sim: `src/sim/burrow.ts`, `src/sim/mongoose.ts`, `src/sim/weather.ts`
  - level and render: `src/levels/level07.ts`, `src/render/desert.ts`, `src/render/mongoose.ts`
  - tests: `tests/desert.test.ts` (9 tests)
- Changed:
  - sim: `snake.ts` (underground flags), `cut.ts` (they survive cuts), `world.ts`, `probe.ts`, `layouts.ts` (desert), `types.ts`
  - rules and data: `ai/index.ts` (burrow), `items/index.ts`, `balance.ts`, `levels/types.ts`, `levels/guide.ts`, `levels/index.ts`
  - render: `snakeBody.ts` / `snakes.ts` (sinking under the sand), `layoutViews.ts` (flasks, oasis), `itemModels.ts`, `drops.ts`, `viewmodel.ts` (cage release), `terrains.ts`, `renderer.ts` (storm pass)
  - UI and audio: `hud.ts`, `icons.ts`, `audio.ts` (wind loop, sand, mongoose), `game.ts`
  - tests and docs: `e2e/smoke.spec.ts`, `CLAUDE.md`, `GAME_DESIGN.md`, `TASKS.md`, `CREDITS.md`

---

## Level 8: Frozen lake

**What you get**
- A 64x64 frozen lake: glossy blue-grey ice almost everywhere, a snowy shore along the edges, a few snowy islands, frozen rocks, snow drifting down.
- **Sliding:** on ice your speed only eases toward what you ask for, so you're slow to start, turn and stop, and you keep your slide in the air. On snow you have full grip.
- **Ice cleats** (first drops here): strap them on for full grip on ice for 20 s. A chip under the stamina bar counts the seconds down; the energy drink now gets one too.
- **Cracked ice:** 18 darker patches (2x2 to 3x3).
  - **Cracking:** a snake 7+ segments long that runs its head onto one starts it cracking. White cracks spread with sharp creaks as its body slides over.
  - **Breaking:** when the 5th segment behind its head is on that cell, the whole patch shatters into dark open water, with broken chunks of ice bobbing in it.
  - **What falls in:** every snake over the patch is cut at its first segment there. It loses the segments over the hole, exactly like a machete cut: flesh caps, blood, and the piece behind becomes its own snake or withers.
  - **Afterwards:** a hole blocks everyone from then on. If you're standing on the patch when it goes, you fall in ("Fell in", a life).
- **Beating the snake:** this is the first level where you can win by beating it. The goal is to shrink every snake under 3 segments; a front cut under 3 beats that snake. The guide shows "Length 16", then "2 snakes, longest 10", and so on.
  - **The snake:** long (16) and fast, a plain Chase.
  - **How to win:** lure it across cracked ice for the big bites (firecrackers help: they pull it where you want), then finish the short pieces with the machete. Pieces under 7 are too light to break ice.
- New CC0 assets: `snow_02` (shore), `snow_field_puresky` (sky). The ice, cracks and holes are made in code.

**Decisions I made**
1. **A break is counted in segments, not time.** My first version broke 0.7 s after the head arrived, which at this snake's speed cut it 2 segments behind the head and won the level in one go. Now a break always leaves a front of 5, at any speed.
2. **The whole patch breaks at once.** A single cell could only break while a body segment lay on it, so you could never be on it yourself. With whole patches, standing on cracked ice near the snake is a real risk, and it looks more dramatic.
3. **You don't crack ice yourself.** Only a long snake is heavy enough.
4. **Phase 2's rule stays:** a cut that leaves the front under 3 beats the whole snake, including the piece behind.
5. **Holes block the snake's pathfinding too,** so it doesn't wander into the same hole twice.

**Watch for in a playtest**
- **Sliding:** grip is `BALANCE.ice.grip` (1.6 per second). Check it's fun-slippery, not frustrating.
- **Finishing it off:** after a few breaks you may face 3 or 4 short snakes. Check it's fun, not a chore, to finish them with the machete (it drops often here).

**Files (Level 8)**
- New: `src/sim/ice.ts`, `src/levels/level08.ts`, `src/render/ice.ts`, `tests/ice.test.ts` (8 tests).
- Changed:
  - sim: `tiles.ts` (Ice, CrackedIce, Hole), `layouts.ts` (lake), `player.ts` (sliding, cleats), `world.ts` (holes, cracking, falling in), `cut.ts` (a whole snake falling through), `goals.ts` (`defeatAll`), `types.ts`
  - rules and data: `items/index.ts` (ice cleats), `balance.ts`, `levels/types.ts`, `levels/guide.ts`, `levels/index.ts`
  - render: `itemModels.ts`, `drops.ts`, `viewmodel.ts` (strap-on motion), `terrains.ts`, `renderer.ts`
  - UI and audio: `hud.ts` (buff chips, ice on the minimap), `panels.ts` ("Fell in"), `palette.ts`, `icons.ts`, `audio.ts`, `game.ts`, `style.css`, `index.html`
  - tests and docs: `e2e/smoke.spec.ts`, `CLAUDE.md`, `GAME_DESIGN.md`, `TASKS.md`, `CREDITS.md`

---

## Level 9: Broken house

**What you get**
- A roofless, ruined house on a 48x48 map: seeded rooms behind full-height walls, under a late-dusk sky.
  - **Look:** faded wallpaper (uneven, broken wall tops) and dark plank floors.
  - **In the rooms:** wardrobes, standing lamps glowing warm (real lights at high quality) and piles of fallen stone (the snake smashes through them, as in the Ruins).
- **Doors:**
  - Most doorways hold a pair of doors; 55% start shut.
  - **Opening and shutting:** stand within about a cell and a half and press **R**. A prompt under the crosshair says "R Open door" or "R Shut door". Both leaves move together. A door won't shut on you or on a snake lying in the doorway.
  - **Shut door:** it's a wall for you and for stones. The snake bashes at one (thuds, the door jolts) and breaks it in 3 s; then it lies on the floor, open for good.
  - **Slam:** shutting a door is loud.
- **Closets:** step into a wardrobe to hide. The snake loses you unless it's right beside you.
- **Noise:**
  - **Footsteps:** walking carries 6 cells, sprinting 10, standing still (or hiding) none.
  - **A slammed door:** 11 cells, for a moment.
  - **Noise meter:** a meter under XP shows yours (only on this level's Ambush snake).
  - **Light feet** is now offered: footsteps carry 40% less far. All eight perks are in.
- **Ambush snake:**
  - It lies in wait near something you'll come for (a pellet, an item, a doorway, the key).
  - It strikes when your noise reaches it or you come within 2 cells, with a hiss from its side.
  - It gives up when you're 12 cells away or hide.
  - A firecracker's bang is noise it can't resist.
- **Goal:** find the key (on a side table, in the room farthest from the start by walking), then leave by the front door on the north wall.
- **New controls:** R (also listed on the title card). New CC0 assets: `decrepit_wallpaper`, `dark_wooden_planks`, `qwantani_dusk_1_puresky`.

**Decisions I made**
1. **Smaller map: 48x48,** not 64. The design says tight rooms; at 64 the house felt like a warehouse.
2. **R opens and shuts doors.** E was taken (turn right), and F uses items. Doors don't open by bumping into them, so opening one is a choice. You can also slam one in the snake's face.
3. **Door reach of 3 units (a cell and a half).** I first had 2.4, and found in the staged screenshots that you had to be nearly touching the door.
4. **The snake plans through doors** and bashes a shut one rather than going around (it "breaks doors after a few seconds").
5. **A Noise meter** makes the sound mechanic readable. It appears only on Ambush levels.
6. **No new item on this level** (the design gives it none): firecrackers and smoke bombs drop most, since luring and hiding are its tools.

**Watch for in a playtest**
- **Noise ranges:** are 6 cells walking and 10 sprinting fair inside tight rooms? The knobs are `BALANCE.noise`.
- **Closets:** check they don't make it too safe (the snake still finds you from beside you).
- **Lamp lights:** check they don't cost too much on high quality (6 point lights).

**Files (Level 9)**
- New: `src/sim/house.ts`, `src/levels/level09.ts`, `src/render/house.ts`, `tests/house.test.ts` (9 tests).
- Changed:
  - sim: `tiles.ts` (HouseWall, Door, Closet, `DoorState`), `layouts.ts` (house), `snake.ts` (bashing doors), `world.ts` (doors, the house update), `probe.ts`, `player.ts`, `perks.ts` (Light feet offered), `types.ts`
  - rules and data: `ai/index.ts` (ambush), `balance.ts`, `levels/types.ts`, `levels/guide.ts`, `levels/index.ts`
  - render and input: `layoutViews.ts` (key), `terrains.ts`, `renderer.ts`, `input.ts` (R)
  - UI and audio: `hud.ts` (prompt, Noise meter, house on the minimap), `palette.ts`, `audio.ts`, `game.ts`, `style.css`, `index.html`
  - tests and docs: `tests/bot.test.ts`, `e2e/smoke.spec.ts`, `CLAUDE.md`, `GAME_DESIGN.md`, `TASKS.md`, `CREDITS.md`

---

## Level 10: Dark cave (the Mother Snake)

**What you get**
- **The cave:** a 64x64 cave grown by a seeded cellular automaton (always one connected space), under a rock ceiling. It's pitch dark: lumpy rock walls, stalactites, and patches of faintly glowing green fungus to find your way by.
- **The flashlight:**
  - **The beam:** always on, from just below your eye, with shadows at high quality.
  - **Battery:** it starts with 90 s, kept when you lose a life. A Light meter shows the charge; under 10 s the beam stutters and the meter blinks; at 0 it's dark.
  - **Batteries** drop often here (+60 s each). The hand reaches down to the flashlight and comes back empty.
- **Seeing and hearing her:** snakes show only in your beam, but their eyes glow green with a halo, so in the dark you see a pair of eyes coming. Snake steps are panned to their side here (on every level now) and carry 30 cells instead of 16. Your hands dim with the light.
- **Minimap:** only the cave within 10 cells of you, never the snakes.
- **The Mother Snake (30 long):** you can beat her.
  - **Phase 1:** she hunts like Predict. Every piece cut off her withers; nothing grows a new head.
  - **Phase 2:** at half her length (15) she splits in two, with a roar.
  - **Phase 3:** when one is left, it coils. It circles you on a ring a little ahead of its head and pulls the ring in from 5 cells to 1 while it's close. You have to cut your way out, or stun it with the slingshot; a stunned snake stops tightening.
  - **Shortcut:** a cut that leaves her too short to split goes straight to phase 3.
  - **The guide:** it tells you where you are: "The Mother: length 30", "Split in two: 7 and 7", "It coils: cut your way out".
- **Winning:** beat the last one and the run ends with "Campaign complete". Machetes drop often here.
- **No new assets:** the cave reuses the Riverside rocks and the Plains rock.

**Decisions I made**
1. **The flashlight is always on** (no toggle) and is drawn as light, not as a model in your hand. Your hands already hold your item, and a second held object would crowd every rig.
2. **Pieces withering** in phase 1 keeps "split in two at half" a single, readable event. Normal machete splits would have given you several snakes long before that.
3. **Coil pauses while stunned:** the slingshot is your answer to the ring, besides the machete.
4. **The battery lives with the level,** not the player, so losing a life doesn't also leave you in the dark.
5. **Eye halos:** the eyes alone were too small to see across the cave in the dark (I checked in screenshots), so each glows with a soft halo.

**Watch for in a playtest**
- **The core boss question:** is the coil fair? Its knobs are `coilStartRadius`, `coilTighten` and `coilMinRadius` in `BALANCE.ai`.
- **Battery budget:** 90 s plus drops. Check you're tense but not stuck in the dark too often.
- **Darkness on your monitor:** too dark or not dark enough? The knobs are `hemi` and `fog` in the `cave` look, and the flashlight strength in `renderer.ts`.

**Files (Level 10)**
- New: `src/sim/boss.ts`, `src/levels/level10.ts`, `src/render/cave.ts`, `tests/boss.test.ts` (9 tests).
- Changed:
  - sim: `tiles.ts` (CaveWall), `layouts.ts` (cave), `cut.ts` (boss pieces wither; `splitInHalf` exported), `world.ts`, `types.ts`
  - rules and data: `ai/index.ts` (coil), `items/index.ts` (battery), `balance.ts`, `levels/types.ts`, `levels/guide.ts`, `levels/index.ts`
  - render: `renderer.ts` (no-sky looks, the flashlight), `terrains.ts`, `snakeHead.ts` / `snakes.ts` (glowing eyes), `viewmodel.ts` (insert motion, dimmable hands), `itemModels.ts`, `drops.ts`
  - UI and audio: `hud.ts` (Light meter, dark minimap), `icons.ts`, `audio.ts` (panned steps, roar, battery), `game.ts`, `style.css`, `index.html`
  - tests and docs: `e2e/smoke.spec.ts`, `CLAUDE.md`, `GAME_DESIGN.md`, `TASKS.md`, `CREDITS.md`

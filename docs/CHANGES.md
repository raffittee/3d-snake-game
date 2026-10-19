# Changes for review

Written for Rafi. Newest first: Phase 4 (multiplayer), then Phase 3 (Levels 4 to 10). **Decisions I made** lists the calls I would normally have asked you about, each with what I picked and why, so you can overturn them.

# Phase 4: Multiplayer

You picked Colyseus, the whole of Phase 4 except the deploy, and no perks in matches. Nothing is committed.

## At a glance

- **Built:**
  - the game server (`server/`), running the same sim as the browser, authoritative at 30 Hz
  - private rooms with 6-character codes, a lobby with the host's settings, and rounds with a scoreboard
  - client prediction and smoothing
  - all five modes: Classic, Snake and Players, Infection, Hot Egg, Escape Race
  - voice chat, peer to peer, with push-to-talk or open mic, per-player volume and mute, host mute and proximity voice
  - other players drawn as people with name tags
- **Tests:**
  - **Unit tests:** 264, of which 36 are new.
    - The modes, for every terrain at every map size.
    - Determinism.
    - Snapshots round-tripping.
    - The real server with 4 bot clients playing a Classic round. Every client's copy matched the server's (no desync).
  - **Two-browser e2e test:** host, join by link, voice connects, a Classic round to the scoreboard, then Snake and Players, then the host leaves. The 14 single-player e2e tests still pass.
- **Single player is unchanged:** the same 228 tests pass. The network code only downloads when you click "Play with friends".
- **Hosting:** you chose your PC plus a free Cloudflare tunnel. `npm run host` starts the server and the tunnel and prints the link to send. Tested: two bots played through a real tunnel at a full 20 snapshots a second.
- **Still yours:**
  - **Merge to `main`:** the GitHub Pages build (which your friends open) only has multiplayer once this branch is merged.
  - **The gate:** 4 friends finish a Classic match with no desync.
  - **Committing:** nothing is committed.

## How to host a game night

1. `npm run host`, and keep that window open. The first run downloads Cloudflare's `cloudflared` into `node_modules`.
2. It prints a link like `https://raffittee.github.io/3d-snake-game/?server=some-words.trycloudflare.com`. Open it yourself, click "Play with friends" and create a room.
3. In the lobby, "Copy invite link" gives a link with the server and the room code. Send it to your friends.
4. Ctrl+C stops it. The tunnel address changes every time, so send a fresh link each session.

## How to try it on one machine

1. Run `npm run server` in one terminal and `npm run dev` in another.
2. Open `http://localhost:5173` in two browser windows (or two browsers). Click "Play with friends", create a room in one, and join with the code in the other. A link with `?room=CODE` fills the code in for you.
3. Voice needs a microphone and works on localhost. Over the network it needs HTTPS, which comes with the deploy.
4. To test on your LAN, open `http://<your-PC-IP>:5173` on the other machine. The page looks for the server on the same host at port 2567. Voice there needs HTTPS.

## What you get

- **Rooms:**
  - "Play with friends" on the title card leads to your name (remembered), Create a room, or a code to Join.
  - Codes are 6 characters, never 0/O or 1/I/L.
  - Up to 4 players. A started match is locked.
  - If the host leaves, the match ends for everyone.
- **Lobby:**
  - The host sets terrain (all 10), mode, map size (64/80/96), snake speed (slow/normal/fast/ramping), rounds (1/3/5), round length (3/5/8 min), items (on/rare/off) and proximity voice.
  - Everyone else sees the settings greyed out.
  - Each player has a volume slider and Mute. The host also has "Mute for all".
  - Start stays disabled until the mode has enough players.
- **A match:**
  - The terrain's level is scaled to the map size; players start side by side.
  - A clock and the objective show at the top, the players (talking, down, out, lives) on the left, and messages mid-screen (downed, caught, out).
  - Between rounds a scoreboard shows for 6 s; a round win is a point.
  - After the last round you go back to the lobby.
  - Esc opens a pause card, but the match goes on; voice and per-player volume are there.
- **Steering a snake** (Snake and Players, Infection):
  - Third person, behind its head.
  - Mouse or A/D turns it, with momentum, and it never reverses.
  - Click dashes, Space burrows, R whips its tail.
- **Others:**
  - Other players appear as an explorer figure in their color (jacket, backpack, cap), walking, lying down when downed, and cradling the egg in Hot Egg.
  - Name tags show above them and above player-steered snakes.
  - The minimap shows them as dots and shows the nest.
- **Network:**
  - **Your movement:** predicted on your machine and corrected by the server.
  - **Other players:** drawn about 0.1 s behind, smoothed.
  - **Snakes:** glide between snapshots exactly as the sim draws them.
  - **Bandwidth:** about 1 KB per snapshot, 20 per second (about 20 KB/s per player).
- **Architecture:** ADR `docs/decisions/0004-multiplayer-architecture.md`.

## Decisions I made

1. **Colyseus packages:** `@colyseus/core` plus the ws transport, not the `colyseus` meta package.
   - The meta package pulls in auth, monitor, playground and Redis.
   - `npm audit` still reports one advisory: `elliptic`, through `@colyseus/auth`, which `@colyseus/core` pulls in as an optional peer. It is only used for OAuth logins, which we never load.
2. **Lobby vs match:** the lobby uses Colyseus synced state; the match uses our own compact snapshots. The sim is plain objects, and Colyseus's state sync wants its own schema classes.
3. **`world.player` now means "the local player":** it is the first player in single player, and your own player on a client. Game rules take the player they act on, and a lint rule enforces it.
4. **Classic:**
   - The nest is at the start: 6 pellets plus 3 per player.
   - You carry up to 3 pellets and lose them if you go down.
   - A downed player nobody helps gets up at their start after 10 s; a teammate beside them for 2 s gets them up where they lie.
   - Running out of time loses.
   - Aggro lasts 8 s after a stone or cut.
   - Per extra player the snake starts 2 segments longer and may grow 4 longer.
5. **Snake and Players:** runners have 3 lives, and a catch grows the snake by 3. Abilities: dash 1.6 s every 9 s, burrow 4 s every 16 s, tail whip every 7 s (knocks runners back and empties their stamina).
6. **Infection:** a caught player rises as a 6-long snake after 1.5 s.
7. **Hot Egg:** the snake shoves anyone but the carrier aside (no catch). A pass cannot go straight back (2 s). At the clock, the carrier is out and the rest win.
8. **Escape Race:** caught means 3 s down, then back to your start. Firecrackers drop about 6 times as often as anything else.
9. **Every match arena:** the snake is beatable, there is no boss and no relics, the minimap is on, and no perks or XP.
10. **Reconnect:** a dropped player has 12 s to come back, the host included. After that the player is out of the round, or the match ends if it was the host.
11. **Push-to-talk is V by default;** your choice of push-to-talk or open mic is remembered. Open mic only sends while it hears you (a simple voice gate).
12. **Player colors** are new tokens `--player-0..3`: muted ochre, teal, slate and olive. Never red, which stays danger-only.
13. **The round clock** turns the accent color in its last 30 s, not red.

## What to watch in a playtest

- **Latency over the internet:** everything so far ran on one machine. Watch whether being caught feels fair at your friends' pings.
- **Voice through home routers:** there is no relay server, by design, so a strict firewall can block a player's voice.
- **Balance:** nest size, revive range and time, the snake's abilities, Hot Egg pass range. All numbers are in `BALANCE.multiplayer` and `BALANCE.pilot`.
- **The software-WebGL tests ran at 1 to 3 fps:** fine for logic, says nothing about smoothness on real hardware.

## Not done

- **An always-on server:** there isn't one. The game is only joinable while you run `npm run host`, and Cloudflare gives quick tunnels no uptime guarantee.
- **Touch controls in multiplayer:** you can only move and look.

---

# Phase 3: Campaign (Levels 4 to 10)

Written while you were away. Since committed (six commits on `feat/phase3-campaign`). `npm run check` and the e2e smoke tests passed at the end of each level below.

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

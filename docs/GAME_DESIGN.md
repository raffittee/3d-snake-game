# Snake Hunt Game Design

> Exported from the design doc on 2026-10-16 (author: Rafi). This file is the source of truth in the repo. Numbers are starting values to tune by playtesting. Task-level work lives in [BACKLOG.md](BACKLOG.md).

## Overview
Snake Hunt is a first-person 3D reversal of Snake: you are the food, and a growing snake hunts you. This plan takes it from the one-arena prototype to a 10-level single-player campaign and friends-only multiplayer.

### Design pillars
- **Prey first.** Attacks buy space (stun, slow, cut). Defeating the snake is a special event in specific levels, never the default.
- **The snake's length is its HP.** Cutting segments shrinks it. Under 3 segments, it is defeated.
- **One rule per terrain.** Each terrain changes how you play, not just how it looks.
- **Every level ends.** Each level has its own goal, shown only in a small guide in the corner of the screen.

### Decisions made
| Topic | Decision |
|---|---|
| Defeating the snake | Differs per level. Each level's goal and snake rule show in a corner guide, with no long tutorials. Only Levels 8 and 10 can be won by beating the snake |
| Mid-body machete cut | Splits the snake into two snakes |
| Single player progression | Every run starts fresh at Level 1; perks and items reset |
| Look | Modernized terrains that keep a hint of the classic Nokia look |
| Multiplayer | Friends-only room codes, desktop first; phones later |
| Final level | Dark cave |
| Dropped ideas | Rice terraces terrain, thorn trap item |
| Lives | 3 lives per level, refilled between levels. A death respawns you at the level's start point and the snake stays as it was |
| Items between levels | Clear at the end of each level |
| Snake and water | The snake swims too, slower than it moves on land |
| Host leaves a room | The match ends for everyone |
| Snake player's view | Third person, just above the head |
| Voice chat | Push-to-talk and open mic both available; proximity voice is a host option; no relay server for now |


## Look and feel
Terrains get a modern renderer (real lighting, fog, soft shadows, particles, weather) but keep four Nokia traits so the game still reads as Snake Hunt:
- **A limited palette per terrain:** 4 to 5 tones, the way the original LCD had 2.
- **Dark outlines** on every block and snake segment, as in the prototype.
- **A blocky snake:** square segments on a visible grid, never a smooth realistic snake.
- **A Nokia HUD:** LCD-green plates, pixel fonts (Silkscreen, VT323) and the top-down minimap, the same on every terrain.
A **Classic LCD** toggle in settings renders any terrain in the original two-tone green.
| Terrain | Palette direction |
|---|---|
| Plains | Spring green, pale sky, soft yellow |
| Tall grass | Olive, straw, dusk orange |
| Ruins | Sandstone, moss, grey stone |
| Riverside | River teal, grass green, wood brown |
| Corn maze | Corn gold, dry green, late-afternoon amber |
| Swamp | Murky green, mud brown, firefly yellow |
| Sandstorm desert | Ochre, dust beige, white haze |
| Frozen lake | Ice blue, snow white, slate |
| Broken house | Dark wood, faded wallpaper, warm lamp light |
| Dark cave | Near-black, with one sickly green in the flashlight beam |


## Map and terrains
Maps grow from 28×28 cells to 64×64 for single player and up to 96×96 for 4-player matches, still 2 world units per cell.
- **Bigger maps make the snake easier to escape,** so each level sets the snake's speed and count to fit its map size.
- **Landmarks on every terrain** (a tower, a big tree, a windmill, a wrecked truck) so you can find your way in first person.
- **The minimap stays by default.** The maze and the cave limit it.
- **Pathfinding still fits:** a grid search over 4,096 to 9,216 cells per snake step is cheap.
Ten terrains, one per campaign level. All of them are open in multiplayer from the start.
| Terrain | Its rule for you | What the snake does there |
|---|---|---|
| Plains | Open sightlines; the tutorial ground | Chases in the open |
| Tall grass | You can't see into the grass; you watch it move and listen | Hides in the grass |
| Ruins | Low walls you can jump; crumbling walls | Smashes through crumbling walls |
| Riverside | Deep water needs the swim ring; bridges are chokepoints | Swims through deep water, slower than on land |
| Corn maze | Walls block sight; the minimap is off until you find a map | Knows the maze |
| Swamp | Mud slows you; logs and lily pads are firm paths | Moves at full speed through mud |
| Sandstorm desert | Visibility drops in waves | Burrows and resurfaces somewhere else |
| Frozen lake | You slide on ice; some ice is cracked | Cracked ice breaks under a long snake and cuts off what falls in |
| Broken house | Tight rooms, doors you can shut, hiding spots | Breaks doors after a few seconds |
| Dark cave | Flashlight with a battery; the snake shows only in the beam | Eyes glow; you track it by sound |


## Player
The player keeps the prototype's walk, sprint and stamina, and gains a jump, an inventory and perks. Numbers below are starting values to tune by playtesting.

### Movement
- **Jump:** clears low walls, logs and the snake's tapered tail (its last 4 segments). The rest of the body is too tall to jump. Each jump costs a little stamina, so you can't hop forever.
- **Swim:** only with the swim ring, slower than walking.
- **Hide:** in the broken house, step into a closet or under a bed. The snake loses track of you unless it is right next to you.

### Items
You start with 2 inventory slots. Every item shows a draining ring and spoils when the ring empties. Higher levels drop better tiers (white, then blue, then gold) but drop them less often.
| Item | Effect | Uses | First drops in |
|---|---|---|---|
| Slingshot | Hit the head to stun it for 2 s | 3 shots | Level 1 |
| Machete | Cut the segment next to you. Near the tail it shrinks the snake; mid-body it splits it in two | 5 cuts | Level 2 |
| Swim ring | Lets you swim deep water | 30 s in water | Level 3 |
| Firecracker | Decoy: the snake chases the noise for 5 s | 1 | Level 4 |
| Smoke bomb | The snake loses track and wanders for 6 s | 1 | Level 5 |
| Energy drink | Full stamina, no drain for 5 s | 1 | Level 6 |
| Mongoose (rare) | A companion that harasses the snake for 10 s | 1 | Level 7 |
| Ice cleats | No sliding on ice for 20 s | 1 | Level 8 |
| Flashlight battery | 60 s more light | 1 | Level 10 |


### Perks
Pellets give XP. Each level-up offers 3 perks and you pick 1. Perks reset with every new run.
- **Big lungs:** 30% more stamina
- **Light feet:** quieter footsteps, so ambushing snakes notice you later
- **Packrat:** a third inventory slot
- **Preserver:** items spoil 50% slower
- **Spring legs:** higher jump, enough to clear one more tail segment
- **Keen ears:** an on-screen arrow points to the snake when it is close
- **Sharp edge:** each machete cut removes 2 segments
- **Second wind:** once per level, a catch knocks you back instead of ending the run

## The snake
The snake's length is its HP, and it gets smarter, not just faster, as the levels climb.

### Length, cuts and splits
- **Growth:** +1 segment every few seconds, and +2 when it eats a pellet before you do.
- **Stun:** a slingshot hit freezes the head. The body still blocks you.
- **Tail cut:** removes segments from the end.
- **Mid-body cut:** the back half grows a head and becomes a second snake with its own AI. A piece shorter than 4 segments withers away instead.
- **Growth split (Level 3):** past a set length the snake splits by itself. Its body flashes for 2 s first, so the split reads as an event.
- **Defeat:** under 3 segments it is defeated, but only on levels that allow it. Elsewhere it has a floor (for example 5 segments), and at the floor the machete bounces off.

### AI behaviors
Each level uses one or two of these. The corner guide names the one in play.
- **Chase:** shortest path to where you are now (the prototype's behavior).
- **Stalk:** chases but stays inside cover such as tall grass.
- **Predict:** heads for where you will be about 1 s from now.
- **Flank:** two snakes; one chases while the other cuts off your escape route.
- **Burrow:** dives under sand and resurfaces near your predicted spot.
- **Ambush:** waits near items, doors and pellets, and strikes when you get close.
- **Coil:** circles you and tightens a ring you must cut your way out of. Boss only.

## Single player campaign
A run plays 10 levels in order, one per terrain, and ends in the dark cave. Your Levels 1 to 3 keep their order; Levels 4 to 10 are new.

### Run structure
- **Start fresh:** every run begins at Level 1 with no perks.
- **Between levels:** a short perk pick. Perks carry through the run; items do not, since they spoil.
- **Death:** costs one of your 3 lives for the level. You respawn at the level's start point and the snake stays as it was. Lives refill to 3 between levels, and losing all 3 in one level ends the run.
- **Corner guide:** a small panel shows the level's goal, your progress (for example "Relics 2/5") and the snake rule ("Can't be defeated" or "Shrink it under 3 to win"). No other tutorial text.
- **Map size:** 48×48 for Levels 1 and 2, 64×64 from Level 3 on.

### Levels
| Level | Terrain | New for you | Snake | Can it be defeated? | Goal |
|---|---|---|---|---|---|
| 1 Classic | Plains | The basics; slingshot | Chase at normal speed | No | Survive 90 s or collect 10 pellets |
| 2 | Ruins | Jumping low walls; machete | Faster; Predict | No | Find 5 relics, then reach the gate |
| 3 | Riverside | Swim ring; pellets give a speed boost that fades | Splits by itself past a set length | No | Cross the river to the far dock |
| 4 | Tall grass | Watching and listening; firecracker | Stalk | No | Collect 8 pellets hidden in the grass |
| 5 | Corn maze | Minimap off until you find the map; smoke bomb | Two snakes; Flank | No | Find the map, then the exit |
| 6 | Swamp | Mud slows you; energy drink | Predict, full speed in mud | No | Light 4 signal lanterns, then board the boat |
| 7 | Sandstorm desert | Visibility waves; mongoose | Burrow | No | Collect 3 water flasks and reach the oasis |
| 8 | Frozen lake | Sliding, cracked ice; ice cleats | Long and fast; Chase | Yes, by luring it onto cracked ice | Shrink it under 3 segments |
| 9 | Broken house | Doors, closets, noise | Ambush; breaks doors | No | Find the key and leave through the front door |
| 10 Boss | Dark cave | Flashlight with battery | Mother Snake in 3 phases | Yes | Shrink it under 3 segments |


### Level notes
- **Level 2:** color item tiers clearly. Fewer, better drops only work if you can tell a gold drop is worth the risk.
- **Level 3:** the speed boost stacks per pellet and fades after about 8 s, so late Level 3 doesn't get easy.
- **Level 8:** the first level where you can win by beating the snake. Cracked ice shows as darker tiles, and segments that fall through are gone.
- **Level 10 phases:** 1) the Mother Snake hunts you in the dark; 2) at half length it splits in two; 3) the last snake switches to Coil and you have to cut your way out of the ring.

## Multiplayer
Multiplayer is 2 to 4 friends in a private room, desktop first, with five modes.

### Rooms
1. The host creates a room and gets a 6-character code.
1. Friends enter the code and land in the lobby.
1. The host picks the settings and starts the match. If the host leaves, the match ends for everyone.
| Setting | Options |
|---|---|
| Terrain | Any of the 10 |
| Mode | Classic, Snake and Players, Infection, Hot Egg, Escape Race |
| Map size | 64×64, 80×80, 96×96 |
| Snake speed | Slow, Normal, Fast, Ramping |
| Rounds | 1, 3 or 5 |
| Round length | 3, 5 or 8 min |
| Items | On, Off or Rare |


### Voice chat
Every room has built-in voice, so friends can talk while they run.
- **Join:** the browser asks for mic permission when you enter the lobby. Declining still lets you play and hear others.
- **Talk modes:** push-to-talk (default, key V) or open mic with voice detection. Each player chooses their own.
- **Mute and volume:** a mute button and a volume slider per player in the lobby and in the pause menu. A mic icon on the HUD shows who is talking.
- **Proximity voice (host option):** voices get quieter with distance and muffle behind walls, so being far from your friends has a cost. Off by default, which means everyone hears everyone.
- **Snake and Players mode:** the snake player's mic works the same, so they can taunt. Hot Egg and Infection can add a "whisper" radius later.
- **Rules for friends rooms:** the host can mute anyone, and room codes keep strangers out. Voice is never recorded or stored.
Built on WebRTC. With 4 players each browser sends audio directly to the other 3 (6 connections in total), so the server only relays the setup messages and the audio stays off it. Chat works while the game is paused. There is no relay server for now, so a few players behind strict firewalls may not connect.

### Classic (co-op)
- Everyone runs from the AI snake. Its length scales with the number of players.
- **Downed, not dead:** a caught player is down for 10 s, and a teammate can revive them by standing next to them.
- **Aggro:** the snake chases the nearest player, but switches to whoever hit it last, so players can protect each other.
- **Win:** carry pellets to the central nest until it's full, or shrink the snake under 3 segments. Lose if everyone is down at once.

### Snake and Players
- One player is the snake, seen in third person from just above the head. It can't reverse and it has momentum.
- Snake abilities on cooldowns: dash, burrow (resurface elsewhere) and tail whip.
- The snake grows by catching players. Players win by surviving the timer or shrinking it.
- The snake role rotates every round.

### Infection
- One AI snake to start. Every player it catches becomes a playable snake.
- The last human standing wins. If the timer runs out with humans alive, the humans win.

### Hot Egg
- One player carries the snake's egg, and the snake only hunts the carrier.
- Touch another player to pass the egg. A carrier who gets caught is out. The last player left wins.

### Escape Race
- Everyone races to one exit while the snake hunts the whole field.
- Firecrackers can be thrown at rivals to draw the snake onto them. First out wins.

## Tech and build milestones
Build single player on a new modular base first. Multiplayer comes last because it needs a game server.

### Tech
- **Project:** Vite with ES modules and a current three.js, replacing the single r128 file.
- **Rules apart from rendering:** the snake already moves on a fixed grid tick. Keep every game rule in that tick, so AI behaviors and networking share one code path.
- **Levels as data:** each level is a config with terrain, map size, snake behaviors, item drops, goal and corner guide text. A new level is mostly a new file.
- **Terrain on the grid:** water, mud, ice, cracked ice, grass and doors are tile types that both the snake's pathfinding and your movement read.
- **Physics:** the prototype's circle-versus-box collision plus simple gravity covers jumping. Add a physics library only if that stops being enough.
- **Multiplayer:** a Node game server runs the snake; Colyseus fits well since it has rooms built in. Clients send inputs; the server sends snake turns each tick and player positions about 20 times a second, smoothed on screen.
- **Hosting:** the client stays a static site. The game server needs a small always-on host such as Fly.io, Railway or a VPS. Browsers only allow the mic over HTTPS, so the client and the server must both use HTTPS.

### Milestones
[embed] 
Each phase ends at a playable gate, so you can stop and playtest before building the next layer.

## Open questions
1. **Defeating the snake:** I read "make each level distinct" as "each level has its own rule for whether the snake can be beaten, shown in the corner guide." That makes Levels 8 and 10 the only ones you can win by beating it. Is that right? - Yes
1. **Lives:** one death ends a 10-level run and sends you back to Level 1. Keep it that strict, or give 3 lives per run? - 3 lives per run
1. **Items between levels:** they clear at the end of each level, since they spoil anyway. Or should a few carry over? - they clear at every end of each level
1. **Snake in water:** at the riverside it can't cross deep water, which makes the swim ring an escape route. Or should it swim slowly too? - it should swim slowly
1. **Level order:** tall grass comes after the riverside. Does the difficulty order feel right? - yes since hidden snake can be tricky
1. **Host leaves:** end the match for everyone, or pass host to another player? - ends the match
1. **Snake player's view:** third person above the head, or first person through the snake's eyes? - third person
1. **Voice default:** push-to-talk or open mic? I set push-to-talk, since open mics pick up keyboard noise during a chase. - both
1. **Proximity voice:** should it be an option the host turns on, or the only mode? - option
1. **Players behind a strict firewall:** WebRTC occasionally can't connect directly. Add a relay server for those players (costs a little), or accept that voice fails for a few? - no, remain free for now
1. **Losing a life:** restart the level from the beginning, or respawn near where you were caught? I'd respawn at the level's start point with the snake kept as it was, so a death doesn't wipe your progress. - respawn at the level's start point with the snake kept as it was
1. **Lives refill:** is it 3 lives for the whole 10-level run, or do lives refill between levels? 3 lives between levels

## Build roadmap

Single player ships in three phases, then multiplayer. Each phase ends at a gate: do not start the next phase until the gate is met.

| Phase | Scope | Gate |
|---|---|---|
| 1. Foundation (start here) | Vite project, ES modules, current three.js; game rules on fixed ticks, apart from rendering; levels as config files; 48x48 map; jumping; corner guide; Level 1 (Plains) rebuilt on the new base | Level 1 plays end to end with its goal and corner guide |
| 2. Core loop | Inventory with spoil rings; slingshot, machete, swim ring; item tiers; length as HP, tail cuts, mid-body splits; XP and perk picks; Levels 2 (Ruins) and 3 (Riverside) | A run through Levels 1 to 3 feels fair in playtests |
| 3. Campaign | Terrains for Levels 4 to 10, terrain palettes and the Classic LCD toggle; Stalk, Flank, Burrow, Ambush and Coil behaviors; the remaining items; Levels 4 to 10, ending with the Mother Snake | A full 10-level run can be beaten and the boss feels fair |
| 4. Multiplayer | Game server with private rooms, 6-character codes and voice chat; Classic first, then Snake and Players, Infection, Hot Egg and Escape Race; deployed as a static client plus a small always-on server | 4 friends finish a Classic match with no desync |
| Later: Phones | Touch controls and a phone layout | n/a |

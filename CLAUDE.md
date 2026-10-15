# Snake Hunt

A first-person 3D reversal of Snake. You are the food. A snake that grows and keeps speeding up hunts you across a walled grid arena. Survive, collect pellets for points.

Owner: Rafi. The plan for where this is going is in `docs/GAME_DESIGN.md` (10-level campaign, items and perks, friends-only multiplayer with voice). Work items are in `docs/BACKLOG.md`. Read both before starting a feature.

## Commands

- `npm install`, then `npm run dev` (Vite, http://localhost:5173).
- `npm run check`: typecheck + lint + unit tests. Run it before saying a task is done. It must pass.
- `npm run build`: typecheck + production build into `dist/` (deploys to any static host; `base` is `./`).
- `npm run test:e2e`: Playwright smoke test against a production build. First time: `npx playwright install chromium`. Software WebGL flags are already set. Set `CHROMIUM_PATH` to use a specific browser binary.
- Debug URL switches: `?debug=1` (debug panel, exposes `window.__snake`), `?seed=N` (same arena every run), `?god=1` (the snake cannot kill you).

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
    world.ts            createWorld, updateWorld, updateDemo, score, danger
    snake.ts            snake steps, growth, segment positions
    player.ts           walk/sprint/stamina
    collision.ts        circle vs box overlap and push-out
    pathfinding.ts      grid BFS + open-room measure
    pillars.ts pellets.ts grid.ts math.ts rng.ts types.ts
  ai/index.ts           BEHAVIORS registry (chase for now)
  levels/               LevelConfig types, level01, LEVELS list
  render/               three.js: GameRenderer, palette (reads CSS variables)
  ui/                   DOM: panels, HUD, minimap, title-card snake
  input.ts              keyboard, pointer lock, touch -> PlayerInput
  audio.ts              WebAudio square-wave beeps (no audio files)
  storage.ts            best score (localStorage, guarded)
  game.ts               state machine (menu/play/paused/dead) and frame loop
  main.ts               entry, URL switches, WebGL-failure message
  style.css             design tokens + layout
tests/                  Vitest unit tests (sim only, incl. a headless bot run)
e2e/                    Playwright smoke test
docs/                   GAME_DESIGN.md, BACKLOG.md, decisions/ (ADRs)
prototype/              the original single-file version, kept for reference
```

## Look

Nokia-style green LCD: flat shading, thin dark edge lines on every block, blocky grid-aligned snake. Design tokens are CSS variables at the top of `src/style.css`; `render/palette.ts` reads them so the 3D scene matches the HUD. Fonts (Silkscreen, VT323) come from `@fontsource` packages, so the game works offline. The 3D view renders at reduced resolution and is upscaled with `image-rendering: pixelated`. Keep the one red accent (`--alert`) for danger only (snake tongue/head on the minimap, tired stamina bar, danger vignette). Per the design doc, future terrains get their own 4 to 5 tone palettes and keep the Nokia traits; a "Classic LCD" toggle renders any terrain in the original two-tone green.

three.js note: the prototype used r128, which did no color-space conversion. `render/renderer.ts` sets `THREE.ColorManagement.enabled = false` and multiplies light intensities by pi to keep the same flat look on the current version. When terrains get real lighting, revisit that deliberately instead of piecemeal.

## Game rules (current, Level 1)

- Arena 28x28 cells, 2 world units per cell. Perimeter walls plus random pillars (one cell, never adjacent, never in the snake lane or the player spawn).
- Player: walk/sprint speed, stamina that drains while sprinting, "tired" state until it recovers. See `BALANCE.player`.
- Snake: moves cell by cell using BFS toward the player's cell; step interval shrinks over time; grows on a timer and by eating pellets; length is capped. Its body blocks you. If it has no path to you it heads for the roomiest neighbor (random tie-break); if completely stuck it sheds tail cells.
- Death: head overlap = "Eaten". Squeezed between the body and a wall/pillar = "Crushed". 1.1 s death camera, then the game-over card.
- Score = floor(elapsed * 10) + pellets * 100. Best score in `localStorage` under `snake-hunt-best`.
- Controls: WASD/arrows move, mouse looks (click to lock the pointer), Shift sprints, Q/E turn, Esc/P pause, M mute, Enter starts. Touch: left side stick, right side look, RUN and pause buttons. Pausing releases the pointer lock (otherwise the Resume button cannot be clicked).

## Known gaps

- Level 1's design goal (survive 90 s or collect 10 pellets) and the corner guide are not built yet; Level 1 is still endless.
- Touch controls and the game on a real phone have not been tested. Desktop first (design decision).
- BFS can target a cell that holds the snake's own body, so the snake can very rarely overlap itself. The headless bot test only checks the body stays one connected chain. Log it in the backlog if it shows up in play.
- Balance numbers are guesses. Playtest and tune `balance.ts`.
- Pillar generation does not verify the arena stays connected (the no-adjacent rule makes blocking unlikely).
- The minimap shows the whole snake and every pellet. Intentional for now; some levels will turn it off.
- No automated check of visuals; the e2e smoke test only proves the game loads, runs, pauses, and ends a run without console errors.

## Working with Claude in this repo

- Work one backlog item at a time. Say which item, ask for a plan first on anything touching more than 3 files.
- Write the failing test first for sim changes; use `?seed=` and `?god=1` to reproduce things by hand.
- After any rendering or UI change, run `npm run test:e2e` and look at the screenshots in `test-results/` (the test writes `title.png`, `play.png`, `dead.png`).
- Record meaningful architecture decisions as a short file in `docs/decisions/`.
- Do not commit unless asked. Keep commits small, one backlog item each.

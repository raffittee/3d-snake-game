# 0002: Grounded realistic look instead of the Nokia LCD look

Date: 2026-10-16. Status: accepted, built 2026-10-17 (Phase 1 item 7).

## Context

The prototype and the port use a Nokia-style look: a two-tone green LCD palette, flat shading, dark edge lines on every block, a snake made of stacked cubes, a pixelated low-res render and a pixel-font HUD. The design doc kept those as "Nokia traits" for every terrain.

Rafi does not want the game to look blocky or like a kids' game (Roblox, Nokia). The machete (Phase 2) cuts the snake shorter or splits it in two, and that only feels satisfying if the snake looks like a real body that can be cut, not a row of boxes.

## Decision

- **Style: grounded realistic.** Natural lighting with soft shadows, fog, an HDRI sky, and PBR materials (textured ground, stone walls, rock pillars). Serious tone, nothing cartoony. Full-resolution rendering with antialiasing; no pixelated upscale, scanlines or edge outlines.
- **The snake is one smooth, scaled body** that slithers: a tube along a curve through the segment positions, with scales, a pale belly and a darker back pattern, and a sculpted head with jaws, slit-pupil eyes and a forked tongue.
- **Cuts show some blood.** A cut end shows a red flesh cross-section, a short blood spray plays, and the severed piece twitches before it withers. No lingering gore. Built with the machete in Phase 2; the snake body renderer must support cut ends from the start.
- **HUD and menus are modernized** to match: a clean modern HUD with translucent dark panels and a non-pixel font. Red stays reserved for danger (and blood).
- **Assets:** free CC0 textures and HDRIs (Poly Haven, ambientCG) may be committed to the repo, with sources listed in a credits file. Snake skin is generated in code, since CC0 snake-skin textures are scarce. The game must still work offline.
- **Per-terrain look is data:** each terrain's textures, light, fog and palette sit in a render-side registry keyed by `LevelConfig.terrain`. Terrains keep a limited 4 to 5 tone palette as a mood guide.
- The Classic LCD toggle is dropped.

## Consequences

- **Game rules do not change.** The snake still moves cell by cell, and its collision stays one box per segment (`BALANCE.snake.bodyHalfWidth`). The smooth body is drawn inside those boxes so what you see still matches what blocks you. `src/sim` is untouched by this work.
- The renderer drops the r128 compatibility hacks (`ColorManagement.enabled = false`, light intensities times pi) and uses sRGB output with tone mapping.
- Heavier rendering (shadows, PBR, HDRI) needs a low-quality fallback for weak machines and for the software-WebGL e2e test.
- The bundle grows by a few MB of textures.
- Cost: more render code (tube body, procedural scales, sculpted head) than boxes. Accepted, because the cut feel is a core part of the game.

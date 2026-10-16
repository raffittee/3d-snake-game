# 0003: The jumpable tail is a rule, not a physics accident

Date: 2026-10-16. Status: accepted.

## Context

The design says a jump clears the snake's last 4 segments but not the rest of the body. The tail used to taper only in width, so those segments stood 1.0 to 1.56 units tall next to a 1.7-unit body. A jump that clears 1.56 but not 1.7 has an airborne window of a few hundredths of a second over the tail, which is not playable, and the difference would be invisible on screen.

## Decision

- Collision is height-aware: a snake segment only blocks or crushes the player while their feet (`player.y`) are below its top. Pillars and walls stay full height.
- `segmentHeight(i, length)` in `src/sim/snake.ts` gives each segment's height. The last `BALANCE.snake.jumpableTail` (4) segments are `tailHeight` (0.7) tall; the rest of the body is `bodyHeight` (2.2, raised from 1.7 on 2026-10-17 so the snake towers over your 1.6 eye height); the head is `headHeight` (2.3).
- The jump apex (`jumpSpeed^2 / (2 * gravity)`, about 1.2) sits clearly between the two. A unit test pins that relationship so tuning one number cannot silently break it.
- The renderer draws the body inside each segment's height: the body stands about 1.9, it tapers over 1.5 segments, and the last 4 segments stay below 0.7, so the low tail looks jumpable and the rest does not.

## Consequences

- Clearing the tail has a forgiving window (about 0.37 s above 0.7 units), and you can see what is jumpable.
- Low walls and logs in later terrains can reuse the same check (an obstacle with a height).
- The player cannot stand on top of anything; landing on a segment pushes you off sideways. Fine for now.

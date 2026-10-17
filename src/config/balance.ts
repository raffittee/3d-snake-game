/**
 * Every tuning number lives here, so balance changes never mean hunting through game code.
 * Units: seconds, world units (one grid cell = `cellSize` units), radians.
 * These are starting values carried over from the prototype; tune them by playing.
 */
export const BALANCE = {
  /** World units per grid cell. */
  cellSize: 2,

  player: {
    /** Collision radius. */
    radius: 0.35,
    /** Camera height above the floor. */
    eyeHeight: 1.6,
    walkSpeed: 5.2,
    sprintSpeed: 9.2,
    /** Stamina is 0..1. Drain and regen are per second. */
    staminaDrain: 0.34,
    staminaRegen: 0.2,
    /** After hitting 0 you cannot sprint until stamina passes this. */
    tiredRecoverAt: 0.35,
    /** Jump: launch speed (units/s) and gravity (units/s^2) give an apex of about 1.2 units. */
    jumpSpeed: 8.5,
    gravity: 30,
    /** Stamina spent per jump, so you cannot hop forever. */
    jumpStaminaCost: 0.12,
    /** Q/E turn speed in radians per second. */
    keyTurnRate: 2.4,
    maxPitch: 1.35,
    /** Movement input below this length counts as standing still. */
    moveDeadzone: 0.1,
  },

  snake: {
    startLength: 5,
    /** Seconds per grid step at the start, falling by `rampPerSecond` down to `minInterval`. */
    baseInterval: 0.42,
    minInterval: 0.17,
    rampPerSecond: 0.0021,
    /** One extra segment every N seconds. */
    growEverySeconds: 4,
    maxLength: 110,
    /** Extra segments gained when the snake eats a pellet. */
    pelletGrowth: 2,
    /** Half-width of a body segment's collision box. */
    bodyHalfWidth: 0.85,
    /** Half-width of the head's collision box. */
    headHalfWidth: 0.98,
    /** Height of the head; nothing can jump it. */
    headHeight: 2.3,
    /** Height of a body segment: taller than your eyes (1.6), so the body is a wall you cannot see over. */
    bodyHeight: 2.2,
    /** The last N segments are low enough to jump over (the rest stand `bodyHeight` tall). */
    jumpableTail: 4,
    tailHeight: 0.7,
    /** The last N segments shrink toward the tail. */
    taperSegments: 5,
    taperMinScale: 0.6,
    /** A piece cut off behind the cut needs this many segments to become a snake; shorter ones wither. */
    minSplitLength: 4,
    /** A split-off snake is dazed this long while it grows its head. */
    splitDazeSeconds: 1,
    /** Seconds a severed piece twitches and withers before it is gone. */
    severedLife: 1.6,
    /** Growth split: the body flashes this long before the snake splits by itself. */
    splitWarnSeconds: 2,
    /** Being squeezed deeper than this into a body segment (after push-out) is a crush. */
    crushOverlap: 0.22,
  },

  pellets: {
    count: 3,
    points: 100,
    /** Pellets never spawn closer than this to the player. */
    minSpawnDistance: 8,
    pickupRadius: 1.0,
    /** Delay before a replacement appears after the snake eats one. */
    respawnAfterSnakeEats: 3,
    /** Delay between respawn attempts while below `count`. */
    respawnRetry: 2.5,
  },

  items: {
    /** Inventory slots (a perk can add one later). */
    slots: 2,
    /** Walk within this distance of a drop to pick it up. */
    pickupRadius: 1.1,
    /** Drops never land closer than this to the player. */
    minSpawnDistance: 10,
    /** Rarer tiers: more uses and slower spoiling, multiplied by this. */
    tierScale: { white: 1, blue: 1.5, gold: 2 },
    /** Base uses and seconds until it spoils (white tier). */
    defs: {
      slingshot: {
        uses: 3,
        spoilSeconds: 40,
        /** A head hit freezes the snake this long. A second hit resets it, it never stacks. */
        stunSeconds: 2,
        /** The stone: launch speed, a light gravity so it drops a little, lifetime, size. */
        stoneSpeed: 40,
        stoneGravity: 6,
        stoneLife: 1.5,
        stoneRadius: 0.12,
      },
      machete: {
        uses: 5,
        spoilSeconds: 45,
        /** A swing cuts the snake segment under the crosshair within this distance from your eye. */
        reach: 2.6,
      },
    },
  },

  lives: {
    /** Lives per level. They refill when a new level starts. */
    perLevel: 3,
    /** Seconds after a respawn during which the snake cannot catch or crush you. */
    respawnGrace: 2,
  },

  score: {
    pointsPerSecond: 10,
  },

  /** Screen-edge warning: starts at `range` units of gap and reaches full strength at 1. */
  danger: {
    gapOffset: 1.3,
    range: 13,
  },
} as const;

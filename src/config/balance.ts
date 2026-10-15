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
    /** The last N segments shrink toward the tail. */
    taperSegments: 5,
    taperMinScale: 0.6,
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

  score: {
    pointsPerSecond: 10,
  },

  /** Screen-edge warning: starts at `range` units of gap and reaches full strength at 1. */
  danger: {
    gapOffset: 1.3,
    range: 13,
  },
} as const;

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
      /** Swim ring: `uses` are seconds in deep water; they drain only while you swim. */
      swimRing: { uses: 30, spoilSeconds: 60 },
      firecracker: {
        uses: 1,
        spoilSeconds: 40,
        /** Thrown along the crosshair, tipped up by `throwLift` radians: about 11 cells on flat ground. */
        throwSpeed: 20,
        throwLift: 0.35,
        gravity: 14,
        radius: 0.15,
        /** Seconds on the ground before it bangs. */
        fuseSeconds: 1,
        /** Every snake whose head is within this distance (units, 20 cells) heads for the bang this long. */
        earshot: 40,
        lureSeconds: 5,
      },
      battery: {
        uses: 1,
        spoilSeconds: 60,
        /** Seconds of flashlight it adds. */
        seconds: 60,
      },
      iceCleats: {
        uses: 1,
        spoilSeconds: 45,
        /** Strapped on: no sliding on ice for this long. */
        seconds: 20,
      },
      mongoose: {
        uses: 1,
        spoilSeconds: 50,
        /** It fights for this long, running at `speed` (units/s); within `reach` of a head it pins that snake. */
        seconds: 10,
        speed: 11,
        reach: 1.4,
      },
      energyDrink: {
        uses: 1,
        spoilSeconds: 45,
        /** Drinking it fills your stamina, and sprinting costs none for this long. */
        seconds: 5,
      },
      smokeBomb: {
        uses: 1,
        spoilSeconds: 40,
        /** Every snake loses track of you and wanders off this long, toward a spot at least `wanderMinCells` from you. */
        seconds: 6,
        wanderMinCells: 12,
      },
    },
  },

  xp: {
    /** XP per pellet you collect. */
    perPellet: 1,
    /** XP for the first level-up, then this much more for each one after. */
    firstLevelUp: 3,
    stepPerLevel: 2,
    /** Perks offered per level-up (pick 1). */
    perksOffered: 3,
  },

  perks: {
    /** Big lungs: 30% more stamina. */
    bigLungs: 1.3,
    /** Preserver: items spoil at this rate. */
    preserverSpoilRate: 0.5,
    /** Spring legs: launch speed multiplier (the apex goes from ~1.2 to ~1.4). */
    springLegsJump: 1.08,
    /** Second wind: how far a catch knocks you back, and the grace after. */
    secondWindKnockback: 5,
    secondWindGrace: 1.5,
    /** Keen ears: the arrow shows when the nearest snake head is within this gap. */
    keenEarsRange: 16,
    /** Light feet: your footsteps carry this much as far. */
    lightFeetNoise: 0.6,
  },

  arena: {
    /** Pillars and landmarks stop stones below this height (the rocks stand up to 3.4). */
    solidHeight: 3.4,
    /** Ruins: a low wall you jump (below the ~1.2 jump apex); a crumbling wall you cannot. */
    lowWallHeight: 0.7,
    crumbleHeight: 2.4,
    /** Corn maze walls: well over your eyes (1.6), so they block sight. */
    cornHeight: 2.6,
    /** Walk within this distance of a relic to pick it up, or of the open gate to leave. */
    relicPickupRadius: 1.1,
    gateRadius: 1.4,
  },

  river: {
    /** The narrowest the river gets, in cells. */
    minWidth: 5,
    /** Swimming speed as a share of walking speed (no sprint, no jump in water). */
    swimSpeed: 0.55,
    /** The snake steps this much slower while its head is in water. */
    snakeSwimSlow: 1.6,
    /** Eye height while swimming (the water is around your chest). */
    swimEyeDrop: 0.85,
  },

  cave: {
    /** The cave's rock ceiling (and its walls' height). */
    ceiling: 5,
    /** Flashlight battery at the start of the cave (seconds); it drains while you are in it. */
    batteryStart: 90,
    /** Under this many seconds the beam starts to flicker. */
    batteryLow: 10,
    /** The minimap only shows the cave this close to you (cells), and never the snakes. */
    mapRadius: 10,
    /** Mother Snake: it splits in two once its length is down to this share of where it started. */
    splitShare: 0.5,
  },

  house: {
    /** House walls: well over your head, nothing gets over them. */
    wallHeight: 3.2,
    /** A shut door stands this long against a snake bashing it. */
    doorBreakSeconds: 3,
    /** You can open or shut a door this close (units from you to the door cell's centre: about a cell and a half). */
    doorReach: 3,
    /** Share of doorways that start shut. */
    shutShare: 0.55,
  },

  /** How far (cells) the noise you make carries: an Ambush snake that close hears you. */
  noise: {
    walk: 6,
    sprint: 10,
    /** Slamming a door shut: this loud, for this long. */
    slam: 11,
    slamSeconds: 0.6,
  },

  ice: {
    /** On ice your speed only eases toward what you ask for, at this rate per second: you slide. */
    grip: 1.6,
    /**
     * A snake at least `breakLength` long cracks the cracked ice its head crosses; the ice gives way
     * once the segment `breakAt` behind the head is on it (whatever the speed), so the snake keeps a
     * front `breakAt` long and loses what is behind (it becomes its own snake, or withers).
     */
    breakLength: 7,
    breakAt: 5,
  },

  swamp: {
    /** Walking and sprinting speed in mud, as a share of normal (the snake is not slowed). */
    mudSpeed: 0.5,
    /** How far your eye sinks while you stand in mud. */
    mudEyeDrop: 0.22,
  },

  ai: {
    /** Predict: aim for where the player will be this many seconds from now. */
    predictSeconds: 1,
    /** Stalk: it breaks cover and charges once you are this close (cells), and gives up past `stalkReleaseCells`. */
    stalkStrikeCells: 4,
    stalkReleaseCells: 7,
    /** Flank: the second snake heads this many cells ahead of you (or to your far side from the chaser)... */
    flankAheadCells: 6,
    /** ...until it is this close to you, then it simply chases. */
    flankCloseCells: 3,
    /**
     * Burrow: after `burrowCooldown` s on the surface, with you at least `burrowMinGapCells` away, it
     * dives; underground it steps this much faster (interval x `burrowSpeed`) toward where you will be
     * in `burrowLeadSeconds`; within `burrowSurfaceCells` of you (or after `burrowMaxSeconds`) the sand
     * heaves for `burrowRiseSeconds` before it breaks the surface.
     */
    burrowCooldown: 9,
    burrowMinGapCells: 7,
    burrowSpeed: 0.7,
    burrowLeadSeconds: 1.5,
    burrowSurfaceCells: 4,
    burrowMaxSeconds: 10,
    burrowRiseSeconds: 1,
    /**
     * Ambush: it lurks near pellets, items, doors and the key until it hears you (your noise reaches
     * it) or sees you right beside it (`ambushSightCells`), then strikes until you are
     * `ambushReleaseCells` away or hidden in a closet. It picks a lurk spot at least `ambushSpotFromYou` from you.
     */
    ambushSightCells: 2,
    ambushReleaseCells: 12,
    ambushSpotFromYou: 6,
    /**
     * Coil (boss only): it circles you on a ring `coilStartRadius` cells out, a little ahead of its
     * head each step, and pulls the ring in by `coilTighten` cells a second down to `coilMinRadius`
     * (where its body squeezes you). Farther than `coilReach` it first closes in like Chase.
     */
    coilStartRadius: 5,
    coilMinRadius: 1,
    coilTighten: 0.35,
    coilLead: 0.9,
    coilReach: 9,
  },

  grass: {
    /** Grass height (shoulder-high: under your eyes at 1.6, over the snake as it is drawn inside it). */
    height: 1.4,
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

  /** Multiplayer matches (sim/match.ts, sim/modes.ts). First guesses: playtest with friends. */
  multiplayer: {
    maxPlayers: 4,
    /** Seconds a snake keeps hunting whoever last hit it (Classic's aggro). */
    aggroSeconds: 8,
    /** Players start this many cells apart beside the start point. */
    spawnSpacing: 2,
    /** Per player beyond the first: the snake starts longer and may grow longer (Classic). */
    lengthPerPlayer: 2,
    maxLengthPerPlayer: 4,
    /** Host's Snake speed setting: the snake's step time is multiplied by this (smaller is faster). Ramping eases from `rampFrom` to `rampTo` over the round. */
    speed: { slow: 1.25, normal: 1, fast: 0.8, rampFrom: 1.25, rampTo: 0.7 },
    /** Host's Items setting: how often drops fall (0 = never). */
    itemRate: { on: 1, rare: 0.4, off: 0 },
    /** Seconds between rounds (the scoreboard shows meanwhile; the server waits this long). */
    roundBreak: 6,
    classic: {
      /** Seconds a caught player lies downed before getting up on their own at the start point. */
      downSeconds: 10,
      /** A teammate standing within `reviveRange` (world units) for `reviveSeconds` gets them up where they lie. */
      reviveRange: 2.2,
      reviveSeconds: 2,
      /** Pellets you can carry at once, how near the nest (world units) to drop them in, and pellets to fill it. */
      carryMax: 3,
      nestRadius: 3,
      nestBase: 6,
      nestPerPlayer: 3,
    },
    /** Snake and Players: each runner's lives; a catch grows the snake. */
    snakeAndPlayers: { lives: 3, growOnCatch: 3 },
    /** Infection: a caught player becomes a snake this long, after `infectDelay` seconds. */
    infection: { snakeLength: 6, infectDelay: 1.5 },
    /** Hot Egg: passing it needs players within `passRange` (world units); then nobody can pass it back for `passCooldown` s. */
    hotEgg: { passRange: 1.6, passCooldown: 2, knockback: 4, grace: 1.5 },
    /** Escape Race: caught, you are down this long, then back at the start. Drops lean to firecrackers. */
    escapeRace: { downSeconds: 3, firecrackerWeight: 6 },
  },

  /** A snake steered by a player (Snake and Players, Infection; sim/pilot.ts). */
  pilot: {
    /** How fast its heading follows where its pilot points (rad/s): its momentum. */
    turnRate: 3.2,
    /** Key turning (A/D or Q/E), rad/s. */
    keyTurnRate: 2.6,
    /** Dash (click / F): step time times `dashSpeed` for `dashSeconds`, then `dashCooldown` s. */
    dashSpeed: 0.55,
    dashSeconds: 1.6,
    dashCooldown: 9,
    /** Burrow (Space): under the ground for `burrowSeconds` (it cannot touch or be touched), then `burrowCooldown` s. */
    burrowSeconds: 4,
    burrowCooldown: 16,
    /** Tail whip (R): runners within `whipRange` (world units) of its last segments are knocked back and winded. */
    whipRange: 3,
    whipSegments: 5,
    whipKnockback: 4,
    whipCooldown: 7,
  },
} as const;

import type { TerrainId } from '../levels/types';

/** A Poly Haven style PBR set: `<name>_diff_1k.jpg`, `<name>_nor_gl_1k.jpg`, `<name>_arm_1k.jpg`. */
export interface PbrSet {
  name: string;
  /** World units covered by one texture tile. */
  tile: number;
}

export interface CornColors {
  stalk: string;
  leaf: string;
  dry: string;
  ear: string;
  core?: string;
}

/**
 * How a terrain looks. Pure data, read by the renderer; game rules never see it.
 * `palette` is the 4 to 5 tone mood guide from the design doc (used for tints and particles).
 */
export interface TerrainLook {
  sky: string;
  /** Sky brightness as lighting (image-based light) and as background. */
  envIntensity: number;
  backgroundIntensity: number;
  ground: PbrSet;
  /** Multiplies the ground texture, to pull it toward the terrain's palette. */
  groundTint: string;
  wall: PbrSet;
  pillar: PbrSet;
  /** Multiplies the pillar texture (some stone textures read too pale on a standing rock). */
  pillarTint?: string;
  /** Ruins: low walls and crumbling walls (fall back to `wall`). Riverside: bridge and dock planks. */
  lowWall?: PbrSet;
  crumble?: PbrSet;
  planks?: PbrSet;
  /** Riverside: the river bank (rocks along the water). */
  bank?: PbrSet;
  /** Tall grass: blade color at the root and at the tip. */
  grass?: { base: string; tip: string };
  /** Corn maze: the plants' colors, and the dark leafy core inside each wall cell. */
  corn?: CornColors;
  /** Swamp: the murky water over the mud (its color) and the mud bed under it; bark for the fallen logs. */
  mud?: { surface: string; bed: PbrSet };
  bark?: PbrSet;
  /** Desert: the sandstorm's dust color, and how close the fog closes in at full strength. */
  storm?: { color: string; near: number; far: number };
  /** Dark cave: no sky (a rock ceiling instead) and no image-based light; `sky` is ignored. */
  noSky?: boolean;
  fog: { color: string; near: number; far: number };
  sun: { color: string; intensity: number; direction: [number, number, number] };
  /** Fill light used when quality is low (no image-based lighting). */
  hemi: { sky: string; ground: string; intensity: number };
  exposure: number;
  palette: string[];
}

export const TERRAIN_LOOKS: Partial<Record<TerrainId, TerrainLook>> = {
  plains: {
    sky: 'kloofendal_48d_partly_cloudy_puresky_1k.hdr',
    envIntensity: 0.9,
    backgroundIntensity: 1,
    ground: { name: 'leafy_grass', tile: 4 },
    groundTint: '#c4d89a',
    wall: { name: 'castle_wall_slates', tile: 3 },
    pillar: { name: 'mossy_rock', tile: 2.5 },
    fog: { color: '#b9c7cf', near: 35, far: 150 },
    sun: { color: '#fff1dc', intensity: 2.6, direction: [0.55, 0.75, 0.35] },
    hemi: { sky: '#cfdcea', ground: '#4f5a3a', intensity: 1.6 },
    exposure: 1,
    // Spring green, pale sky, soft yellow, stone grey, deep shade.
    palette: ['#6f8f3a', '#cfdcea', '#e8d98a', '#8b8f86', '#26301f'],
  },
};

TERRAIN_LOOKS.ruins = {
  sky: 'kloofendal_43d_clear_puresky_1k.hdr',
  envIntensity: 1,
  backgroundIntensity: 1,
  ground: { name: 'grassy_cobblestone', tile: 3 },
  groundTint: '#e6dcc4',
  wall: { name: 'mossy_sandstone', tile: 3 },
  pillar: { name: 'old_stone_wall', tile: 2.5 },
  pillarTint: '#8f8a80',
  lowWall: { name: 'mossy_sandstone', tile: 2.5 },
  crumble: { name: 'old_stone_wall', tile: 2.5 },
  fog: { color: '#d8cdb6', near: 30, far: 140 },
  sun: { color: '#ffe6c2', intensity: 3, direction: [0.35, 0.7, 0.6] },
  hemi: { sky: '#e7dccb', ground: '#6b5a3e', intensity: 1.6 },
  exposure: 1,
  // Sandstone, moss, grey stone, warm sky, deep shade.
  palette: ['#c9a873', '#6f7d3c', '#8b8a84', '#e7dccb', '#2c2619'],
};

TERRAIN_LOOKS.riverside = {
  sky: 'kloofendal_38d_partly_cloudy_puresky_1k.hdr',
  envIntensity: 1,
  backgroundIntensity: 1,
  ground: { name: 'grass_ground', tile: 4 },
  groundTint: '#d6e3b8',
  wall: { name: 'castle_wall_slates', tile: 3 },
  pillar: { name: 'mossy_rock', tile: 2.5 },
  planks: { name: 'brown_planks_04', tile: 2 },
  bank: { name: 'river_small_rocks', tile: 2 },
  fog: { color: '#bcccd0', near: 40, far: 170 },
  sun: { color: '#fff3e0', intensity: 2.7, direction: [0.5, 0.7, 0.45] },
  hemi: { sky: '#cfe0e8', ground: '#4c5a3c', intensity: 1.6 },
  exposure: 1,
  // River teal, grass green, wood brown, pale sky, deep shade.
  palette: ['#2f6f7a', '#6f8f3a', '#7a5634', '#cfe0e8', '#1f2a24'],
};

TERRAIN_LOOKS['tall-grass'] = {
  sky: 'qwantani_dusk_2_puresky_1k.hdr',
  envIntensity: 0.85,
  backgroundIntensity: 0.9,
  ground: { name: 'withered_grass', tile: 3 },
  groundTint: '#9c9a74',
  wall: { name: 'castle_wall_slates', tile: 3 },
  pillar: { name: 'mossy_rock', tile: 2.5 },
  pillarTint: '#a39a86',
  grass: { base: '#2e3a17', tip: '#b39a55' },
  // Low dusk sun from the west: long shadows, warm haze.
  fog: { color: '#c9a27a', near: 28, far: 135 },
  sun: { color: '#ffb873', intensity: 2.4, direction: [-0.75, 0.32, 0.45] },
  hemi: { sky: '#e8b98a', ground: '#4a4424', intensity: 1.5 },
  exposure: 1,
  // Olive, straw, dusk orange, dusk sky, deep shade.
  palette: ['#6b6a2e', '#cdb36a', '#d9874a', '#e8b98a', '#2a2516'],
};

TERRAIN_LOOKS['corn-maze'] = {
  sky: 'lonely_road_afternoon_puresky_1k.hdr',
  envIntensity: 0.95,
  backgroundIntensity: 1,
  ground: { name: 'farm_soil', tile: 3 },
  groundTint: '#c9b48e',
  // A plank fence around the field (and the exit's frame).
  wall: { name: 'brown_planks_04', tile: 2 },
  pillar: { name: 'mossy_rock', tile: 2.5 },
  corn: { stalk: '#5c6a2a', leaf: '#6e7f30', dry: '#cfae5e', ear: '#dcbf6c', core: '#2a3318' },
  // Late afternoon: a warm, fairly low sun, amber haze.
  fog: { color: '#d8bf94', near: 26, far: 130 },
  sun: { color: '#ffd29a', intensity: 2.7, direction: [0.6, 0.45, -0.55] },
  hemi: { sky: '#f0d9b0', ground: '#4f4a26', intensity: 1.5 },
  exposure: 1,
  // Corn gold, dry green, late-afternoon amber, pale sky, deep shade.
  palette: ['#d6b04f', '#6e7f30', '#e0a24a', '#f0d9b0', '#26220f'],
};

TERRAIN_LOOKS.swamp = {
  sky: 'kloofendal_28d_misty_puresky_1k.hdr',
  envIntensity: 0.7,
  backgroundIntensity: 0.7,
  ground: { name: 'brown_mud_leaves_01', tile: 3 },
  groundTint: '#a3a68a',
  // A palisade of old logs around the swamp.
  wall: { name: 'bark_willow', tile: 2 },
  pillar: { name: 'mossy_rock', tile: 2.5 },
  pillarTint: '#8e957f',
  planks: { name: 'brown_planks_04', tile: 2 },
  bark: { name: 'bark_willow', tile: 1.5 },
  mud: { surface: '#2c3523', bed: { name: 'farm_soil', tile: 3 } },
  grass: { base: '#2a3318', tip: '#7f8a4a' },
  // Misty evening: thick green-grey haze, a weak low sun.
  fog: { color: '#7c8873', near: 16, far: 95 },
  sun: { color: '#e9d9b2', intensity: 1.5, direction: [0.35, 0.45, 0.6] },
  hemi: { sky: '#a8b49a', ground: '#38371f', intensity: 1.35 },
  exposure: 0.95,
  // Murky green, mud brown, firefly yellow, mist, deep shade.
  palette: ['#4b5a35', '#5a4630', '#e8d84a', '#a8b49a', '#1c2016'],
};

TERRAIN_LOOKS.desert = {
  sky: 'syferfontein_0d_clear_puresky_1k.hdr',
  envIntensity: 1,
  backgroundIntensity: 1,
  ground: { name: 'sand_02', tile: 4 },
  groundTint: '#e3cfa4',
  wall: { name: 'sandstone_cracks', tile: 3 },
  pillar: { name: 'sandstone_cracks', tile: 2.5 },
  pillarTint: '#c9a882',
  grass: { base: '#5d6a2c', tip: '#b8a75a' },
  // A hot, hazy midday; the storm turns it to a wall of ochre dust.
  fog: { color: '#e2cfae', near: 40, far: 190 },
  storm: { color: '#c9a271', near: 1, far: 13 },
  sun: { color: '#fff1d6', intensity: 3.3, direction: [0.25, 0.85, 0.35] },
  hemi: { sky: '#f1e3c6', ground: '#8a6b42', intensity: 1.7 },
  exposure: 1,
  // Ochre, dust beige, white haze, oasis green, deep shade.
  palette: ['#c48b45', '#e2cfae', '#f5efe4', '#5d7a3a', '#3a2a18'],
};

TERRAIN_LOOKS['frozen-lake'] = {
  sky: 'snow_field_puresky_1k.hdr',
  envIntensity: 1,
  backgroundIntensity: 0.95,
  ground: { name: 'snow_02', tile: 4 },
  groundTint: '#f2f6fa',
  wall: { name: 'castle_wall_slates', tile: 3 },
  pillar: { name: 'mossy_rock', tile: 2.5 },
  pillarTint: '#b9c4cc',
  // Cold, bright and grey: a pale sun low in a white sky.
  fog: { color: '#d6e0e8', near: 34, far: 160 },
  sun: { color: '#f4f8ff', intensity: 2.4, direction: [-0.4, 0.5, 0.55] },
  hemi: { sky: '#e3ecf4', ground: '#7d8a96', intensity: 1.6 },
  exposure: 1,
  // Ice blue, snow white, slate, cold sky, deep water.
  palette: ['#9fc3d8', '#f2f6fa', '#5d6873', '#d6e0e8', '#13202a'],
};

TERRAIN_LOOKS['broken-house'] = {
  sky: 'qwantani_dusk_1_puresky_1k.hdr',
  envIntensity: 0.55,
  backgroundIntensity: 0.6,
  ground: { name: 'dark_wooden_planks', tile: 3 },
  groundTint: '#b49c84',
  // Faded wallpaper inside; the rubble is old stone.
  wall: { name: 'decrepit_wallpaper', tile: 2.5 },
  crumble: { name: 'old_stone_wall', tile: 2.5 },
  pillar: { name: 'old_stone_wall', tile: 2.5 },
  planks: { name: 'dark_wooden_planks', tile: 2 },
  // Late dusk through the broken roof: a dim blue sky, warm lamps inside.
  fog: { color: '#3a3644', near: 22, far: 90 },
  sun: { color: '#c9b6ff', intensity: 0.9, direction: [0.4, 0.55, -0.6] },
  hemi: { sky: '#6f6a8a', ground: '#3a2c22', intensity: 1.1 },
  exposure: 0.9,
  // Dark wood, faded wallpaper, warm lamp light, dusk blue, deep shade.
  palette: ['#4a3426', '#a99a7c', '#ffbe6b', '#6f6a8a', '#16120f'],
};

TERRAIN_LOOKS.cave = {
  sky: '',
  noSky: true,
  envIntensity: 0,
  backgroundIntensity: 0,
  ground: { name: 'river_small_rocks', tile: 2.5 },
  groundTint: '#5c5a55',
  wall: { name: 'mossy_rock', tile: 3 },
  pillar: { name: 'mossy_rock', tile: 2.5 },
  pillarTint: '#6a6a62',
  // Near-black: only your flashlight (and a faint bounce) lights it.
  fog: { color: '#020303', near: 6, far: 42 },
  sun: { color: '#000000', intensity: 0, direction: [0.2, 1, 0.2] },
  hemi: { sky: '#1a2420', ground: '#050505', intensity: 0.25 },
  exposure: 1,
  // Near-black, wet rock grey, sickly green, the beam's warm white, deep black.
  palette: ['#0b0c0c', '#3d3f3c', '#7fd16a', '#fff1d8', '#000000'],
};

/** Falls back to plains until each terrain has its own look. */
export function terrainLook(id: TerrainId): TerrainLook {
  const look = TERRAIN_LOOKS[id] ?? TERRAIN_LOOKS.plains;
  if (!look) throw new Error('The plains look is missing');
  return look;
}

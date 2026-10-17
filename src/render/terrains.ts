import type { TerrainId } from '../levels/types';

/** A Poly Haven style PBR set: `<name>_diff_1k.jpg`, `<name>_nor_gl_1k.jpg`, `<name>_arm_1k.jpg`. */
export interface PbrSet {
  name: string;
  /** World units covered by one texture tile. */
  tile: number;
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

/** Falls back to plains until each terrain has its own look. */
export function terrainLook(id: TerrainId): TerrainLook {
  const look = TERRAIN_LOOKS[id] ?? TERRAIN_LOOKS.plains;
  if (!look) throw new Error('The plains look is missing');
  return look;
}

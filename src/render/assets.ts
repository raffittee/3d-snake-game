import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { PbrSet } from './terrains';

/** Files in public/assets are copied into the build as-is; BASE_URL keeps the relative base working. */
export const assetUrl = (path: string): string => `${import.meta.env.BASE_URL}assets/${path}`;

export interface PbrMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  /** AO in red, roughness in green, metalness in blue. */
  arm: THREE.Texture;
}

const textureLoader = new THREE.TextureLoader();
const pbrCache = new Map<string, PbrMaps>();

function load(url: string, color: boolean): THREE.Texture {
  const t = textureLoader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Load (once) a PBR texture set. Textures appear when loaded; until then materials show their base color. */
export function pbrMaps(set: PbrSet): PbrMaps {
  const cached = pbrCache.get(set.name);
  if (cached) return cached;
  const dir = `textures/${set.name}/${set.name}`;
  const maps = {
    map: load(assetUrl(`${dir}_diff_1k.jpg`), true),
    normalMap: load(assetUrl(`${dir}_nor_gl_1k.jpg`), false),
    arm: load(assetUrl(`${dir}_arm_1k.jpg`), false),
  };
  pbrCache.set(set.name, maps);
  return maps;
}

/**
 * A standard material from a PBR set. UVs are expected in world units divided by the tile size
 * (see `worldUvBox` in arena.ts), so textures keep their real-world scale on any size of mesh.
 */
export function pbrMaterial(set: PbrSet, tint = '#ffffff'): THREE.MeshStandardMaterial {
  const m = pbrMaps(set);
  return new THREE.MeshStandardMaterial({
    color: tint,
    map: m.map,
    normalMap: m.normalMap,
    aoMap: m.arm,
    roughnessMap: m.arm,
    metalnessMap: m.arm,
    roughness: 1,
    metalness: 1,
  });
}

let hdrPromise: Promise<THREE.DataTexture> | null = null;
let hdrName = '';

export function loadSky(name: string): Promise<THREE.DataTexture> {
  if (hdrPromise && hdrName === name) return hdrPromise;
  hdrName = name;
  hdrPromise = new HDRLoader().loadAsync(assetUrl(`hdri/${name}`)).then((t) => {
    t.mapping = THREE.EquirectangularReflectionMapping;
    return t;
  });
  return hdrPromise;
}

const modelCache = new Map<string, Promise<THREE.Group>>();

/** Load (once) a glTF model from public/assets/models/<name>/<name>_1k.gltf. Returns a fresh clone each call. */
export function loadModel(name: string): Promise<THREE.Group> {
  let p = modelCache.get(name);
  if (!p) {
    p = new GLTFLoader().loadAsync(assetUrl(`models/${name}/${name}_1k.gltf`)).then((g) => g.scene);
    modelCache.set(name, p);
  }
  return p.then((scene) => scene.clone(true));
}

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Landmark } from '../levels/types';
import { cellToWorld } from '../sim/grid';
import type { World } from '../sim/types';
import { loadModel, pbrMaterial } from './assets';
import type { TerrainLook } from './terrains';

const WALL_HEIGHT = 3;
const WALL_THICKNESS = 1.2;
/** Rock pillars stay inside their one-cell collision box (2 x 2 units) and stand this tall. */
const PILLAR_HEIGHT = 3.4;
const PILLAR_RADIUS = 0.95;
/** The quiver tree model is about 1.47 m tall; this makes it a ~10-unit landmark. */
const TREE_SCALE = 7;

/** A box whose UVs are in world units / tile, so a texture keeps its real-world size on any box. */
function worldUvBox(w: number, h: number, d: number, tile: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // BoxGeometry faces in order: +x, -x, +y, -y, +z, -z; 4 vertices each.
  const faces: Array<[number, number]> = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * faces[f][0]) / tile, (uv.getY(i) * faces[f][1]) / tile);
    }
  }
  return g;
}

/** Small deterministic hash noise, so each pillar keeps its shape for a given cell. Cosmetic only. */
function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(Math.floor(x) * 374761393 + Math.floor(y) * 668265263 + Math.floor(z) * 2147483647 + seed * 1274126177, 1);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const u = s(fx), v = s(fy), w = s(fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

/**
 * A weathered standing stone: a rounded box (so it keeps flat-ish faces and edges) pushed around by
 * two octaves of noise, cut flat at the ground. Different for every cell.
 */
function rockGeometry(seed: number, tile: number): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(1, 1, 1, 7, 10, 7);
  box.deleteAttribute('normal');
  box.deleteAttribute('uv');
  // Weld the duplicated face-edge vertices so the displaced surface has no cracks or hard seams.
  const g = mergeVertices(box);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const sphere = new THREE.Vector3();
  const lean = (hash3(seed, 1, 0, 9) - 0.5) * 0.25;
  const depth = 0.7 + hash3(seed, 2, 0, 9) * 0.25;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Halfway between a box and a sphere: rounded edges, broad faces.
    sphere.copy(v).normalize().multiplyScalar(0.5 * Math.SQRT2);
    v.lerp(sphere, 0.45);
    const n1 = valueNoise(v.x * 2.2 + 5, v.y * 2.2, v.z * 2.2, seed) - 0.5;
    const n2 = valueNoise(v.x * 6.5, v.y * 6.5, v.z * 6.5, seed + 1) - 0.5;
    const r = 1 + n1 * 0.55 + n2 * 0.16;
    // Taper toward the top, lean a little, and make it slab-like rather than round.
    const up = v.y + 0.5;
    const taper = 1 - up * 0.3;
    pos.setXYZ(i, v.x * r * taper + lean * up, v.y, v.z * r * taper * depth);
  }
  g.computeBoundingBox();
  const bb = g.boundingBox as THREE.Box3;
  // Fit inside the cell footprint and stand on the floor.
  const span = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2;
  const sx = PILLAR_RADIUS / span;
  const height = PILLAR_HEIGHT * (0.8 + hash3(seed, 3, 0, 9) * 0.2);
  const sy = height / (bb.max.y - bb.min.y);
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = (pos.getX(i) - (bb.min.x + bb.max.x) / 2) * sx;
    const z = (pos.getZ(i) - (bb.min.z + bb.max.z) / 2) * sx;
    const y = Math.max(0, (pos.getY(i) - bb.min.y) * sy);
    pos.setXYZ(i, x, y, z);
    // Wrap the texture around the stone by angle, at its real-world scale.
    uv[i * 2] = ((Math.atan2(z, x) / (Math.PI * 2) + 0.5) * PILLAR_RADIUS * 2 * Math.PI) / tile;
    uv[i * 2 + 1] = y / tile;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function shadowy<T extends THREE.Object3D>(o: T, cast = true, receive = true): T {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
  return o;
}

/** A round stone watchtower on a 3x3-cell footprint (6 x 6 units), built from the wall texture. */
function tower(look: TerrainLook): THREE.Group {
  const g = new THREE.Group();
  const stone = pbrMaterial(look.wall);
  const dark = pbrMaterial(look.wall, '#8a8a84');
  const cyl = (rTop: number, rBot: number, h: number, y: number, mat: THREE.Material, seg = 40) => {
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1);
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    const circ = Math.PI * (rTop + rBot);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * circ) / look.wall.tile, (uv.getY(i) * h) / look.wall.tile);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y + h / 2;
    g.add(m);
  };
  cyl(2.95, 2.98, 0.8, 0, dark);
  cyl(2.45, 2.85, 13, 0.8, stone);
  cyl(2.8, 2.5, 0.7, 13.8, dark);
  // Battlements: merlons around the rim.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const m = new THREE.Mesh(worldUvBox(0.95, 1.1, 0.55, look.wall.tile), stone);
    m.position.set(Math.cos(a) * 2.5, 15.05, Math.sin(a) * 2.5);
    m.rotation.y = -a + Math.PI / 2;
    g.add(m);
  }
  // A small turret with a slate cone roof.
  cyl(1.05, 1.15, 2.6, 14.5, stone, 24);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.55, 2.6, 24), new THREE.MeshStandardMaterial({ color: '#3d3f45', roughness: 0.7 }));
  roof.position.y = 17.1 + 1.3;
  g.add(roof);
  // Arrow slits, dark recesses facing four ways.
  const slitMat = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 1 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    for (const y of [5, 10]) {
      const r = 2.85 - (y / 13) * 0.4;
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.2, 0.12), slitMat);
      s.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      s.rotation.y = -a + Math.PI / 2;
      g.add(s);
    }
  }
  return shadowy(g);
}

/** The quiver tree model, scaled up to landmark size. Appears once it has loaded. */
function tree(): THREE.Group {
  const g = new THREE.Group();
  loadModel('quiver_tree_02')
    .then((model) => {
      model.scale.setScalar(TREE_SCALE);
      g.add(shadowy(model));
    })
    .catch((err: unknown) => console.warn('Tree model failed to load', err));
  return g;
}

function landmark(l: Landmark, look: TerrainLook): THREE.Group {
  return l.kind === 'tower' ? tower(look) : tree();
}

/** Everything that belongs to one arena: ground, walls, pillars, start pad, landmarks. */
export function buildArena(world: World, look: TerrainLook): THREE.Group {
  const group = new THREE.Group();
  const { grid } = world;
  const n = grid.size;
  const width = n * grid.cell;

  // Ground reaches well past the walls and fades into fog.
  const groundSize = 420;
  const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
  const guv = groundGeo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < guv.count; i++) guv.setXY(i, (guv.getX(i) * groundSize) / look.ground.tile, (guv.getY(i) * groundSize) / look.ground.tile);
  const ground = new THREE.Mesh(groundGeo, pbrMaterial(look.ground, look.groundTint));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Perimeter walls sit just outside the grid.
  const wallMat = pbrMaterial(look.wall);
  const h = grid.half;
  const t = WALL_THICKNESS;
  const walls: Array<[number, number, number, number]> = [
    [width + 2 * t, t, 0, -h - t / 2],
    [width + 2 * t, t, 0, h + t / 2],
    [t, width, -h - t / 2, 0],
    [t, width, h + t / 2, 0],
  ];
  for (const [w, d, x, z] of walls) {
    const m = new THREE.Mesh(worldUvBox(w, WALL_HEIGHT, d, look.wall.tile), wallMat);
    m.position.set(x, WALL_HEIGHT / 2, z);
    group.add(shadowy(m));
  }

  // Rock pillars on every solid cell that is not part of a landmark.
  const landmarkCells = new Set<number>();
  for (const l of world.level.landmarks) {
    const r = (l.size - 1) / 2;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) landmarkCells.add((l.cell.z + dz) * n + l.cell.x + dx);
  }
  const rockMat = pbrMaterial(look.pillar);
  for (let i = 0; i < world.pillars.length; i++) {
    if (!world.pillars[i] || landmarkCells.has(i)) continue;
    const m = new THREE.Mesh(rockGeometry(i, look.pillar.tile), rockMat);
    m.position.set(cellToWorld(grid, i % n), 0, cellToWorld(grid, Math.floor(i / n)));
    m.rotation.y = hash3(i, 0, 0, 3) * Math.PI * 2;
    group.add(shadowy(m));
  }

  for (const l of world.level.landmarks) {
    const lm = landmark(l, look);
    lm.position.set(cellToWorld(grid, l.cell.x), 0, cellToWorld(grid, l.cell.z));
    group.add(lm);
  }

  // The start (and respawn) pad: a worn stone disc set into the grass.
  const { start } = world.level;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.9, 0.08, 32), pbrMaterial(look.wall, '#d8d4c8'));
  pad.position.set(cellToWorld(grid, start.x), 0.04, cellToWorld(grid, start.z));
  pad.receiveShadow = true;
  group.add(pad);

  return group;
}

/** Free per-arena geometry and materials. Shared textures stay cached. */
export function disposeArena(group: THREE.Object3D): void {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m.dispose();
    }
  });
}

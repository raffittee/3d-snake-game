import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Quality } from '../settings';
import { cellToWorld } from '../sim/grid';
import { createRng } from '../sim/rng';
import { Tile } from '../sim/tiles';
import type { World } from '../sim/types';
import { pbrMaterial } from './assets';
import { addWindSway, tuftGeometry } from './grass';
import { sparkTexture } from './itemModels';
import { waterNormalTexture } from './layoutViews';
import type { TerrainLook } from './terrains';

/** Fireflies drifting over the swamp. */
const FIREFLIES: Record<Quality, number> = { high: 160, low: 70 };

/** A lily pad: a flat disc with a notch cut in to the middle, a slightly raised rim. Radius 1. */
function padGeometry(): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(1, 24, 0.25, Math.PI * 2 - 0.5);
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    pos.setY(i, r * r * 0.05);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * The swamp, drawn from the world's tiles: murky water over every mud cell (a dark bed under a
 * glossy surface with a slow moving ripple), fallen logs along each run of Log tiles, lily pads on
 * the Pad tiles (some flowering), reeds with cattails along the island shores, and fireflies.
 * Render only.
 */
export class SwampViews {
  readonly group = new THREE.Group();
  private readonly ripple = waterNormalTexture();
  private readonly uTime = { value: 0 };
  private readonly flies: THREE.Points;
  private readonly flyBase: Float32Array;
  private readonly flyPhase: Float32Array;
  private water: THREE.MeshStandardMaterial | null = null;

  /**
   * The sky's light for the water's dull sheen. A material's own `envMapIntensity` only counts when
   * it carries the map itself (with the scene's environment, three uses the scene's intensity), so
   * the renderer hands it over here; null at low quality (no image-based light).
   */
  setEnvironment(env: THREE.Texture | null): void {
    if (!this.water) return;
    this.water.envMap = env;
    this.water.needsUpdate = true;
  }

  private constructor(world: World, look: TerrainLook, quality: Quality) {
    const { grid, tiles } = world;
    const n = grid.size;
    const c = grid.cell;
    const rng = createRng(n * 313 + 7);
    const wet = (x: number, z: number) => x >= 0 && z >= 0 && x < n && z < n && (tiles[z * n + x] === Tile.Mud || tiles[z * n + x] === Tile.Log || tiles[z * n + x] === Tile.Pad);
    const quad = (x: number, z: number, y: number, tile: number) => {
      const g = new THREE.PlaneGeometry(c, c);
      g.rotateX(-Math.PI / 2);
      g.translate(cellToWorld(grid, x), y, cellToWorld(grid, z));
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, ((x + uv.getX(i)) * c) / tile, ((z + uv.getY(i)) * c) / tile);
      return g;
    };
    const bedSet = look.mud?.bed ?? look.ground;
    const bed: THREE.BufferGeometry[] = [];
    const surface: THREE.BufferGeometry[] = [];
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        if (!wet(x, z)) continue;
        bed.push(quad(x, z, 0.012, bedSet.tile));
        surface.push(quad(x, z, 0.07, 4));
      }
    }
    if (bed.length) {
      const bedMesh = new THREE.Mesh(mergeGeometries(bed), pbrMaterial(bedSet, '#4c4232'));
      bedMesh.receiveShadow = true;
      const water = new THREE.Mesh(
        mergeGeometries(surface),
        new THREE.MeshStandardMaterial({
          color: look.mud?.surface ?? '#2c3523',
          roughness: 0.32,
          metalness: 0,
          // Murky, not a mirror: only a dull sheen of the misty sky.
          envMapIntensity: 0.22,
          normalMap: this.ripple,
          normalScale: new THREE.Vector2(0.3, 0.3),
          transparent: true,
          opacity: 0.94,
        }),
      );
      water.receiveShadow = true;
      this.water = water.material as THREE.MeshStandardMaterial;
      this.group.add(bedMesh, water);
    }

    // Fallen logs: one along each straight run of Log tiles (rows first, then what is left in columns).
    const barkSet = look.bark ?? look.wall;
    const bark = pbrMaterial(barkSet, '#9c9282');
    const used = new Uint8Array(n * n);
    const isLog = (x: number, z: number) => x >= 0 && z >= 0 && x < n && z < n && tiles[z * n + x] === Tile.Log;
    const addLog = (x0: number, z0: number, x1: number, z1: number) => {
      const len = (Math.abs(x1 - x0) + Math.abs(z1 - z0) + 1) * c + 0.5;
      const r = 0.42 + rng.next() * 0.12;
      const g = new THREE.CylinderGeometry(r * 0.92, r, len, 14, 1);
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * Math.PI * 2 * r) / barkSet.tile, (uv.getY(i) * len) / barkSet.tile);
      const m = new THREE.Mesh(g, bark);
      m.position.set((cellToWorld(grid, x0) + cellToWorld(grid, x1)) / 2, r * 0.45, (cellToWorld(grid, z0) + cellToWorld(grid, z1)) / 2);
      // Lying along the run (a cylinder stands along y), with a slight skew.
      if (z0 === z1) m.rotation.z = Math.PI / 2;
      else m.rotation.x = Math.PI / 2;
      m.rotation.y = (rng.next() - 0.5) * 0.08;
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    };
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        if (!isLog(x, z) || used[z * n + x]) continue;
        let x1 = x;
        while (isLog(x1 + 1, z) && !used[z * n + x1 + 1]) x1++;
        let z1 = z;
        while (isLog(x, z1 + 1) && !used[(z1 + 1) * n + x]) z1++;
        if (x1 - x >= z1 - z) {
          for (let k = x; k <= x1; k++) used[z * n + k] = 1;
          addLog(x, z, x1, z);
        } else {
          for (let k = z; k <= z1; k++) used[k * n + x] = 1;
          addLog(x, z, x, z1);
        }
      }
    }

    // Lily pads: a big one per Pad tile, two small ones around it; some flower.
    const pads: Array<{ x: number; z: number; r: number; yaw: number }> = [];
    for (let i = 0; i < n * n; i++) {
      if (tiles[i] !== Tile.Pad) continue;
      const x = cellToWorld(grid, i % n);
      const z = cellToWorld(grid, (i / n) | 0);
      pads.push({ x: x + (rng.next() - 0.5) * 0.3, z: z + (rng.next() - 0.5) * 0.3, r: 0.85 + rng.next() * 0.15, yaw: rng.next() * 6.3 });
      for (let k = 0; k < 2; k++) pads.push({ x: x + (rng.next() - 0.5) * 1.6, z: z + (rng.next() - 0.5) * 1.6, r: 0.25 + rng.next() * 0.25, yaw: rng.next() * 6.3 });
    }
    if (pads.length) {
      const padMesh = new THREE.InstancedMesh(padGeometry(), new THREE.MeshStandardMaterial({ color: '#4f6b2c', roughness: 0.45, side: THREE.DoubleSide }), pads.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const tint = new THREE.Color();
      pads.forEach((p, k) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
        m.compose(new THREE.Vector3(p.x, 0.09 + k * 0.0004, p.z), q, new THREE.Vector3(p.r, 1, p.r));
        padMesh.setMatrixAt(k, m);
        padMesh.setColorAt(k, tint.setRGB(0.85 + rng.next() * 0.3, 0.85 + rng.next() * 0.3, 0.75 + rng.next() * 0.2));
      });
      padMesh.receiveShadow = true;
      this.group.add(padMesh);
      // Pale flowers on some of the big pads.
      const flowers = pads.filter((p) => p.r > 0.8 && rng.next() < 0.3);
      if (flowers.length) {
        const petal = new THREE.ConeGeometry(0.14, 0.16, 7, 1, true);
        petal.translate(0, 0.08, 0);
        const fm = new THREE.InstancedMesh(petal, new THREE.MeshStandardMaterial({ color: '#efe6e9', emissive: '#3a3034', roughness: 0.6, side: THREE.DoubleSide }), flowers.length);
        flowers.forEach((p, k) => {
          m.compose(new THREE.Vector3(p.x + 0.3, 0.1, p.z + 0.2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI), new THREE.Vector3(1, 1, 1));
          fm.setMatrixAt(k, m);
        });
        this.group.add(fm);
      }
    }

    // Reeds and cattails along the island shores (mud cells next to firm ground).
    const shore: number[] = [];
    for (let i = 0; i < n * n; i++) {
      if (tiles[i] !== Tile.Mud) continue;
      const x = i % n;
      const z = (i / n) | 0;
      const firmNext = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
        const t = x + dx >= 0 && z + dz >= 0 && x + dx < n && z + dz < n ? tiles[(z + dz) * n + x + dx] : -1;
        return t === Tile.Open;
      });
      if (firmNext && rng.next() < (quality === 'high' ? 0.55 : 0.3)) shore.push(i);
    }
    if (shore.length) {
      const reedMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 });
      addWindSway(reedMat, this.uTime, 1, 0.08);
      const colors = look.grass ?? { base: '#2a3318', tip: '#7f8a4a' };
      const reeds = new THREE.InstancedMesh(tuftGeometry(9, 3, new THREE.Color(colors.base), new THREE.Color(colors.tip), 41), reedMat, shore.length * 2);
      const tails = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.045, 0.28, 6), new THREE.MeshStandardMaterial({ color: '#4a3020', roughness: 0.9 }), shore.length * 3);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      let r = 0;
      let t = 0;
      for (const i of shore) {
        const cx = cellToWorld(grid, i % n);
        const cz = cellToWorld(grid, (i / n) | 0);
        for (let k = 0; k < 2; k++) {
          const x = cx + (rng.next() - 0.5) * c * 0.8;
          const z = cz + (rng.next() - 0.5) * c * 0.8;
          const h = 1.2 + rng.next() * 0.6;
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.next() * 6.3);
          m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(0.7, h, 0.7));
          reeds.setMatrixAt(r++, m);
          if (rng.next() < 0.7) {
            m.compose(new THREE.Vector3(x + (rng.next() - 0.5) * 0.3, h * 0.9, z + (rng.next() - 0.5) * 0.3), q, new THREE.Vector3(1, 1, 1));
            tails.setMatrixAt(t++, m);
          }
        }
      }
      reeds.count = r;
      tails.count = t;
      reeds.receiveShadow = true;
      this.group.add(reeds, tails);
    }

    // Fireflies: soft yellow sparks that drift and blink (cosmetic, placed with the level's seed).
    const count = FIREFLIES[quality];
    this.flyBase = new Float32Array(count * 3);
    this.flyPhase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.flyBase[i * 3] = (rng.next() - 0.5) * grid.half * 2;
      this.flyBase[i * 3 + 1] = 0.4 + rng.next() * 2;
      this.flyBase[i * 3 + 2] = (rng.next() - 0.5) * grid.half * 2;
      this.flyPhase[i] = rng.next() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    this.flies = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.22, map: sparkTexture(), vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, sizeAttenuation: true }),
    );
    this.flies.frustumCulled = false;
    this.group.add(this.flies);
  }

  /** The swamp for this world, or null when the level has no mud. */
  static build(world: World, look: TerrainLook, quality: Quality): SwampViews | null {
    return world.tiles.some((t) => t === Tile.Mud) ? new SwampViews(world, look, quality) : null;
  }

  update(now: number): void {
    const t = now / 1000;
    this.uTime.value = t;
    this.ripple.offset.set((t * 0.008) % 1, (t * 0.013) % 1);
    const pos = this.flies.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = this.flies.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < this.flyPhase.length; i++) {
      const ph = this.flyPhase[i];
      pos.setXYZ(
        i,
        this.flyBase[i * 3] + Math.sin(t * 0.3 + ph) * 1.5,
        this.flyBase[i * 3 + 1] + Math.sin(t * 0.7 + ph * 1.3) * 0.3,
        this.flyBase[i * 3 + 2] + Math.cos(t * 0.25 + ph * 0.7) * 1.5,
      );
      // Blink: mostly dark, glowing for a moment now and then.
      const k = Math.max(0, Math.sin(t * 0.9 + ph)) ** 6;
      col.setXYZ(i, 0.95 * k, 0.85 * k, 0.3 * k);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) o.geometry.dispose();
    });
    this.ripple.dispose();
  }
}

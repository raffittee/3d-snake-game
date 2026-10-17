import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BALANCE } from '../config/balance';
import type { Quality } from '../settings';
import { cellToWorld } from '../sim/grid';
import { doorGroup } from '../sim/house';
import { createRng } from '../sim/rng';
import { DoorState, Tile } from '../sim/tiles';
import type { World } from '../sim/types';
import { pbrMaterial } from './assets';
import { sparkTexture } from './itemModels';
import { worldUvBox } from './layoutViews';
import type { TerrainLook } from './terrains';

/** Lamps lighting the house; only high quality gives them real (point) lights. */
const LAMPS = 8;
const LIGHTS: Record<Quality, number> = { high: 6, low: 0 };
/** How far a door swings open (radians), and how fast it moves. */
const OPEN_ANGLE = 1.45;
const SWING_RATE = 6;

interface DoorView {
  cells: number[];
  hinge: THREE.Group;
  leaf: THREE.Mesh;
  /** 0 shut .. 1 open, eased toward the door's state. */
  open: number;
  lastDamage: number;
  shake: number;
  broken: boolean;
}

/**
 * The broken house, drawn from the world's tiles: wallpapered full-height walls with a dark wood
 * cap, doors that swing open and shut (shake as the snake bashes them, and lie broken on the floor
 * after), wardrobes for closets (open toward the room, so you can hide inside and look out), and
 * standing lamps glowing warm. Render only.
 */
export class HouseViews {
  readonly group = new THREE.Group();
  private readonly doors: DoorView[] = [];
  private readonly lampGlows: THREE.Sprite[] = [];

  private constructor(private readonly world: World, look: TerrainLook, quality: Quality) {
    const { grid, tiles } = world;
    const n = grid.size;
    const c = grid.cell;
    const h = BALANCE.house.wallHeight;
    const isWallish = (x: number, z: number) => x < 0 || z < 0 || x >= n || z >= n || tiles[z * n + x] === Tile.HouseWall || tiles[z * n + x] === Tile.Door;
    const wood = pbrMaterial(look.planks ?? look.ground, '#8a6a52');

    // Walls: one merged mesh of wallpapered boxes, and a dark wooden cap along their tops.
    const walls: THREE.BufferGeometry[] = [];
    const caps: THREE.BufferGeometry[] = [];
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] !== Tile.HouseWall) continue;
      const x = cellToWorld(grid, i % n);
      const z = cellToWorld(grid, (i / n) | 0);
      // Uneven tops: the house is broken.
      const top = h * (0.82 + 0.18 * hash(i));
      const g = worldUvBox(c, top, c, look.wall.tile);
      g.translate(x, top / 2, z);
      walls.push(g);
      const cap = worldUvBox(c * 1.04, 0.14, c * 1.04, 1);
      cap.translate(x, top + 0.07, z);
      caps.push(cap);
    }
    if (walls.length) {
      const m = new THREE.Mesh(mergeGeometries(walls), pbrMaterial(look.wall, '#d8ccb6'));
      m.castShadow = m.receiveShadow = true;
      const capMesh = new THREE.Mesh(mergeGeometries(caps), wood);
      capMesh.castShadow = true;
      this.group.add(m, capMesh);
    }

    // Doors: one leaf per doorway cell, hinged on the doorway's outer edge.
    const seen = new Set<number>();
    const doorMat = pbrMaterial(look.planks ?? look.ground, '#e0b88e');
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] !== Tile.Door || seen.has(i)) continue;
      const cells = doorGroup(world, i).sort((a, b) => a - b);
      for (const k of cells) seen.add(k);
      const x0 = i % n;
      const z0 = (i / n) | 0;
      // The wall runs along z when the cells above and below the doorway are wall: the door then spans z.
      const alongZ = isWallish(x0, z0 - 1) || cells.some((k) => k === i + n);
      cells.forEach((k, idx) => {
        const kx = cellToWorld(grid, k % n);
        const kz = cellToWorld(grid, (k / n) | 0);
        const hinge = new THREE.Group();
        // Each leaf hinges at the end of the doorway away from its partner.
        const sign = cells.length > 1 ? (idx === 0 ? -1 : 1) : -1;
        if (alongZ) hinge.position.set(kx, 0, kz + (sign * c) / 2);
        else hinge.position.set(kx + (sign * c) / 2, 0, kz);
        const leaf = new THREE.Mesh(worldUvBox(alongZ ? 0.12 : c * 0.96, h * 0.82, alongZ ? c * 0.96 : 0.12, 1.5), doorMat);
        if (alongZ) leaf.position.set(0, (h * 0.82) / 2, (-sign * c * 0.96) / 2);
        else leaf.position.set((-sign * c * 0.96) / 2, (h * 0.82) / 2, 0);
        leaf.castShadow = leaf.receiveShadow = true;
        hinge.add(leaf);
        hinge.userData.sign = sign;
        this.group.add(hinge);
        const shut = world.doorState[k] === DoorState.Shut;
        this.doors.push({ cells: [k], hinge, leaf, open: shut ? 0 : 1, lastDamage: 0, shake: 0, broken: false });
      });
    }

    // Closets: a wardrobe whose back is against the wall and whose front opens to the room.
    const closetMat = pbrMaterial(look.planks ?? look.ground, '#6b4f3c');
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] !== Tile.Closet) continue;
      const cx = i % n;
      const cz = (i / n) | 0;
      // Open toward the room: the side with no wall behind.
      const dirs: Array<[number, number]> = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      const front = dirs.find(([dx, dz]) => !isWallish(cx + dx, cz + dz) && isWallish(cx - dx, cz - dz)) ?? [0, 1];
      const g = new THREE.Group();
      g.position.set(cellToWorld(grid, cx), 0, cellToWorld(grid, cz));
      g.rotation.y = Math.atan2(front[0], front[1]);
      const ch = 2.7;
      const panel = (w: number, hh: number, d: number, x: number, y: number, z: number) => {
        const m = new THREE.Mesh(worldUvBox(w, hh, d, 1.5), closetMat);
        m.position.set(x, y, z);
        m.castShadow = m.receiveShadow = true;
        g.add(m);
      };
      panel(c * 0.96, ch, 0.08, 0, ch / 2, -c * 0.46);
      panel(0.08, ch, c * 0.94, -c * 0.46, ch / 2, 0);
      panel(0.08, ch, c * 0.94, c * 0.46, ch / 2, 0);
      panel(c * 0.96, 0.1, c * 0.96, 0, ch, 0);
      // Doors hanging open at the front.
      for (const s of [-1, 1]) {
        const d = new THREE.Mesh(worldUvBox(c * 0.46, ch * 0.92, 0.05, 1.5), closetMat);
        d.position.set(s * c * 0.62, ch * 0.48, c * 0.62);
        d.rotation.y = s * 1.1;
        d.castShadow = true;
        g.add(d);
      }
      this.group.add(g);
    }

    // Standing lamps in open spots spread over the house (seeded), glowing warm.
    const rng = createRng(n * 101 + 3);
    const spots: Array<{ x: number; z: number }> = [];
    for (let tries = 0; spots.length < LAMPS && tries < 2000; tries++) {
      const x = 2 + rng.int(n - 4);
      const z = 2 + rng.int(n - 4);
      if (tiles[z * n + x] !== Tile.Open) continue;
      if (isWallish(x + 1, z) || isWallish(x - 1, z) || isWallish(x, z + 1) || isWallish(x, z - 1)) continue;
      if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 9)) continue;
      spots.push({ x, z });
    }
    const brass = new THREE.MeshStandardMaterial({ color: '#7a6440', metalness: 0.7, roughness: 0.4 });
    const shade = new THREE.MeshStandardMaterial({ color: '#f3d9a4', emissive: '#ffb860', emissiveIntensity: 1.6, side: THREE.DoubleSide, roughness: 0.8 });
    const glowMat = new THREE.SpriteMaterial({ map: sparkTexture(), color: '#ffc27a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 });
    spots.forEach((s, k) => {
      const g = new THREE.Group();
      // Off-centre in the cell so it never stands right where you walk through.
      g.position.set(cellToWorld(grid, s.x) + 0.6, 0, cellToWorld(grid, s.z) + 0.6);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.6, 8), brass);
      pole.position.y = 0.8;
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.05, 16), brass);
      const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 0.36, 18, 1, true), shade);
      lampShade.position.y = 1.72;
      g.add(pole, foot, lampShade);
      const glow = new THREE.Sprite(glowMat);
      glow.position.y = 1.7;
      glow.scale.setScalar(2.2);
      g.add(glow);
      this.lampGlows.push(glow);
      if (k < LIGHTS[quality]) {
        // Physical units: candela, with a falloff that ends at 13 units.
        const light = new THREE.PointLight('#ffb867', 30, 13, 2);
        light.position.y = 1.7;
        g.add(light);
      }
      this.group.add(g);
    });
  }

  /** The house for this world, or null when the level has none. */
  static build(world: World, look: TerrainLook, quality: Quality): HouseViews | null {
    return world.tiles.some((t) => t === Tile.HouseWall) ? new HouseViews(world, look, quality) : null;
  }

  update(dt: number, now: number): void {
    for (const d of this.doors) {
      const i = d.cells[0];
      const state = this.world.doorState[i];
      if (state === DoorState.Broken) {
        if (!d.broken) {
          // Knocked off its hinges: the leaf lies on the floor.
          d.broken = true;
          d.hinge.rotation.set(0, 0, 0);
          d.leaf.rotation.set(Math.PI / 2 - 0.08, 0.3 * (d.hinge.userData.sign as number), 0);
          d.leaf.position.y = 0.1;
        }
        continue;
      }
      const target = state === DoorState.Shut ? 0 : 1;
      d.open += (target - d.open) * Math.min(1, dt * SWING_RATE);
      // A blow from the snake: the shut door jolts.
      const dmg = this.world.doorDamage[i];
      if (dmg > d.lastDamage) d.shake = 1;
      d.lastDamage = dmg;
      d.shake = Math.max(0, d.shake - dt * 4);
      const jolt = d.shake * Math.sin(now * 0.08) * 0.08;
      d.hinge.rotation.y = (d.hinge.userData.sign as number) * (d.open * OPEN_ANGLE) + jolt;
    }
    // Lamps flicker very slightly.
    this.lampGlows.forEach((g, k) => (g.material.opacity = 0.5 + 0.06 * Math.sin(now * 0.013 + k * 2.1) * Math.sin(now * 0.0041 + k)));
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}

/** A deterministic 0..1 per cell (cosmetic). */
function hash(i: number): number {
  const x = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
  return x - Math.floor(x);
}

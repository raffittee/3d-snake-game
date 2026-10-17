import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BALANCE } from '../config/balance';
import { cellToWorld } from '../sim/grid';
import { Tile } from '../sim/tiles';
import type { World } from '../sim/types';
import { pbrMaterial } from './assets';
import type { TerrainLook } from './terrains';

const DUST_LIFE = 0.9;
const DUST_PUFFS = 26;

/** A box whose UVs are in world units / tile, so textures keep their real-world size. */
function worldUvBox(w: number, h: number, d: number, tile: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const faces: Array<[number, number]> = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * faces[f][0]) / tile, (uv.getY(i) * faces[f][1]) / tile);
    }
  }
  return g;
}

/** Small deterministic jitter per cell (cosmetic). */
const jitter = (i: number, k: number): number => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Dust from a wall the snake smashed. Cosmetic only. */
class Dust {
  readonly points: THREE.Points;
  private readonly vel: Float32Array;
  age = 0;

  constructor(x: number, z: number, tex: THREE.Texture) {
    const pos = new Float32Array(DUST_PUFFS * 3);
    this.vel = new Float32Array(DUST_PUFFS * 3);
    for (let i = 0; i < DUST_PUFFS; i++) {
      pos[i * 3] = x + (Math.random() - 0.5) * 1.6;
      pos[i * 3 + 1] = Math.random() * 2;
      pos[i * 3 + 2] = z + (Math.random() - 0.5) * 1.6;
      this.vel[i * 3] = (Math.random() - 0.5) * 3;
      this.vel[i * 3 + 1] = 0.5 + Math.random() * 2;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * 3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#b9a888', size: 0.5, map: tex, transparent: true, opacity: 0.8, depthWrite: false }));
    this.points.frustumCulled = false;
  }

  update(dt: number): boolean {
    this.age += dt;
    const attr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const p = attr.array as Float32Array;
    for (let i = 0; i < DUST_PUFFS * 3; i++) p[i] += this.vel[i] * dt;
    attr.needsUpdate = true;
    (this.points.material as THREE.PointsMaterial).opacity = 0.8 * Math.max(0, 1 - this.age / DUST_LIFE);
    return this.age < DUST_LIFE;
  }
}

/** A tiling normal map of soft ripples for water, made in code (sums of a few sine waves). */
function waterNormalTexture(): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  if (g) {
    const img = g.createImageData(s, s);
    const h = (x: number, y: number) =>
      Math.sin((x / s) * Math.PI * 2 * 3 + Math.sin((y / s) * Math.PI * 2 * 2) * 1.5) * 0.5 +
      Math.sin((y / s) * Math.PI * 2 * 5 + (x / s) * Math.PI * 2 * 2) * 0.3 +
      Math.sin(((x + y) / s) * Math.PI * 2 * 7) * 0.2;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const dx = h(x + 1, y) - h(x - 1, y);
        const dy = h(x, y + 1) - h(x, y - 1);
        const len = Math.hypot(dx, dy, 1);
        const i = (y * s + x) * 4;
        img.data[i] = (-dx / len) * 127 + 128;
        img.data[i + 1] = (-dy / len) * 127 + 128;
        img.data[i + 2] = (1 / len) * 127 + 128;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function puffTexture(): THREE.CanvasTexture {
  const s = 32;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }
  return new THREE.CanvasTexture(c);
}

/** A small gold idol on a stone plinth: one relic. */
function relicModel(stone: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: '#d4a640', metalness: 0.9, roughness: 0.28, emissive: '#3a2a08', emissiveIntensity: 0.4 });
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.45, 8), stone);
  plinth.position.y = 0.225;
  g.add(plinth);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.42, 10), gold);
  body.position.y = 0.66;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), gold);
  head.position.y = 0.95;
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 8), gold);
  crown.position.y = 1.1;
  g.add(body, head, crown);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}

/**
 * Ground features that change as you play (Ruins): low walls (static, merged), crumbling walls
 * (removed when the snake smashes them, with dust), relics (removed when picked), and the gate
 * (its doors swing open once every relic is found). Reads the world; keeps no rules.
 */
export class LayoutViews {
  readonly group = new THREE.Group();
  private readonly crumbles = new Map<number, THREE.Mesh>();
  private readonly relics = new Map<string, THREE.Group>();
  private doors: THREE.Group[] = [];
  private gateGlow: THREE.Sprite | null = null;
  private doorOpen = 0;
  private readonly dust: Dust[] = [];
  private readonly puff = puffTexture();
  private readonly glowTex = puffTexture();

  constructor(world: World, look: TerrainLook) {
    const { grid, tiles } = world;
    const n = grid.size;
    const lowSet = look.lowWall ?? look.wall;
    const crumbleSet = look.crumble ?? look.wall;
    const lowH = BALANCE.arena.lowWallHeight;
    const crumbleH = BALANCE.arena.crumbleHeight;
    const lows: THREE.BufferGeometry[] = [];
    const crumbleMat = pbrMaterial(crumbleSet, '#c9c2b5');
    for (let i = 0; i < tiles.length; i++) {
      const x = cellToWorld(grid, i % n);
      const z = cellToWorld(grid, Math.floor(i / n));
      if (tiles[i] === Tile.LowWall) {
        // Slightly uneven heights read as old masonry rather than a row of identical boxes.
        const h = lowH * (0.92 + jitter(i, 1) * 0.12);
        const g = worldUvBox(grid.cell * 0.98, h, grid.cell * 0.98, lowSet.tile);
        g.translate(x, h / 2, z);
        lows.push(g);
      } else if (tiles[i] === Tile.Crumble) {
        const h = crumbleH * (0.85 + jitter(i, 2) * 0.18);
        const m = new THREE.Mesh(worldUvBox(grid.cell * 0.96, h, grid.cell * 0.96, crumbleSet.tile), crumbleMat);
        m.position.set(x, h / 2, z);
        m.rotation.y = (jitter(i, 3) - 0.5) * 0.06;
        m.castShadow = m.receiveShadow = true;
        this.crumbles.set(i, m);
        this.group.add(m);
      }
    }
    if (lows.length) {
      const merged = new THREE.Mesh(mergeGeometries(lows), pbrMaterial(lowSet));
      merged.castShadow = merged.receiveShadow = true;
      this.group.add(merged);
    }

    const stone = pbrMaterial(lowSet, '#bdb6a6');
    for (const r of world.relics) {
      const m = relicModel(stone);
      m.position.set(cellToWorld(grid, r.x), 0, cellToWorld(grid, r.z));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#f2c14e', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      glow.position.y = 0.85;
      glow.scale.setScalar(1.6);
      m.add(glow);
      this.relics.set(`${r.x},${r.z}`, m);
      this.group.add(m);
    }

    if (world.tiles.some((t) => t === Tile.Water || t === Tile.Bridge)) this.buildRiver(world, look);
    if (world.level.gate) {
      if (world.level.goal.kind === 'reachExit') this.buildDock(world, look);
      else this.buildGate(world, look);
    }
  }

  private waterNormal: THREE.Texture | null = null;

  /**
   * The river: a glossy teal surface (a moving normal map) over a rocky bed, rocky banks along the
   * water's edge, and plank bridges with posts and rails.
   */
  private buildRiver(world: World, look: TerrainLook): void {
    const { grid, tiles } = world;
    const n = grid.size;
    const c = grid.cell;
    const isWet = (x: number, z: number) => x >= 0 && z >= 0 && x < n && z < n && (tiles[z * n + x] === Tile.Water || tiles[z * n + x] === Tile.Bridge);
    const quad = (x: number, z: number, y: number, size: number, tile: number) => {
      const g = new THREE.PlaneGeometry(size, size);
      g.rotateX(-Math.PI / 2);
      g.translate(cellToWorld(grid, x), y, cellToWorld(grid, z));
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, ((x + uv.getX(i)) * c) / tile, ((z + uv.getY(i)) * c) / tile);
      return g;
    };
    const bankSet = look.bank ?? look.ground;
    const bed: THREE.BufferGeometry[] = [];
    const water: THREE.BufferGeometry[] = [];
    const banks: THREE.BufferGeometry[] = [];
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        if (isWet(x, z)) {
          bed.push(quad(x, z, 0.012, c, bankSet.tile));
          water.push(quad(x, z, 0.08, c, 4));
        } else if (isWet(x + 1, z) || isWet(x - 1, z) || isWet(x, z + 1) || isWet(x, z - 1)) {
          banks.push(quad(x, z, 0.014, c, bankSet.tile));
        }
      }
    }
    const bedMesh = new THREE.Mesh(mergeGeometries(bed), pbrMaterial(bankSet, '#5d6a63'));
    bedMesh.receiveShadow = true;
    const bankMesh = new THREE.Mesh(mergeGeometries(banks), pbrMaterial(bankSet));
    bankMesh.receiveShadow = true;
    this.waterNormal = waterNormalTexture();
    const waterMat = new THREE.MeshStandardMaterial({
      color: '#2a6670',
      roughness: 0.06,
      metalness: 0.1,
      normalMap: this.waterNormal,
      normalScale: new THREE.Vector2(0.6, 0.6),
      transparent: true,
      opacity: 0.86,
    });
    const waterMesh = new THREE.Mesh(mergeGeometries(water), waterMat);
    waterMesh.receiveShadow = true;
    this.group.add(bedMesh, bankMesh, waterMesh);

    // Bridges: walk the Bridge tiles by column pair; a deck over each, posts and rails along the sides.
    const plankSet = look.planks ?? look.wall;
    const planks = pbrMaterial(plankSet);
    const dark = pbrMaterial(plankSet, '#6d5a48');
    const seen = new Set<number>();
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] !== Tile.Bridge || seen.has(i)) continue;
      // Collect this bridge: contiguous bridge tiles in this column pair.
      const x0 = i % n;
      let z0 = Math.floor(i / n);
      let z1 = z0;
      while (z1 + 1 < n && tiles[(z1 + 1) * n + x0] === Tile.Bridge) z1++;
      for (let z = z0; z <= z1; z++) for (const x of [x0, x0 + 1]) seen.add(z * n + x);
      z0 -= 1; // decks run a little onto each bank
      z1 += 1;
      const cx = (cellToWorld(grid, x0) + cellToWorld(grid, x0 + 1)) / 2;
      const zA = cellToWorld(grid, z0) - c / 2;
      const zB = cellToWorld(grid, z1) + c / 2;
      const len = zB - zA;
      const deck = new THREE.Mesh(worldUvBox(c * 2, 0.14, len, plankSet.tile), planks);
      deck.position.set(cx, 0.12, (zA + zB) / 2);
      deck.castShadow = deck.receiveShadow = true;
      this.group.add(deck);
      for (const sx of [-1, 1]) {
        const rail = new THREE.Mesh(worldUvBox(0.12, 0.12, len, plankSet.tile), dark);
        rail.position.set(cx + sx * (c - 0.1), 1.0, (zA + zB) / 2);
        rail.castShadow = true;
        this.group.add(rail);
        for (let z = zA + 0.3; z <= zB - 0.2; z += 2) {
          const post = new THREE.Mesh(worldUvBox(0.16, 1.15, 0.16, plankSet.tile), dark);
          post.position.set(cx + sx * (c - 0.1), 0.55, z);
          post.castShadow = true;
          this.group.add(post);
        }
      }
    }
  }

  /**
   * The far dock (Riverside's exit): a plank platform from the bank out over the water, posts and a
   * lantern that glows. The exit cell is the bank end; the deck reaches south over the river.
   */
  private buildDock(world: World, look: TerrainLook): void {
    const { grid, gate } = world;
    const plankSet = look.planks ?? look.wall;
    const x = cellToWorld(grid, gate.x);
    const z = cellToWorld(grid, gate.z) + 1.5;
    const g = new THREE.Group();
    const deck = new THREE.Mesh(worldUvBox(6, 0.2, 4, plankSet.tile), pbrMaterial(plankSet));
    deck.position.set(x, 0.15, z);
    deck.receiveShadow = deck.castShadow = true;
    g.add(deck);
    const dark = pbrMaterial(plankSet, '#6d5a48');
    for (const [dx, dz] of [[-2.8, -1.8], [2.8, -1.8], [-2.8, 1.8], [2.8, 1.8]]) {
      const post = new THREE.Mesh(worldUvBox(0.22, 1.4, 0.22, plankSet.tile), dark);
      post.position.set(x + dx, 0.7, z + dz);
      post.castShadow = true;
      g.add(post);
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3, 8), dark);
    pole.position.set(x + 2.4, 1.6, z + 1.4);
    g.add(pole);
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.3), new THREE.MeshStandardMaterial({ color: '#ffe2a0', emissive: '#ffb84a', emissiveIntensity: 2 }));
    lantern.position.set(x + 2.4, 3.2, z + 1.4);
    g.add(lantern);
    this.gateGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#ffd18a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
    this.gateGlow.position.copy(lantern.position);
    this.gateGlow.scale.setScalar(3.2);
    g.add(this.gateGlow);
    this.group.add(g);
  }

  /** A stone arch on the north edge with two wooden doors. */
  private buildGate(world: World, look: TerrainLook): void {
    const { grid, gate } = world;
    const x = cellToWorld(grid, gate.x);
    const z = cellToWorld(grid, gate.z) - grid.cell * 0.5;
    const stone = pbrMaterial(look.wall);
    const g = new THREE.Group();
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(worldUvBox(1.1, 4.4, 1.3, look.wall.tile), stone);
      post.position.set(x + sx * 2.1, 2.2, z);
      post.castShadow = true;
      g.add(post);
    }
    const lintel = new THREE.Mesh(worldUvBox(5.4, 0.9, 1.4, look.wall.tile), stone);
    lintel.position.set(x, 4.85, z);
    lintel.castShadow = true;
    g.add(lintel);
    const wood = new THREE.MeshStandardMaterial({ color: '#5a3f26', roughness: 0.8 });
    const iron = new THREE.MeshStandardMaterial({ color: '#2b2b2b', metalness: 0.6, roughness: 0.5 });
    for (const sx of [-1, 1]) {
      // Each door hinges on its outer edge.
      const hinge = new THREE.Group();
      hinge.position.set(x + sx * 1.55, 0, z);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.55, 3.9, 0.16), wood);
      leaf.position.set(-sx * 0.775, 1.95, 0);
      leaf.castShadow = true;
      hinge.add(leaf);
      for (const y of [0.9, 3.0]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.2), iron);
        band.position.set(-sx * 0.775, y, 0);
        hinge.add(band);
      }
      this.doors.push(hinge);
      g.add(hinge);
    }
    // A pale light in the archway once it opens, so you can find it from afar.
    this.gateGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#fff2c8', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    this.gateGlow.position.set(x, 2.2, z + 0.5);
    this.gateGlow.scale.set(5, 6, 1);
    g.add(this.gateGlow);
    this.group.add(g);
  }

  update(world: World, dt: number, now: number): void {
    const n = world.grid.size;
    for (const [i, m] of this.crumbles) {
      if (world.tiles[i] !== Tile.Crumble) {
        this.group.remove(m);
        m.geometry.dispose();
        this.crumbles.delete(i);
        const d = new Dust(cellToWorld(world.grid, i % n), cellToWorld(world.grid, Math.floor(i / n)), this.puff);
        this.dust.push(d);
        this.group.add(d.points);
      }
    }
    const live = new Set(world.relics.map((r) => `${r.x},${r.z}`));
    for (const [key, m] of this.relics) {
      if (!live.has(key)) {
        this.group.remove(m);
        this.relics.delete(key);
        continue;
      }
      m.rotation.y += dt * 0.8;
      m.children.forEach((c, k) => {
        if (k > 0 && !(c instanceof THREE.Sprite)) c.position.y += Math.sin(now * 0.003) * 0.0006;
      });
    }
    // The river's surface drifts.
    if (this.waterNormal) this.waterNormal.offset.set((now * 0.00002) % 1, (now * 0.00005) % 1);
    // Doors swing open over a second once the gate opens.
    this.doorOpen = world.gateOpen ? Math.min(1, this.doorOpen + dt) : 0;
    const k = 1 - (1 - this.doorOpen) ** 3;
    this.doors.forEach((h, i) => (h.rotation.y = (i === 0 ? 1 : -1) * k * 1.6));
    if (this.gateGlow && this.doors.length) (this.gateGlow.material as THREE.SpriteMaterial).opacity = k * (0.55 + 0.15 * Math.sin(now * 0.004));
    for (let i = this.dust.length - 1; i >= 0; i--) {
      if (!this.dust[i].update(dt)) {
        this.group.remove(this.dust[i].points);
        this.dust.splice(i, 1);
      }
    }
  }
}

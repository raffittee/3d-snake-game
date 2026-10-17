import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BALANCE } from '../config/balance';
import { cellToWorld } from '../sim/grid';
import { Tile } from '../sim/tiles';
import type { World } from '../sim/types';
import { loadModel, pbrMaterial } from './assets';
import { tuftGeometry } from './grass';
import type { TerrainLook } from './terrains';

const DUST_LIFE = 0.9;
const DUST_PUFFS = 26;

/** A box whose UVs are in world units / tile, so textures keep their real-world size. */
export function worldUvBox(w: number, h: number, d: number, tile: number): THREE.BoxGeometry {
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
export function waterNormalTexture(): THREE.CanvasTexture {
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

/** The corn maze's map: a weathered sheet pinned to a slanted board on a post, so it stands out at eye height. */
function mapModel(wood: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.3, 8), wood);
  post.position.y = 0.65;
  g.add(post);
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.06), wood);
  board.position.set(0, 1.4, 0);
  board.rotation.x = -0.45;
  g.add(board);
  // The map itself: pale paper with faint drawn paths (made in code).
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const x = c.getContext('2d');
  if (x) {
    x.fillStyle = '#e6dcc0';
    x.fillRect(0, 0, 128, 96);
    x.strokeStyle = '#8a6f45';
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(10, 86);
    x.lineTo(10, 50);
    x.lineTo(50, 50);
    x.lineTo(50, 20);
    x.lineTo(96, 20);
    x.lineTo(96, 60);
    x.lineTo(118, 60);
    x.moveTo(50, 50);
    x.lineTo(80, 50);
    x.lineTo(80, 86);
    x.stroke();
    x.fillStyle = '#9b3b2a';
    x.beginPath();
    x.arc(118, 60, 4, 0, Math.PI * 2);
    x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.66), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  // Just in front of the board's face (the board is tipped back, so the offset follows its tilt).
  paper.position.set(0, 1.4 + Math.sin(0.45) * 0.035, Math.cos(0.45) * 0.035);
  paper.rotation.x = -0.45;
  g.add(paper);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}

/** A signal lantern on a post (Swamp). `glass` is its own material, so lighting it changes only this one. */
function lanternModel(wood: THREE.Material): { group: THREE.Group; glass: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 8), wood);
  post.position.y = 1.2;
  g.add(post);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.08), wood);
  arm.position.set(0.26, 2.3, 0);
  g.add(arm);
  const iron = new THREE.MeshStandardMaterial({ color: '#2a2a28', metalness: 0.6, roughness: 0.55 });
  const glass = new THREE.MeshStandardMaterial({ color: '#3a3a30', emissive: '#ffb04a', emissiveIntensity: 0, roughness: 0.2, metalness: 0 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.3), iron);
  frame.position.set(0.48, 2.0, 0);
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.18, 4), iron);
  top.position.set(0.48, 2.18, 0);
  top.rotation.y = Math.PI / 4;
  const pane = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.24), glass);
  pane.position.set(0.48, 1.82, 0);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.3), iron);
  base.position.set(0.48, 1.65, 0);
  g.add(frame, top, pane, base);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return { group: g, glass };
}

/** A water flask (Desert): a round, flat canteen in a leather cover with a cap and strap, propped on a stone. */
function flaskModel(stone: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), stone);
  rock.scale.set(1, 0.45, 0.85);
  rock.position.y = 0.16;
  g.add(rock);
  const leather = new THREE.MeshStandardMaterial({ color: '#7a5634', roughness: 0.75 });
  const metal = new THREE.MeshStandardMaterial({ color: '#b8bcbf', metalness: 0.85, roughness: 0.3 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 24), leather);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0.62, 0);
  body.rotation.z = 0.15;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.1, 12), metal);
  neck.position.set(0.04, 0.95, 0);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.018, 6, 30), leather);
  strap.position.set(0, 0.62, 0);
  strap.rotation.y = Math.PI / 2;
  g.add(body, neck, strap);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}

/** The front-door key (Broken house): a big brass key lying on a small wooden side table. */
function keyModel(wood: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 20), wood);
  top.position.y = 0.78;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.76, 10), wood);
  leg.position.y = 0.38;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.04, 16), wood);
  g.add(top, leg, foot);
  const brass = new THREE.MeshStandardMaterial({ color: '#c9a043', metalness: 0.9, roughness: 0.3, emissive: '#3a2a08', emissiveIntensity: 0.4 });
  const key = new THREE.Group();
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 8, 20), brass);
  bow.rotation.x = Math.PI / 2;
  bow.position.x = -0.16;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 8), brass);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.x = 0.04;
  const bit = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.07), brass);
  bit.position.set(0.16, 0, 0.04);
  key.add(bow, shaft, bit);
  key.position.y = 0.83;
  key.rotation.y = 0.6;
  g.add(key);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}

/** A small wooden rowboat (Swamp's exit), bow toward -z, about 3.4 long. */
function boatModel(planks: THREE.Material, dark: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(0, -1.7);
  s.quadraticCurveTo(0.75, -1.1, 0.72, 0.4);
  s.quadraticCurveTo(0.7, 1.5, 0.45, 1.7);
  s.lineTo(-0.45, 1.7);
  s.quadraticCurveTo(-0.7, 1.5, -0.72, 0.4);
  s.quadraticCurveTo(-0.75, -1.1, 0, -1.7);
  const hullGeo = new THREE.ExtrudeGeometry(s, { depth: 0.55, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 12 });
  // The shape is in x/y; lay it flat (y becomes -z) and narrow the bottom so the hull is a V.
  hullGeo.rotateX(Math.PI / 2);
  const pos = hullGeo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = 1 - Math.min(1, Math.max(0, y / 0.55)) * 0.45;
    pos.setX(i, pos.getX(i) * k);
    pos.setY(i, 0.55 - y);
  }
  hullGeo.computeVertexNormals();
  const hull = new THREE.Mesh(hullGeo, planks);
  hull.castShadow = hull.receiveShadow = true;
  g.add(hull);
  for (const z of [-0.4, 0.7]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.32), dark);
    seat.position.set(0, 0.42, z);
    g.add(seat);
  }
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
  private boatLamp: THREE.MeshStandardMaterial | null = null;
  private oasis = false;
  private readonly lanterns = new Map<string, { glass: THREE.MeshStandardMaterial; glow: THREE.Sprite; lit: boolean }>();
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
    const isMap = world.level.goal.kind === 'mapThenExit';
    const goal = world.level.goal;
    if (goal.kind === 'relicsThenGate' && goal.relic === 'lantern') {
      // Signal lanterns: they stay standing; lighting one turns its glass on and adds a glow.
      const wood = pbrMaterial(look.planks ?? look.wall, '#6d5a48');
      for (const r of world.relics) {
        const l = lanternModel(wood);
        l.group.position.set(cellToWorld(grid, r.x), 0, cellToWorld(grid, r.z));
        l.group.rotation.y = jitter(r.x * 64 + r.z, 5) * Math.PI * 2;
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#ffc46a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
        glow.position.set(0.48, 1.82, 0);
        glow.scale.setScalar(1.5);
        l.group.add(glow);
        this.lanterns.set(`${r.x},${r.z}`, { glass: l.glass, glow, lit: false });
        this.group.add(l.group);
      }
    }
    const isFlask = goal.kind === 'relicsThenGate' && goal.relic === 'flask';
    const isKey = goal.kind === 'relicsThenGate' && goal.relic === 'key';
    for (const r of this.lanterns.size ? [] : world.relics) {
      const m = isMap
        ? mapModel(pbrMaterial(look.wall, '#8a7560'))
        : isFlask
          ? flaskModel(pbrMaterial(look.pillar, look.pillarTint))
          : isKey
            ? keyModel(pbrMaterial(look.planks ?? look.ground, '#8a6a52'))
            : relicModel(stone);
      m.position.set(cellToWorld(grid, r.x), 0, cellToWorld(grid, r.z));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#f2c14e', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      glow.position.y = isMap ? 1.4 : 0.85;
      glow.scale.setScalar(1.6);
      m.add(glow);
      this.relics.set(`${r.x},${r.z}`, m);
      this.group.add(m);
    }

    if (world.tiles.some((t) => t === Tile.Water || t === Tile.Bridge)) this.buildRiver(world, look);
    if (world.level.gate) {
      if (goal.kind === 'reachExit') this.buildDock(world, look);
      else if (goal.kind === 'relicsThenGate' && goal.exit === 'boat') this.buildBoat(world, look);
      else if (goal.kind === 'relicsThenGate' && goal.exit === 'oasis') this.buildOasis(world, look);
      else this.buildGate(world, look);
    }
  }

  /**
   * Desert's exit: a small pool fringed with green and two quiver trees, against the north wall.
   * Once every flask is found a shimmer rises over the water so you can find it in the haze.
   */
  private buildOasis(world: World, look: TerrainLook): void {
    const { grid, gate } = world;
    const x = cellToWorld(grid, gate.x);
    const z = cellToWorld(grid, gate.z) - 2;
    const g = new THREE.Group();
    this.waterNormal = this.waterNormal ?? waterNormalTexture();
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(3, 40),
      new THREE.MeshStandardMaterial({ color: '#2b6f73', roughness: 0.08, metalness: 0.1, normalMap: this.waterNormal, normalScale: new THREE.Vector2(0.4, 0.4) }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, 0.05, z);
    pool.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.RingGeometry(2.9, 4.4, 40), new THREE.MeshStandardMaterial({ color: '#5d7a3a', roughness: 0.9 }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(x, 0.03, z);
    rim.receiveShadow = true;
    g.add(pool, rim);
    // Reeds around the water.
    const colors = look.grass ?? { base: '#5d6a2c', tip: '#b8a75a' };
    const reeds = new THREE.InstancedMesh(tuftGeometry(9, 3, new THREE.Color(colors.base), new THREE.Color(colors.tip), 17), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 }), 22);
    const m = new THREE.Matrix4();
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2 + jitter(k, 9) * 0.3;
      const r = 3.1 + jitter(k, 10) * 0.9;
      const h = 0.8 + jitter(k, 11) * 0.7;
      m.compose(new THREE.Vector3(x + Math.cos(a) * r, 0, z + Math.sin(a) * r), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a), new THREE.Vector3(0.8, h, 0.8));
      reeds.setMatrixAt(k, m);
    }
    g.add(reeds);
    for (const s of [-1, 1]) {
      const tree = new THREE.Group();
      tree.position.set(x + s * 5, 0, z + 0.5);
      loadModel('quiver_tree_02')
        .then((model) => {
          model.scale.setScalar(4.5);
          model.traverse((o) => {
            if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true;
          });
          tree.add(model);
        })
        .catch((err: unknown) => console.warn('Oasis tree failed to load', err));
      g.add(tree);
    }
    this.gateGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#cfeee4', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    this.gateGlow.position.set(x, 1.4, z);
    this.gateGlow.scale.set(7, 3.5, 1);
    g.add(this.gateGlow);
    this.oasis = true;
    this.group.add(g);
  }

  /** Swamp's exit: a short jetty at the north edge with a rowboat tied alongside; its lantern lights when the boat is ready. */
  private buildBoat(world: World, look: TerrainLook): void {
    const { grid, gate } = world;
    const plankSet = look.planks ?? look.wall;
    const planks = pbrMaterial(plankSet);
    const dark = pbrMaterial(plankSet, '#6d5a48');
    const x = cellToWorld(grid, gate.x);
    const z = cellToWorld(grid, gate.z);
    const g = new THREE.Group();
    const deck = new THREE.Mesh(worldUvBox(2.2, 0.16, 4.2, plankSet.tile), planks);
    deck.position.set(x, 0.32, z - 0.4);
    deck.castShadow = deck.receiveShadow = true;
    g.add(deck);
    for (const [dx, dz] of [[-1, -2.3], [1, -2.3], [-1, 1.4], [1, 1.4]]) {
      const post = new THREE.Mesh(worldUvBox(0.2, 1.1, 0.2, plankSet.tile), dark);
      post.position.set(x + dx, 0.45, z + dz);
      post.castShadow = true;
      g.add(post);
    }
    const boat = boatModel(planks, dark);
    boat.position.set(x + 2.1, 0.02, z - 0.8);
    boat.rotation.y = 0.12;
    g.add(boat);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.4, 8), dark);
    pole.position.set(x - 1, 1.5, z + 1.4);
    g.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.26), new THREE.MeshStandardMaterial({ color: '#3a3a30', emissive: '#ffb84a', emissiveIntensity: 0 }));
    lamp.position.set(x - 1, 2.85, z + 1.4);
    g.add(lamp);
    this.boatLamp = lamp.material as THREE.MeshStandardMaterial;
    this.gateGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#ffd18a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    this.gateGlow.position.copy(lamp.position);
    this.gateGlow.scale.setScalar(3.4);
    g.add(this.gateGlow);
    this.group.add(g);
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
      // Relics turn and bob; the map board stands still.
      if (world.level.goal.kind === 'mapThenExit') continue;
      m.rotation.y += dt * 0.8;
      m.children.forEach((c, k) => {
        if (k > 0 && !(c instanceof THREE.Sprite)) c.position.y += Math.sin(now * 0.003) * 0.0006;
      });
    }
    // Lanterns light as you reach them (they are no longer in world.relics) and flicker.
    if (this.lanterns.size) {
      const unlit = new Set(world.relics.map((r) => `${r.x},${r.z}`));
      let k = 0;
      for (const [key, l] of this.lanterns) {
        l.lit = !unlit.has(key);
        const flick = 0.85 + 0.15 * Math.sin(now * 0.011 + k * 1.7) * Math.sin(now * 0.0037 + k);
        l.glass.emissiveIntensity = l.lit ? 2.4 * flick : 0;
        l.glass.color.set(l.lit ? '#ffe2a8' : '#3a3a30');
        (l.glow.material as THREE.SpriteMaterial).opacity = l.lit ? 0.6 * flick : 0;
        k++;
      }
    }
    // The oasis shimmers once every flask is found.
    if (this.oasis && this.gateGlow) (this.gateGlow.material as THREE.SpriteMaterial).opacity = world.gateOpen ? 0.45 + 0.15 * Math.sin(now * 0.003) : 0;
    // The boat's lamp comes on when every lantern is lit.
    if (this.boatLamp && this.gateGlow) {
      this.boatLamp.emissiveIntensity = world.gateOpen ? 2.4 : 0;
      (this.gateGlow.material as THREE.SpriteMaterial).opacity = world.gateOpen ? 0.7 + 0.1 * Math.sin(now * 0.004) : 0;
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

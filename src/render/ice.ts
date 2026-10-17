import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Quality } from '../settings';
import { cellToWorld } from '../sim/grid';
import { createRng } from '../sim/rng';
import { Tile } from '../sim/tiles';
import type { World } from '../sim/types';
import { waterNormalTexture } from './layoutViews';

/** Snowflakes drifting down around you. */
const FLAKES: Record<Quality, number> = { high: 700, low: 250 };
const FLAKE_BOX = 30;

/**
 * Crack lines on transparent (made in code): a few long jagged cracks branching out from near the
 * middle. Tiles across a cell; used darkly on cracked ice and brightly as the spreading cracks.
 */
function crackTexture(seed: number, color: string, width: number): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const rng = createRng(seed);
  if (g) {
    g.strokeStyle = color;
    g.lineCap = 'round';
    const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x, y);
      let px = x;
      let py = y;
      const steps = 6;
      for (let k = 0; k < steps; k++) {
        a += (rng.next() - 0.5) * 0.8;
        px += Math.cos(a) * (len / steps);
        py += Math.sin(a) * (len / steps);
        g.lineTo(px, py);
        if (depth > 0 && rng.next() < 0.3) branch(px, py, a + (rng.next() < 0.5 ? 1 : -1) * (0.6 + rng.next() * 0.6), len * 0.5, w * 0.6, depth - 1);
      }
      g.stroke();
    };
    const cx = s * (0.4 + rng.next() * 0.2);
    const cy = s * (0.4 + rng.next() * 0.2);
    const arms = 5 + Math.floor(rng.next() * 3);
    for (let k = 0; k < arms; k++) branch(cx, cy, (k / arms) * Math.PI * 2 + rng.next() * 0.5, s * (0.35 + rng.next() * 0.25), width, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A faint scratched pattern for the ice's sheen (made in code): fine skate-mark-like scratches. */
function scratchTexture(): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const rng = createRng(91);
  if (g) {
    g.fillStyle = '#d9e4ea';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(220,235,245,0.45)';
    for (let k = 0; k < 70; k++) {
      g.lineWidth = 0.6 + rng.next();
      const x = rng.next() * s;
      const y = rng.next() * s;
      const a = rng.next() * Math.PI;
      const l = 20 + rng.next() * 80;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (rng.next() - 0.5) * 20, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * The frozen lake, drawn from the world's tiles: glossy pale ice, darker cracked ice with its cracks
 * showing, cracks spreading white across a patch that is giving way, holes of dark open water with
 * broken chunks of ice bobbing in them, and snow drifting down. Rebuilt when a patch breaks. Render only.
 */
export class IceViews {
  readonly group = new THREE.Group();
  private readonly surface = new THREE.Group();
  private readonly iceMat: THREE.MeshStandardMaterial;
  private readonly crackedMat: THREE.MeshStandardMaterial;
  private readonly holeMat: THREE.MeshStandardMaterial;
  private readonly chunkMat = new THREE.MeshStandardMaterial({ color: '#dbe9f2', roughness: 0.15, metalness: 0 });
  private readonly spreadTex = crackTexture(7, 'rgba(255,255,255,0.95)', 3);
  private readonly spreading = new Map<number, THREE.Mesh>();
  private readonly chunks: Array<{ mesh: THREE.Mesh; phase: number; y: number }> = [];
  private readonly flakes: THREE.Points;
  private readonly flakeBase: Float32Array;
  private readonly ripple = waterNormalTexture();
  private seen: Uint8Array;

  private constructor(private readonly world: World, quality: Quality) {
    // Blue-grey ice, clearly darker than the snow on the shore; cracked ice darker still.
    this.iceMat = new THREE.MeshStandardMaterial({ color: '#8fb2c6', map: scratchTexture(), roughness: 0.06, metalness: 0 });
    this.crackedMat = new THREE.MeshStandardMaterial({ color: '#5f7d90', map: crackTexture(3, 'rgba(225,238,246,0.85)', 2.5), roughness: 0.14, metalness: 0 });
    // Open water: near-black and not a mirror (a glossy surface would only show the white sky).
    this.holeMat = new THREE.MeshStandardMaterial({ color: '#05090c', roughness: 0.32, metalness: 0, normalMap: this.ripple, normalScale: new THREE.Vector2(0.3, 0.3) });
    this.group.add(this.surface);
    this.seen = new Uint8Array(world.tiles);
    this.rebuild();

    const count = FLAKES[quality];
    this.flakeBase = new Float32Array(count * 3);
    const rng = createRng(17);
    for (let i = 0; i < count; i++) {
      this.flakeBase[i * 3] = rng.next() * FLAKE_BOX;
      this.flakeBase[i * 3 + 1] = rng.next() * 12;
      this.flakeBase[i * 3 + 2] = rng.next() * FLAKE_BOX;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const dot = document.createElement('canvas');
    dot.width = dot.height = 16;
    const dg = dot.getContext('2d');
    if (dg) {
      const grad = dg.createRadialGradient(8, 8, 0, 8, 8, 8);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      dg.fillStyle = grad;
      dg.fillRect(0, 0, 16, 16);
    }
    this.flakes = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.09, map: new THREE.CanvasTexture(dot), transparent: true, depthWrite: false, opacity: 0.9 }));
    this.flakes.frustumCulled = false;
    this.group.add(this.flakes);
  }

  /** The ice for this world, or null when the level has none. */
  static build(world: World, quality: Quality): IceViews | null {
    return world.tiles.some((t) => t === Tile.Ice || t === Tile.CrackedIce) ? new IceViews(world, quality) : null;
  }

  /** (Re)build the ice, cracked-ice and hole surfaces from the tiles; add chunks to new holes. */
  private rebuild(): void {
    const { grid, tiles } = this.world;
    const n = grid.size;
    const c = grid.cell;
    for (const m of [...this.surface.children]) {
      this.surface.remove(m);
      (m as THREE.Mesh).geometry.dispose();
    }
    const quad = (i: number, y: number, tile: number) => {
      const x = i % n;
      const z = (i / n) | 0;
      const g = new THREE.PlaneGeometry(c, c);
      g.rotateX(-Math.PI / 2);
      g.translate(cellToWorld(grid, x), y, cellToWorld(grid, z));
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, ((x + uv.getX(k)) * c) / tile, ((z + uv.getY(k)) * c) / tile);
      return g;
    };
    const ice: THREE.BufferGeometry[] = [];
    const cracked: THREE.BufferGeometry[] = [];
    const holes: THREE.BufferGeometry[] = [];
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] === Tile.Ice) ice.push(quad(i, 0.02, 8));
      else if (tiles[i] === Tile.CrackedIce) cracked.push(quad(i, 0.021, c));
      // The arena's ground plane is at 0, so open water is drawn just above it (and under the ice's level).
      else if (tiles[i] === Tile.Hole) holes.push(quad(i, 0.012, 4));
    }
    const add = (geos: THREE.BufferGeometry[], mat: THREE.Material) => {
      if (!geos.length) return;
      const m = new THREE.Mesh(mergeGeometries(geos), mat);
      m.receiveShadow = true;
      this.surface.add(m);
    };
    add(ice, this.iceMat);
    add(cracked, this.crackedMat);
    add(holes, this.holeMat);
  }

  /** Broken chunks of ice floating in a fresh hole. */
  private addChunks(i: number): void {
    const { grid } = this.world;
    const n = grid.size;
    const rng = createRng(i * 31 + 5);
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.4 + rng.next() * 0.5, 0.12, 0.3 + rng.next() * 0.5), this.chunkMat);
      m.position.set(cellToWorld(grid, i % n) + (rng.next() - 0.5) * 1.4, 0.04, cellToWorld(grid, (i / n) | 0) + (rng.next() - 0.5) * 1.4);
      m.rotation.set((rng.next() - 0.5) * 0.4, rng.next() * 6, (rng.next() - 0.5) * 0.4);
      m.castShadow = true;
      this.chunks.push({ mesh: m, phase: rng.next() * 6, y: 0.04 });
      this.group.add(m);
    }
  }

  update(camera: THREE.Camera, now: number): void {
    const { tiles } = this.world;
    // A patch broke: rebuild the surfaces and drop chunks into the new holes.
    let changed = false;
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] === this.seen[i]) continue;
      if (tiles[i] === Tile.Hole) this.addChunks(i);
      changed = true;
    }
    if (changed) {
      this.seen = new Uint8Array(tiles);
      this.rebuild();
    }
    // Cracks spreading white over the cells that are giving way.
    const live = new Set<number>();
    const { grid } = this.world;
    const n = grid.size;
    for (const c of this.world.cracking) {
      live.add(c.i);
      let m = this.spreading.get(c.i);
      if (!m) {
        m = new THREE.Mesh(new THREE.PlaneGeometry(grid.cell, grid.cell), new THREE.MeshBasicMaterial({ map: this.spreadTex, transparent: true, depthWrite: false }));
        m.rotation.x = -Math.PI / 2;
        m.position.set(cellToWorld(grid, c.i % n), 0.03, cellToWorld(grid, (c.i / n) | 0));
        this.spreading.set(c.i, m);
        this.group.add(m);
      }
      const k = 0.35 + 0.65 * c.t;
      m.scale.setScalar(k * 1.15);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.6 * c.t;
    }
    for (const [i, m] of this.spreading) {
      if (live.has(i)) continue;
      this.group.remove(m);
      (m.material as THREE.Material).dispose();
      this.spreading.delete(i);
    }
    const t = now / 1000;
    for (const ch of this.chunks) ch.mesh.position.y = ch.y + Math.sin(t * 1.6 + ch.phase) * 0.03;
    this.ripple.offset.set((t * 0.01) % 1, (t * 0.017) % 1);
    // Snow drifting down in a box that follows the camera.
    const pos = this.flakes.geometry.getAttribute('position') as THREE.BufferAttribute;
    const cx = camera.position.x - FLAKE_BOX / 2;
    const cz = camera.position.z - FLAKE_BOX / 2;
    const wrap = (v: number, m: number) => ((v % m) + m) % m;
    for (let i = 0; i < pos.count; i++) {
      const y = wrap(this.flakeBase[i * 3 + 1] - t * 0.9, 12);
      pos.setXYZ(
        i,
        cx + wrap(this.flakeBase[i * 3] + Math.sin(t * 0.7 + i) * 0.6 - cx, FLAKE_BOX),
        y,
        cz + wrap(this.flakeBase[i * 3 + 2] + Math.cos(t * 0.5 + i) * 0.6 - cz, FLAKE_BOX),
      );
    }
    pos.needsUpdate = true;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) o.geometry.dispose();
    });
    this.ripple.dispose();
  }
}

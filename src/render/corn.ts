import * as THREE from 'three';
import { BALANCE } from '../config/balance';
import type { Quality } from '../settings';
import { createRng } from '../sim/rng';
import type { Rng } from '../sim/rng';
import { Tile } from '../sim/tiles';
import type { World } from '../sim/types';
import { addWindSway } from './grass';
import type { CornColors, TerrainLook } from './terrains';

/** Free-standing 3D corn plants per wall cell, in front of the painted rows (for depth up close). */
const PLANTS: Record<Quality, number> = { high: 2, low: 1 };
/** The painted rows stand a little taller than the wall height, tassels on top. */
const CARD_HEIGHT = BALANCE.arena.cornHeight + 0.15;

const hex = (c: THREE.Color, k = 1) => `rgb(${Math.round(Math.min(1, c.r * k) * 255)},${Math.round(Math.min(1, c.g * k) * 255)},${Math.round(Math.min(1, c.b * k) * 255)})`;

/**
 * A painted strip of corn row (made in code): many stalks with long arching leaves, darker and
 * denser low down, dry gold toward the tassels. Transparent between the plants (alpha cut-out).
 * Spans 2 world units across and `CARD_HEIGHT` up.
 */
function cornRowTexture(colors: CornColors, rng: Rng): THREE.CanvasTexture {
  const w = 256;
  const h = 360;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const stalk = new THREE.Color(colors.stalk);
  const leaf = new THREE.Color(colors.leaf);
  const dry = new THREE.Color(colors.dry);
  const core = new THREE.Color(colors.core ?? '#2a3318');
  const tmp = new THREE.Color();
  if (g) {
    // A dense, dark understory at the bottom: the shade deep in the row.
    const under = g.createLinearGradient(0, h, 0, h * 0.25);
    under.addColorStop(0, hex(core, 0.8));
    under.addColorStop(0.7, hex(core, 1));
    under.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = under;
    g.fillRect(0, h * 0.25, w, h * 0.75);
    // Three layers of plants, back (darker) to front (lighter).
    for (let layer = 0; layer < 3; layer++) {
      const shade = 0.55 + layer * 0.22;
      const count = 9 + layer * 3;
      for (let k = 0; k < count; k++) {
        const x = (k + rng.next()) * (w / count);
        const top = h * (0.04 + rng.next() * 0.1);
        const lean = (rng.next() - 0.5) * 18;
        tmp.copy(stalk).lerp(dry, rng.next() * 0.4);
        g.strokeStyle = hex(tmp, shade);
        g.lineWidth = 3 + rng.next() * 2;
        g.beginPath();
        g.moveTo(x, h);
        g.quadraticCurveTo(x + lean * 0.3, h * 0.5, x + lean, top);
        g.stroke();
        // Leaves: tapered arcs out to either side, drooping at the tips.
        const leaves = 6 + Math.floor(rng.next() * 3);
        for (let l = 0; l < leaves; l++) {
          const t = 0.2 + (l / leaves) * 0.7 + rng.next() * 0.05;
          const y = h - (h - top) * t;
          const lx = x + lean * t;
          const side = l % 2 ? 1 : -1;
          const len = 40 + rng.next() * 45;
          tmp.copy(leaf).lerp(dry, Math.min(1, rng.next() * 0.5 + t * 0.45));
          g.fillStyle = hex(tmp, shade);
          g.beginPath();
          g.moveTo(lx, y);
          g.quadraticCurveTo(lx + side * len * 0.5, y - len * 0.45, lx + side * len, y + len * 0.25);
          g.quadraticCurveTo(lx + side * len * 0.45, y - len * 0.2, lx, y + 6);
          g.fill();
        }
        // Tassel.
        g.strokeStyle = hex(dry, shade * 1.1);
        g.lineWidth = 1.5;
        for (let s = 0; s < 4; s++) {
          g.beginPath();
          g.moveTo(x + lean, top);
          g.lineTo(x + lean + (s - 1.5) * 5, top - 14 - rng.next() * 8);
          g.stroke();
        }
        // An ear on some plants.
        if (rng.next() < 0.5) {
          g.fillStyle = hex(new THREE.Color(colors.ear), shade);
          g.beginPath();
          g.ellipse(x + lean * 0.5 + 5, h * 0.45, 4, 13, 0.3, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * One free-standing corn plant in meters: a stalk, long leaves arching out and drooping, an ear in
 * its husk and a tassel on top. Vertex colors: dry green low down to straw gold at the top.
 */
function plantGeometry(colors: CornColors, seed: number, quality: Quality): THREE.BufferGeometry {
  const rng = createRng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const height = BALANCE.arena.cornHeight;
  const stalkC = new THREE.Color(colors.stalk);
  const leafC = new THREE.Color(colors.leaf);
  const dryC = new THREE.Color(colors.dry);
  const tmp = new THREE.Color();
  const paint = (g: THREE.BufferGeometry, colorAt: (y: number) => THREE.Color) => {
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const c = colorAt(pos.getY(i));
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  };
  const stalk = new THREE.CylinderGeometry(0.014, 0.024, height, quality === 'high' ? 6 : 4, 3, true);
  stalk.translate(0, height / 2, 0);
  parts.push(paint(stalk, (y) => tmp.copy(stalkC).lerp(dryC, (y / height) * 0.6)));
  const leaves = quality === 'high' ? 8 : 5;
  const segs = quality === 'high' ? 4 : 3;
  for (let k = 0; k < leaves; k++) {
    const y0 = height * (0.16 + (k / leaves) * 0.64);
    const yaw = k * 2.4 + rng.next() * 0.6;
    const len = 0.6 + rng.next() * 0.35;
    const w = 0.045 + rng.next() * 0.02;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const out = t * len;
      const up = Math.sin(t * Math.PI * 0.8) * len * 0.35 - t * t * len * 0.3;
      const half = w * Math.sin(Math.PI * Math.min(0.95, 0.15 + t * 0.85));
      pos.push(out, y0 + up, -half, out, y0 + up, half);
      if (s < segs) {
        const a = s * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.rotateY(yaw);
    g.computeVertexNormals();
    const dryness = rng.next() * 0.5 + (k / leaves) * 0.4;
    parts.push(paint(g, () => tmp.copy(leafC).lerp(dryC, dryness)));
  }
  const ear = new THREE.CylinderGeometry(0.028, 0.02, 0.2, 6, 1);
  ear.rotateZ(0.35);
  ear.translate(0.05, height * 0.55, 0);
  parts.push(paint(ear, () => tmp.set(colors.ear)));
  for (let k = 0; k < 4; k++) {
    const t = new THREE.ConeGeometry(0.008, 0.28, 3, 1);
    t.rotateZ((k - 1.5) * 0.35);
    t.rotateY(k * 1.3);
    t.translate(0, height + 0.1, 0);
    parts.push(paint(t, () => tmp.copy(dryC).multiplyScalar(1.1)));
  }
  return mergeParts(parts);
}

/** Merge geometries that all have position, normal and color (indexed or not). */
function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (const g of parts) {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    const c = g.getAttribute('color') as THREE.BufferAttribute;
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(c.getX(i), c.getY(i), c.getZ(i));
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) idx.push(base + i);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  return out;
}

/**
 * The corn maze walls. Every Corn cell is a stand of corn: painted rows of plants (cut-out cards)
 * along each face toward open ground and crossed inside the cell, a dark mass behind them so the
 * wall is solid to the eye as it is to you, and a few real 3D plants in front for depth up close.
 * Everything sways in the wind. Render only.
 */
export class CornField {
  readonly group = new THREE.Group();
  private readonly uTime = { value: 0 };
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly textures: THREE.Texture[] = [];

  private constructor(world: World, look: TerrainLook, quality: Quality, cells: number[]) {
    const n = world.grid.size;
    const { cell, half } = world.grid;
    const colors = look.corn ?? { stalk: '#5f6a2c', leaf: '#6f7d32', dry: '#c9ad62', ear: '#d8bd6a' };
    const height = BALANCE.arena.cornHeight;
    const isCorn = (x: number, z: number) => x < 0 || z < 0 || x >= n || z >= n || world.tiles[z * n + x] === Tile.Corn;
    const rng = createRng(world.level.size * 977 + cells.length);

    // Painted rows: two textures so neighbouring faces differ.
    const cardMats = [0, 1].map(() => {
      const tex = cornRowTexture(colors, rng);
      this.textures.push(tex);
      const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
      addWindSway(m, this.uTime, CARD_HEIGHT, 0.06);
      return m;
    });
    const cardGeo = new THREE.PlaneGeometry(cell * 1.15, CARD_HEIGHT);
    cardGeo.translate(0, CARD_HEIGHT / 2, 0);
    // Faces toward open ground, plus two crossed cards inside each cell.
    const cards: Array<{ x: number; z: number; yaw: number }> = [];
    for (const i of cells) {
      const cx = i % n;
      const cz = (i / n) | 0;
      const x = (cx + 0.5) * cell - half;
      const z = (cz + 0.5) * cell - half;
      const inset = cell * 0.5 - 0.12;
      if (!isCorn(cx + 1, cz)) cards.push({ x: x + inset, z, yaw: Math.PI / 2 });
      if (!isCorn(cx - 1, cz)) cards.push({ x: x - inset, z, yaw: Math.PI / 2 });
      if (!isCorn(cx, cz + 1)) cards.push({ x, z: z + inset, yaw: 0 });
      if (!isCorn(cx, cz - 1)) cards.push({ x, z: z - inset, yaw: 0 });
      cards.push({ x, z, yaw: Math.PI / 4 + (rng.next() - 0.5) * 0.3 });
      cards.push({ x, z, yaw: -Math.PI / 4 + (rng.next() - 0.5) * 0.3 });
    }
    const cardMeshes = cardMats.map((mat) => new THREE.InstancedMesh(cardGeo, mat, cards.length));
    const used = [0, 0];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (const c of cards) {
      const k = rng.next() < 0.5 ? 0 : 1;
      q.setFromAxisAngle(up, c.yaw + (rng.next() < 0.5 ? Math.PI : 0));
      m.compose(p.set(c.x, 0, c.z), q, s.set(1, 0.94 + rng.next() * 0.12, 1));
      cardMeshes[k].setMatrixAt(used[k]++, m);
    }
    cardMeshes.forEach((cm, k) => {
      cm.count = used[k];
      cm.castShadow = quality === 'high';
      cm.receiveShadow = true;
      cm.instanceMatrix.needsUpdate = true;
      cm.computeBoundingSphere();
      this.meshes.push(cm);
      this.group.add(cm);
    });
    if (quality === 'high') {
      // Cut-out shadows: the shadow pass needs the texture's alpha too.
      cardMeshes.forEach((cm, k) => {
        cm.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: cardMats[k].map, alphaTest: 0.45 });
      });
    }

    // The dark mass deep inside each wall cell, only ever seen through gaps between the plants.
    const coreGeo = new THREE.BoxGeometry(1, 1, 1);
    coreGeo.translate(0, 0.5, 0);
    const core = new THREE.InstancedMesh(coreGeo, new THREE.MeshStandardMaterial({ color: colors.core ?? '#29321a', roughness: 1, metalness: 0 }), cells.length);
    cells.forEach((i, k) => {
      m.compose(p.set((i % n + 0.5) * cell - half, 0, (((i / n) | 0) + 0.5) * cell - half), q.identity(), s.set(cell * 0.55, height * 0.8, cell * 0.55));
      core.setMatrixAt(k, m);
    });
    core.instanceMatrix.needsUpdate = true;
    core.computeBoundingSphere();
    this.meshes.push(core);
    this.group.add(core);

    // A few real plants along the faces, for depth when you walk past.
    const plantMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8, metalness: 0 });
    addWindSway(plantMat, this.uTime, height, 0.09);
    const plantGeo = plantGeometry(colors, 11, quality);
    const faces = cards.filter((c) => Math.abs(c.yaw) < 1e-6 || Math.abs(c.yaw - Math.PI / 2) < 1e-6);
    const per = PLANTS[quality];
    const plants = new THREE.InstancedMesh(plantGeo, plantMat, faces.length * per);
    const tint = new THREE.Color();
    let k = 0;
    for (const f of faces) {
      for (let j = 0; j < per; j++) {
        // Along the face, just in front of it.
        const along = (rng.next() - 0.5) * cell * 0.9;
        const ax = f.yaw === 0 ? along : 0;
        const az = f.yaw === 0 ? 0 : along;
        p.set(f.x + ax, 0, f.z + az);
        q.setFromAxisAngle(up, rng.next() * Math.PI * 2);
        const sc = 0.9 + rng.next() * 0.2;
        m.compose(p, q, s.set(sc, sc, sc));
        plants.setMatrixAt(k, m);
        tint.setRGB(1, 1, 1).lerp(new THREE.Color(rng.next() < 0.5 ? 0xd8f0c0 : 0xffe9b8), rng.next() * 0.5);
        plants.setColorAt(k++, tint);
      }
    }
    plants.castShadow = quality === 'high';
    plants.receiveShadow = true;
    plants.instanceMatrix.needsUpdate = true;
    if (plants.instanceColor) plants.instanceColor.needsUpdate = true;
    plants.computeBoundingSphere();
    this.meshes.push(plants);
    this.group.add(plants);
  }

  /** The corn for this world, or null when the level has none. */
  static build(world: World, look: TerrainLook, quality: Quality): CornField | null {
    const cells: number[] = [];
    world.tiles.forEach((t, i) => {
      if (t === Tile.Corn) cells.push(i);
    });
    return cells.length ? new CornField(world, look, quality, cells) : null;
  }

  update(now: number): void {
    this.uTime.value = now / 1000;
  }

  dispose(): void {
    for (const m of this.meshes) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
    for (const t of this.textures) t.dispose();
  }
}

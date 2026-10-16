import * as THREE from 'three';
import { BALANCE } from '../config/balance';
import type { Vec2 } from '../sim/types';
import { fleshTexture, SKIN_TILE_SEGMENTS, snakeSkin } from './skin';

export type FrontEnd = 'head' | 'cut';
export type BackEnd = 'tail' | 'cut';

/** Vertices around the body (one extra closes the texture seam). */
const RADIAL = 18;
const RING = RADIAL + 1;
/**
 * The body sits inside the collision boxes: body box half-width 0.85 and 2.2 tall
 * (BALANCE.snake.bodyHeight); the last 4 (tail) boxes 0.7 tall.
 */
const BODY_HALF_W = 0.8;
/** Body top = 1.8 * half height + clearance, about 1.9: above your eyes (1.6) and the jump apex (1.2). */
const BODY_HALF_H = 1.04;
const TAIL_HALF_W = 0.42;
const TAIL_HALF_H = 0.36;
/**
 * The body narrows into the low tail over this many segments before it (rather than in one step,
 * which read as a chopped-off end). Halfway through, the body is still about 1.5 tall: unjumpable.
 */
const TAIL_TAPER_SEGMENTS = 1.5;
/** How far the pointed tip reaches past the last segment's center, in segments. */
const TAIL_TIP = 0.8;
/** With a head in front, the tube starts inside the head (closed, so no open end shows) and widens into the neck. */
const NECK_START = 0.35;
const NECK_HALF_W = 0.68;
const NECK_HALF_H = 0.84;
const NECK_LENGTH = 1.8;
/** The first bit of the tube is rounded shut over this length (segments). */
const NECK_DOME = 0.25;
/** The belly is flatter than the back; the bottom half of the ellipse is squashed by this. */
const BELLY_FLAT = 0.8;
const GROUND_CLEARANCE = 0.02;
/**
 * A gentle side-to-side wave fixed to the track the body slides along (its phase follows the body's
 * material coordinate), so it only moves when the snake moves, as a real snake's body follows its path.
 */
const SLITHER_AMPLITUDE = 0.035;
const SLITHER_WAVELENGTH = 3;
const TIP_RADIUS = 0.02;

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * One continuous snake body drawn as a tube through the segment centers. It owns a fixed-size
 * vertex buffer and refills it every frame, so nothing is allocated per frame.
 */
export class SnakeBody {
  readonly mesh: THREE.Mesh;
  private readonly frontCap: THREE.Mesh;
  private readonly backCap: THREE.Mesh;
  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  private readonly uvs: Float32Array;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly maxRings: number;
  private readonly ringsPerSegment: number;
  // Scratch centerline samples.
  private readonly cx: Float32Array;
  private readonly cz: Float32Array;

  constructor(maxSegments: number, ringsPerSegment: number) {
    this.ringsPerSegment = ringsPerSegment;
    this.maxRings = (maxSegments + 2) * ringsPerSegment + 2;
    const verts = this.maxRings * RING;
    this.positions = new Float32Array(verts * 3);
    this.normals = new Float32Array(verts * 3);
    this.uvs = new Float32Array(verts * 2);
    this.cx = new Float32Array(this.maxRings);
    this.cz = new Float32Array(this.maxRings);
    const index = new Uint32Array((this.maxRings - 1) * RADIAL * 6);
    let k = 0;
    for (let r = 0; r < this.maxRings - 1; r++) {
      for (let j = 0; j < RADIAL; j++) {
        const a = r * RING + j;
        const b = (r + 1) * RING + j;
        const c = a + 1;
        const d = b + 1;
        index[k++] = a;
        index[k++] = c;
        index[k++] = b;
        index[k++] = c;
        index[k++] = d;
        index[k++] = b;
      }
    }
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1));
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2).setUsage(THREE.DynamicDrawUsage));
    const skin = snakeSkin();
    this.mesh = new THREE.Mesh(
      this.geometry,
      new THREE.MeshStandardMaterial({ map: skin.map, normalMap: skin.normalMap, roughness: 0.5, metalness: 0 }),
    );
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    // The geometry changes every frame; skip culling instead of recomputing bounds.
    this.mesh.frustumCulled = false;

    const flesh = new THREE.MeshStandardMaterial({ map: fleshTexture(), roughness: 0.35, metalness: 0 });
    const capGeo = new THREE.CircleGeometry(1, 28);
    this.frontCap = new THREE.Mesh(capGeo, flesh);
    this.backCap = new THREE.Mesh(capGeo, flesh);
    for (const cap of [this.frontCap, this.backCap]) {
      cap.visible = false;
      this.mesh.add(cap);
    }
  }

  /** Half width and half height of the body at `s` segments from the head. */
  private profile(s: number, length: number, sEnd: number, front: FrontEnd, back: BackEnd): [number, number] {
    let hw = BODY_HALF_W;
    let hh = BODY_HALF_H;
    if (back === 'tail') {
      // The last `jumpableTail` segments are low: drop to tail size across the half segment before them.
      const lowFrom = length - BALANCE.snake.jumpableTail;
      const k = smooth(lowFrom - 0.5 - TAIL_TAPER_SEGMENTS, lowFrom - 0.5, s);
      hw += (TAIL_HALF_W - hw) * k;
      hh += (TAIL_HALF_H - hh) * k;
      // Then taper to a point.
      const tip = smooth(lowFrom - 0.5, sEnd, s);
      hw += (TIP_RADIUS - hw) * tip;
      hh += (TIP_RADIUS - hh) * tip;
    }
    if (front === 'head') {
      const k = smooth(NECK_START, NECK_LENGTH, s);
      hw = Math.min(hw, NECK_HALF_W + (BODY_HALF_W - NECK_HALF_W) * k);
      hh = Math.min(hh, NECK_HALF_H + (BODY_HALF_H - NECK_HALF_H) * k);
      // Round the start shut (it sits inside the head).
      const dome = Math.sqrt(smooth(NECK_START, NECK_START + NECK_DOME, s));
      hw *= Math.max(0.05, dome);
      hh *= Math.max(0.05, dome);
    }
    return [hw, hh];
  }

  /**
   * Rebuild the body. `materialHead` is how many segments of body have moved past a fixed point
   * (it grows by one per snake step); texture coordinates follow it, so the scales travel with the body.
   */
  update(pos: Vec2[], materialHead: number, front: FrontEnd = 'head', back: BackEnd = 'tail'): void {
    const length = pos.length;
    if (length < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }
    const sStart = front === 'head' ? NECK_START : 0;
    const sEnd = length - 1 + (back === 'tail' ? TAIL_TIP : 0);
    const rings = Math.min(this.maxRings, Math.ceil((sEnd - sStart) * this.ringsPerSegment) + 1);
    const { cx, cz } = this;
    // Past the tail, continue straight along the last real direction. A segment that just grew sits
    // on top of the one before it, so look back for the first point that is actually apart.
    const last = pos[length - 1];
    let dirX = 1;
    let dirZ = 0;
    for (let k = length - 2; k >= 0; k--) {
      const ddx = last.x - pos[k].x;
      const ddz = last.z - pos[k].z;
      const dl = Math.hypot(ddx, ddz);
      if (dl > 0.05) {
        dirX = ddx / dl;
        dirZ = ddz / dl;
        break;
      }
    }
    const cell = BALANCE.cellSize;
    // Centerline: uniform Catmull-Rom through the segment centers, extrapolated past both ends.
    const px = (i: number): number => {
      if (i < 0) return 2 * pos[0].x - pos[1].x;
      if (i >= length) return last.x + dirX * cell * (i - length + 1);
      return pos[i].x;
    };
    const pz = (i: number): number => {
      if (i < 0) return 2 * pos[0].z - pos[1].z;
      if (i >= length) return last.z + dirZ * cell * (i - length + 1);
      return pos[i].z;
    };
    for (let r = 0; r < rings; r++) {
      const s = sStart + (r / (rings - 1)) * (sEnd - sStart);
      const i = Math.min(Math.floor(s), length - 1);
      const t = s - i;
      const t2 = t * t;
      const t3 = t2 * t;
      const w0 = -0.5 * t3 + t2 - 0.5 * t;
      const w1 = 1.5 * t3 - 2.5 * t2 + 1;
      const w2 = -1.5 * t3 + 2 * t2 + 0.5 * t;
      const w3 = 0.5 * t3 - 0.5 * t2;
      cx[r] = w0 * px(i - 1) + w1 * px(i) + w2 * px(i + 1) + w3 * px(i + 2);
      cz[r] = w0 * pz(i - 1) + w1 * pz(i) + w2 * pz(i + 1) + w3 * pz(i + 2);
    }

    let tx = 1;
    let tz = 0;
    for (let r = 0; r < rings; r++) {
      const s = sStart + (r / (rings - 1)) * (sEnd - sStart);
      // Tangent from neighbors; keep the last one if points coincide (a segment that just grew).
      const a = Math.max(0, r - 1);
      const b = Math.min(rings - 1, r + 1);
      const dx = cx[b] - cx[a];
      const dz = cz[b] - cz[a];
      const dl = Math.hypot(dx, dz);
      if (dl > 1e-5) {
        tx = dx / dl;
        tz = dz / dl;
      }
      // Side vector (horizontal, perpendicular to the tangent).
      const sx = tz;
      const sz = -tx;
      const [hw, hh] = this.profile(s, length, sEnd, front, back);
      const sway = SLITHER_AMPLITUDE * (hw / BODY_HALF_W) * smooth(0.5, 2, s) * Math.sin(((materialHead - s) / SLITHER_WAVELENGTH) * Math.PI * 2);
      const ox = cx[r] + sx * sway;
      const oz = cz[r] + sz * sway;
      const oy = hh * BELLY_FLAT + GROUND_CLEARANCE;
      const u = (materialHead - s) / SKIN_TILE_SEGMENTS;
      for (let j = 0; j < RING; j++) {
        const th = (j / RADIAL) * Math.PI * 2;
        const c = Math.cos(th);
        const sn = Math.sin(th);
        const vh = sn < 0 ? hh * BELLY_FLAT : hh;
        const vi = r * RING + j;
        this.positions[vi * 3] = ox + sx * c * hw;
        this.positions[vi * 3 + 1] = oy + sn * vh;
        this.positions[vi * 3 + 2] = oz + sz * c * hw;
        // Ellipse normal in the (side, up) plane.
        const nx = c / hw;
        const ny = sn / vh;
        const nl = Math.hypot(nx, ny);
        this.normals[vi * 3] = (sx * nx) / nl;
        this.normals[vi * 3 + 1] = ny / nl;
        this.normals[vi * 3 + 2] = (sz * nx) / nl;
        this.uvs[vi * 2] = u;
        this.uvs[vi * 2 + 1] = j / RADIAL;
      }
      if (r === 0) this.placeCap(this.frontCap, front === 'cut', ox, oy, oz, -tx, -tz, hw, hh);
      if (r === rings - 1) this.placeCap(this.backCap, back === 'cut', ox, oy, oz, tx, tz, hw, hh);
    }
    this.geometry.setDrawRange(0, (rings - 1) * RADIAL * 6);
    for (const name of ['position', 'normal', 'uv']) (this.geometry.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
  }

  /** A flesh disc closing a cut end, facing along (dx, dz). */
  private placeCap(cap: THREE.Mesh, show: boolean, x: number, y: number, z: number, dx: number, dz: number, hw: number, hh: number): void {
    cap.visible = show;
    if (!show) return;
    cap.position.set(x, y, z);
    cap.rotation.set(0, Math.atan2(dx, dz), 0);
    cap.scale.set(hw, hh * (1 + BELLY_FLAT) * 0.5, 1);
  }

  setShadows(on: boolean): void {
    this.mesh.castShadow = on;
  }
}

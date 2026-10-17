import * as THREE from 'three';
import { BALANCE } from '../config/balance';
import type { Quality } from '../settings';
import { createRng } from '../sim/rng';
import { Tile } from '../sim/tiles';
import type { World } from '../sim/types';
import type { TerrainLook } from './terrains';

/** Tufts per grass cell, and blades per tuft. Low quality is a lot lighter. */
const TUFTS: Record<Quality, number> = { high: 10, low: 6 };
const BLADES: Record<Quality, number> = { high: 11, low: 8 };
const BLADE_SEGMENTS: Record<Quality, number> = { high: 3, low: 2 };
/** How fast the grass settles after something moved through it (per second). */
const SETTLE = 1.6;
/** A moving snake or player shakes the grass this hard (0..1); a still body only bends it a little. */
const MOVING = 1;
const RESTING = 0.35;

/**
 * Plants that sway in the wind: bends an instanced material's vertices sideways by
 * `amount * (y / height)^2`, phased by each instance's position. `uTime` is shared and updated by the caller.
 */
export function addWindSway(mat: THREE.Material, uTime: { value: number }, height: number, amount: number): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        [
          'vec3 transformed = vec3( position );',
          '#ifdef USE_INSTANCING',
          'vec3 wOrigin = ( instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;',
          '#else',
          'vec3 wOrigin = vec3( 0.0 );',
          '#endif',
          `float wBend = pow( max( transformed.y, 0.0 ) / ${height.toFixed(3)}, 2.0 );`,
          `transformed.x += ( sin( uTime * 1.1 + wOrigin.x * 0.21 + wOrigin.z * 0.17 ) + 0.35 * sin( uTime * 2.3 + wOrigin.z * 0.6 ) ) * ${amount.toFixed(3)} * wBend;`,
        ].join('\n'),
      );
  };
}

/**
 * One tuft: blades fanned around its base, each a tapered, slightly curved strip. Unit height:
 * y runs 0..1 from root to tip (the shader bends by y), the tuft is scaled per instance.
 */
export function tuftGeometry(blades: number, segments: number, base: THREE.Color, tip: THREE.Color, seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const pos: number[] = [];
  const col: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  for (let b = 0; b < blades; b++) {
    const yaw = rng.next() * Math.PI * 2;
    const r = 0.08 + rng.next() * 0.28;
    const bx = Math.cos(yaw) * r;
    const bz = Math.sin(yaw) * r;
    const face = yaw + Math.PI / 2 + (rng.next() - 0.5) * 0.8;
    const fx = Math.cos(face);
    const fz = Math.sin(face);
    const height = 0.62 + rng.next() * 0.38;
    const lean = 0.1 + rng.next() * 0.28;
    const width = 0.026 + rng.next() * 0.022;
    // Per blade: a little lighter or darker, a little greener or drier.
    const shade = 0.75 + rng.next() * 0.35;
    const dry = rng.next();
    const start = pos.length / 3;
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const w = width * (1 - t * 0.92);
      const y = t * height;
      // Lean outward from the tuft's centre, more toward the tip.
      const ox = bx + Math.cos(yaw) * lean * t * t;
      const oz = bz + Math.sin(yaw) * lean * t * t;
      // Dark at the root (shade inside the grass), drying toward the tip; some blades stay greener.
      c.copy(base).lerp(tip, Math.pow(t, 1.3) * (0.55 + 0.45 * dry)).multiplyScalar(shade * (0.55 + 0.45 * t));
      for (const side of [-1, 1]) {
        pos.push(ox + fx * w * side, y, oz + fz * w * side);
        col.push(c.r, c.g, c.b);
        // Mostly up, a little outward: blades light like a soft canopy instead of flat cards.
        const n = new THREE.Vector3(Math.cos(yaw) * 0.35, 1, Math.sin(yaw) * 0.35).normalize();
        nor.push(n.x, n.y, n.z);
      }
      if (s < segments) {
        const a = start + s * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/**
 * Shoulder-high grass over every Grass cell: thousands of instanced tufts that sway in the wind and
 * part and shake where something moves through them (render/sim split: it only reads the world).
 */
export class GrassField {
  readonly mesh: THREE.InstancedMesh;
  private readonly disturb: Float32Array;
  private readonly bytes: Uint8Array;
  private readonly texture: THREE.DataTexture;
  private readonly uniforms: { uTime: { value: number }; uDisturb: { value: THREE.DataTexture }; uHalf: { value: number } };
  private readonly last = new Map<number, Float32Array>();
  private lastPlayer = { x: 0, z: 0 };

  private constructor(world: World, look: TerrainLook, quality: Quality, cells: number[]) {
    const n = world.grid.size;
    const { cell, half } = world.grid;
    const colors = look.grass ?? { base: '#3f4a22', tip: '#c9b46c' };
    const geo = tuftGeometry(BLADES[quality], BLADE_SEGMENTS[quality], new THREE.Color(colors.base), new THREE.Color(colors.tip), 77);
    this.disturb = new Float32Array(n * n);
    this.bytes = new Uint8Array(n * n);
    this.texture = new THREE.DataTexture(this.bytes, n, n, THREE.RedFormat, THREE.UnsignedByteType);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
    this.uniforms = { uTime: { value: 0 }, uDisturb: { value: this.texture }, uHalf: { value: half } };

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.88, metalness: 0 });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform sampler2D uDisturb;\nuniform float uHalf;')
        .replace(
          '#include <begin_vertex>',
          [
            'vec3 transformed = vec3( position );',
            '#ifdef USE_INSTANCING',
            'vec3 gOrigin = ( instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;',
            '#else',
            'vec3 gOrigin = vec3( 0.0 );',
            '#endif',
            'float gPush = texture2D( uDisturb, ( gOrigin.xz + uHalf ) / ( 2.0 * uHalf ) ).r;',
            'float gBend = transformed.y * transformed.y;',
            'float gWind = sin( uTime * 1.5 + gOrigin.x * 0.31 + gOrigin.z * 0.23 ) * 0.09 + sin( uTime * 2.9 + gOrigin.x * 0.83 - gOrigin.z * 0.5 ) * 0.03;',
            'float gShake = sin( uTime * 21.0 + gOrigin.x * 7.3 + gOrigin.z * 5.1 ) * 0.2 * gPush;',
            'transformed.x += ( gWind + gShake ) * gBend;',
            // Pushed: the blades bow over and part.
            'transformed.z += 0.4 * gPush * gBend;',
            'transformed.y *= 1.0 - 0.4 * gPush;',
          ].join('\n'),
        );
    };

    const count = cells.length * TUFTS[quality];
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    const rng = createRng(world.level.size * 131 + cells.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const tint = new THREE.Color();
    const greener = new THREE.Color(0.82, 1, 0.78);
    const drier = new THREE.Color(1.08, 1.0, 0.82);
    let k = 0;
    const isGrass = (x: number, z: number) => x >= 0 && z >= 0 && x < n && z < n && world.tiles[z * n + x] === Tile.Grass;
    for (const i of cells) {
      const x = i % n;
      const z = (i / n) | 0;
      // At the edge of a patch the grass is a little shorter, so a patch does not end in a cliff.
      const edge = !isGrass(x + 1, z) || !isGrass(x - 1, z) || !isGrass(x, z + 1) || !isGrass(x, z - 1);
      for (let t = 0; t < TUFTS[quality]; t++) {
        p.set((x + 0.5 + (rng.next() - 0.5) * 0.95) * cell - half, 0, (z + 0.5 + (rng.next() - 0.5) * 0.95) * cell - half);
        q.setFromAxisAngle(up, rng.next() * Math.PI * 2);
        const h = BALANCE.grass.height * (0.85 + rng.next() * 0.25) * (edge ? 0.78 : 1);
        const w = 0.9 + rng.next() * 0.35;
        s.set(w, h, w);
        m.compose(p, q, s);
        // Patchy color: some tufts greener, some drier and paler.
        tint.setRGB(1, 1, 1).lerp(rng.next() < 0.5 ? greener : drier, rng.next() * 0.6);
        this.mesh.setColorAt(k, tint);
        this.mesh.setMatrixAt(k++, m);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.computeBoundingSphere();
  }

  /** The grass for this world, or null when the level has none. */
  static build(world: World, look: TerrainLook, quality: Quality): GrassField | null {
    const cells: number[] = [];
    world.tiles.forEach((t, i) => {
      if (t === Tile.Grass && !world.pillars[i]) cells.push(i);
    });
    return cells.length ? new GrassField(world, look, quality, cells) : null;
  }

  /** Mark the grass cell under (x, z) disturbed at least `amount`. */
  private touch(world: World, x: number, z: number, amount: number): void {
    const { grid } = world;
    const cx = Math.floor((x + grid.half) / grid.cell);
    const cz = Math.floor((z + grid.half) / grid.cell);
    if (cx < 0 || cz < 0 || cx >= grid.size || cz >= grid.size) return;
    const i = cz * grid.size + cx;
    if (this.disturb[i] < amount) this.disturb[i] = amount;
  }

  update(world: World, dt: number, now: number): void {
    this.uniforms.uTime.value = now / 1000;
    const decay = Math.exp(-dt * SETTLE);
    for (let i = 0; i < this.disturb.length; i++) this.disturb[i] *= decay;
    // Every snake segment bends the grass it lies in; while it moves, the grass shakes.
    for (const snake of world.snakes) {
      let prev = this.last.get(snake.id);
      if (!prev || prev.length < snake.pos.length * 2) {
        prev = new Float32Array(Math.max(16, snake.pos.length * 2 + 16));
        this.last.set(snake.id, prev);
      }
      snake.pos.forEach((q, i) => {
        const moved = Math.abs(q.x - prev[i * 2]) + Math.abs(q.z - prev[i * 2 + 1]) > 1e-4;
        prev[i * 2] = q.x;
        prev[i * 2 + 1] = q.z;
        this.touch(world, q.x, q.z, moved ? MOVING : RESTING);
      });
    }
    // You push through it too.
    const pl = world.player;
    if (Math.abs(pl.x - this.lastPlayer.x) + Math.abs(pl.z - this.lastPlayer.z) > 1e-4) this.touch(world, pl.x, pl.z, 0.7);
    this.lastPlayer = { x: pl.x, z: pl.z };
    for (let i = 0; i < this.disturb.length; i++) this.bytes[i] = Math.round(Math.min(1, this.disturb[i]) * 255);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.texture.dispose();
    this.mesh.dispose();
  }
}

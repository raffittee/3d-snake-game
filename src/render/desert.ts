import * as THREE from 'three';
import type { Quality } from '../settings';
import { isUnder } from '../sim/snake';
import { stormAt } from '../sim/weather';
import type { World } from '../sim/types';
import { pbrMaterial } from './assets';
import { sparkTexture } from './itemModels';
import type { TerrainLook } from './terrains';

/** Grains of sand streaming past you in a storm. */
const GRAINS: Record<Quality, number> = { high: 900, low: 350 };
/** The box of air around you the grains live in (units). */
const GRAIN_BOX = 16;

/**
 * Sandstorms (Desert). The renderer asks `strength` each frame (0..1, from sim/weather.ts) and
 * closes the fog in; this draws what the fog cannot: a moving veil of dust over the whole view
 * (the sky included) and grains of sand streaming past you on the wind. Render only.
 */
export class Sandstorm {
  readonly veilScene = new THREE.Scene();
  readonly veilCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly grains: THREE.Points;
  private readonly uniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color() }, uOpacity: { value: 0 } };
  private readonly base: Float32Array;
  strength = 0;

  constructor(
    private readonly look: TerrainLook,
    quality: Quality,
  ) {
    this.uniforms.uColor.value.set(look.storm?.color ?? '#c9a271');
    const veil = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: [
          'uniform float uTime; uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;',
          'float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
          'float n(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);',
          '  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }',
          'void main() {',
          // Gusts: noise stretched along the wind, sliding sideways.
          '  vec2 p = vec2(vUv.x * 3.0 - uTime * 1.6, vUv.y * 9.0);',
          '  float g = n(p) * 0.6 + n(p * 2.3 + 7.0) * 0.4;',
          '  gl_FragColor = vec4(uColor * (0.85 + 0.3 * g), uOpacity * (0.7 + 0.3 * g));',
          '}',
        ].join('\n'),
      }),
    );
    veil.frustumCulled = false;
    this.veilScene.add(veil);

    const count = GRAINS[quality];
    this.base = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.base[i * 3] = Math.random() * GRAIN_BOX;
      this.base[i * 3 + 1] = Math.random() * 3;
      this.base[i * 3 + 2] = Math.random() * GRAIN_BOX;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    this.grains = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: look.storm?.color ?? '#c9a271', size: 0.05, map: sparkTexture(), alphaTest: 0.05, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.grains.frustumCulled = false;
  }

  /** Strength now, the fog pulled in to match, the veil and the grains placed around the camera. */
  update(world: World, fog: THREE.Fog, camera: THREE.Camera, now: number): void {
    const s = stormAt(world.level, world.elapsed);
    this.strength = s;
    const look = this.look;
    const storm = look.storm;
    if (storm) {
      fog.near = look.fog.near + (storm.near - look.fog.near) * s;
      fog.far = look.fog.far + (storm.far - look.fog.far) * s;
      fog.color.set(look.fog.color).lerp(new THREE.Color(storm.color), s);
    }
    this.uniforms.uTime.value = now / 1000;
    this.uniforms.uOpacity.value = s * 0.72;
    const mat = this.grains.material as THREE.PointsMaterial;
    mat.opacity = s * 0.9;
    this.grains.visible = s > 0.01;
    if (!this.grains.visible) return;
    // Grains blow along +x fast, with a little lift; wrapped in a box that follows the camera.
    const t = now / 1000;
    const pos = this.grains.geometry.getAttribute('position') as THREE.BufferAttribute;
    const cx = camera.position.x - GRAIN_BOX / 2;
    const cz = camera.position.z - GRAIN_BOX / 2;
    const wrap = (v: number) => ((v % GRAIN_BOX) + GRAIN_BOX) % GRAIN_BOX;
    for (let i = 0; i < pos.count; i++) {
      const x = wrap(this.base[i * 3] + t * 18 - cx);
      const z = wrap(this.base[i * 3 + 2] + Math.sin(t * 2 + i) * 0.3 - cz);
      pos.setXYZ(i, cx + x, this.base[i * 3 + 1] + Math.sin(t * 3 + i * 0.7) * 0.15, cz + z);
    }
    pos.needsUpdate = true;
  }
}

/** A heap of sand pushed up over a snake's head as it travels underground; it heaves before it breaks out. */
export class BurrowMounds {
  readonly group = new THREE.Group();
  private readonly mounds = new Map<number, THREE.Mesh>();
  private readonly geo: THREE.SphereGeometry;
  private readonly mat: THREE.MeshStandardMaterial;

  constructor(look: TerrainLook) {
    this.geo = new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    this.mat = pbrMaterial(look.ground, look.groundTint);
  }

  update(world: World, now: number): void {
    const live = new Set<number>();
    for (const s of world.snakes) {
      const rising = s.burrow.mode === 'rising';
      if (!isUnder(s, 0) && !rising) continue;
      live.add(s.id);
      let m = this.mounds.get(s.id);
      if (!m) {
        m = new THREE.Mesh(this.geo, this.mat);
        m.castShadow = m.receiveShadow = true;
        this.mounds.set(s.id, m);
        this.group.add(m);
      }
      const h = s.pos[0];
      // Travelling: a low rolling heap. Rising: it swells and shakes.
      const heave = rising ? 1 + 0.35 * Math.abs(Math.sin(now * 0.03)) : 1;
      const shake = rising ? Math.sin(now * 0.09) * 0.08 : 0;
      m.position.set(h.x + shake, -0.05, h.z - shake);
      m.scale.set(1.1 * heave, 0.32 * heave + 0.05 * Math.sin(now * 0.012), 1.1 * heave);
    }
    for (const [id, m] of this.mounds) {
      if (live.has(id)) continue;
      this.group.remove(m);
      this.mounds.delete(id);
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

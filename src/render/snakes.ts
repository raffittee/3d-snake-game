import * as THREE from 'three';
import { jumpableTail } from '../sim/perks';
import { hasTail, isUnder } from '../sim/snake';
import { hiddenInGrass } from '../sim/tiles';
import type { SnakeState, World } from '../sim/types';
import { lerpAngle } from '../sim/math';
import type { CameraView } from './renderer';
import { SnakeBody } from './snakeBody';
import { SnakeHead } from './snakeHead';

/** Seconds a split-off snake takes to grow its head in. */
const HEAD_GROW = 0.6;
/** Seconds a burst of blood lasts after a cut. */
const SPRAY_LIFE = 0.7;
const SPRAY_DROPS = 46;

/** Everything drawn for one live snake. */
export interface SnakeView {
  body: SnakeBody;
  head: SnakeHead;
  headYaw: number;
  /** Texture coordinate of the body at the head; grows by one per snake step so the scales travel. */
  stepsSeen: number;
  lastHead: { x: number; z: number };
  /** Per segment, 0..1: how far it keeps low in tall grass (eased, so it sinks and rises smoothly). */
  low: Float32Array;
  /** Per segment, 0..1: how far it is down under the sand (Burrow), eased the same way. */
  sink: Float32Array;
}

/** How fast a segment sinks into or rises out of tall grass (per second). */
const LOW_RATE = 5;
/** The head keeps low in grass too: its height scales by this. */
const LOW_HEAD_SCALE = 0.6;
/** How fast a segment goes down into the sand or comes up (per second), and how deep the head goes. */
const SINK_RATE = 4;
const HEAD_SINK_DEPTH = 2.6;

let dropTex: THREE.CanvasTexture | null = null;

/** A soft round dot, so points draw as droplets instead of squares. */
function dropTexture(): THREE.CanvasTexture {
  if (dropTex) return dropTex;
  const s = 32;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
    g.fill();
  }
  dropTex = new THREE.CanvasTexture(c);
  return dropTex;
}

/** A short burst of blood droplets where a cut landed. Cosmetic only (Math.random is fine here). */
class Spray {
  readonly points: THREE.Points;
  private readonly vel: Float32Array;
  age = 0;

  constructor(x: number, z: number) {
    const pos = new Float32Array(SPRAY_DROPS * 3);
    this.vel = new Float32Array(SPRAY_DROPS * 3);
    for (let i = 0; i < SPRAY_DROPS; i++) {
      pos[i * 3] = x + (Math.random() - 0.5) * 0.4;
      pos[i * 3 + 1] = 0.8 + Math.random() * 0.6;
      pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.4;
      const a = Math.random() * Math.PI * 2;
      const s = 1.2 + Math.random() * 2.2;
      this.vel[i * 3] = Math.cos(a) * s;
      this.vel[i * 3 + 1] = 1.5 + Math.random() * 2.5;
      this.vel[i * 3 + 2] = Math.sin(a) * s;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: '#6e0d10', size: 0.07, sizeAttenuation: true, map: dropTexture(), alphaTest: 0.25, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    this.points.frustumCulled = false;
  }

  /** Returns false when the burst is over. */
  update(dt: number): boolean {
    this.age += dt;
    const attr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const p = attr.array as Float32Array;
    for (let i = 0; i < SPRAY_DROPS; i++) {
      this.vel[i * 3 + 1] -= 14 * dt;
      p[i * 3] += this.vel[i * 3] * dt;
      p[i * 3 + 1] = Math.max(0.02, p[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      p[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    attr.needsUpdate = true;
    (this.points.material as THREE.PointsMaterial).opacity = 0.95 * Math.max(0, 1 - this.age / SPRAY_LIFE);
    return this.age < SPRAY_LIFE;
  }
}

/** Draws every snake, every severed piece and the blood of fresh cuts. Reads the world; keeps no rules. */
export class SnakeViews {
  private readonly views = new Map<number, SnakeView>();
  private readonly severed = new Map<number, SnakeBody>();
  private readonly sprays: Spray[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private ringsPerSegment: number,
    private readonly maxSegments: number,
  ) {}

  /** Rebuild every body at a new detail level (quality change). */
  setRings(ringsPerSegment: number): void {
    this.ringsPerSegment = ringsPerSegment;
    this.clear();
  }

  clear(): void {
    for (const v of this.views.values()) this.scene.remove(v.body.mesh, v.head.group);
    for (const b of this.severed.values()) this.scene.remove(b.mesh);
    for (const s of this.sprays) this.scene.remove(s.points);
    this.views.clear();
    this.severed.clear();
    this.sprays.length = 0;
  }

  /** The view of a live snake (death camera, stun look). */
  view(id: number | null): SnakeView | undefined {
    return id === null ? undefined : this.views.get(id);
  }

  /** Blood where a cut landed. */
  spray(x: number, z: number): void {
    const s = new Spray(x, z);
    this.sprays.push(s);
    this.scene.add(s.points);
  }

  private viewFor(world: World, snake: SnakeState): SnakeView {
    let v = this.views.get(snake.id);
    if (!v) {
      v = {
        body: new SnakeBody(this.maxSegments, this.ringsPerSegment),
        head: new SnakeHead(),
        headYaw: Math.PI / 2,
        stepsSeen: 0,
        lastHead: { x: Number.NaN, z: Number.NaN },
        low: new Float32Array(this.maxSegments + 2),
        sink: new Float32Array(this.maxSegments + 2),
      };
      snake.under.forEach((u, i) => {
        if (v && u) v.sink[i] = 1;
      });
      // Born in grass: already low (no rising-and-sinking on the first frame).
      snake.pos.forEach((p, i) => {
        if (v && hiddenInGrass(world, p.x, p.z)) v.low[i] = 1;
      });
      const c0 = snake.cells[0];
      const c1 = snake.cells[1];
      // A new snake faces away from its body.
      if (c1) v.headYaw = Math.atan2(c0.x - c1.x, c0.z - c1.z);
      this.scene.add(v.body.mesh, v.head.group);
      this.views.set(snake.id, v);
    }
    return v;
  }

  update(world: World, view: CameraView, dt: number, now: number, killerId: number | null): void {
    const live = new Set<number>();
    // Spring legs makes one more tail segment jumpable; draw it low too.
    const jumpable = jumpableTail(world);
    for (const snake of world.snakes) {
      live.add(snake.id);
      const v = this.viewFor(world, snake);
      const c0 = snake.cells[0];
      if (c0.x !== v.lastHead.x || c0.z !== v.lastHead.z) {
        if (!Number.isNaN(v.lastHead.x)) v.stepsSeen++;
        v.lastHead = { x: c0.x, z: c0.z };
      }
      // Tall grass: each segment in it keeps low, under the grass tops; out in the open it rises.
      const k = Math.min(1, dt * LOW_RATE);
      // Burrow: each segment under the sand slides down below the ground (and back up after it).
      const ks = Math.min(1, dt * SINK_RATE);
      snake.pos.forEach((p, i) => {
        v.low[i] += ((hiddenInGrass(world, p.x, p.z) ? 1 : 0) - v.low[i]) * k;
        v.sink[i] += ((isUnder(snake, i) ? 1 : 0) - v.sink[i]) * ks;
      });
      const t = snake.interval > 0 ? Math.min(1, snake.timer / snake.interval) : 0;
      v.body.update(snake.pos, v.stepsSeen + t, 'head', hasTail(snake) ? 'tail' : 'cut', jumpable, v.low, v.sink);
      // About to split by itself: the body pulses.
      v.body.setFlash(snake.splitWarn > 0 ? 0.5 + 0.5 * Math.sin(now * 0.025) : 0);

      const p0 = snake.prev[0] ?? c0;
      const dx = c0.x - p0.x;
      const dz = c0.z - p0.z;
      if (dx || dz) v.headYaw = lerpAngle(v.headYaw, Math.atan2(dx, dz), Math.min(1, dt * 14));
      const dying = view.mode === 'dead' && snake.id === killerId;
      if (dying) continue; // the death camera poses this head
      const dazed = snake.stunTimer > 0;
      v.head.group.position.set(snake.pos[0].x, -v.sink[0] * HEAD_SINK_DEPTH, snake.pos[0].z);
      if (dazed) {
        v.head.group.rotation.set(0.12 + Math.sin(now * 0.006) * 0.04, v.headYaw + Math.sin(now * 0.004) * 0.12, Math.sin(now * 0.005) * 0.08);
        v.head.setJaw(0.3);
      } else {
        v.head.group.rotation.set(0, v.headYaw, 0);
        v.head.setJaw(0);
      }
      // A split-off snake grows its head in.
      const age = world.elapsed - snake.bornAt;
      const grow = snake.bornAt > 0 && age < HEAD_GROW ? 0.35 + 0.65 * (age / HEAD_GROW) : 1;
      v.head.group.scale.set(grow, grow * (1 - (1 - LOW_HEAD_SCALE) * v.low[0]), grow);
      v.head.flick(dazed ? null : now);
      // In the dark cave, eyes glow (you see them before anything else); a slow pulse.
      v.head.setEyeGlow(world.level.flashlight ? 0.8 + 0.2 * Math.sin(now * 0.002 + snake.id) : 0);
    }
    for (const [id, v] of this.views) {
      if (!live.has(id)) {
        this.scene.remove(v.body.mesh, v.head.group);
        this.views.delete(id);
      }
    }

    // Severed pieces: twitch hard at first, then go still and sink into the ground.
    const liveCut = new Set<number>();
    for (const piece of world.severed) {
      liveCut.add(piece.id);
      let body = this.severed.get(piece.id);
      if (!body) {
        body = new SnakeBody(piece.pos.length + 2, this.ringsPerSegment);
        this.severed.set(piece.id, body);
        this.scene.add(body.mesh);
      }
      const k = piece.life / piece.total;
      const twitch = Math.sin(now * 0.04 + piece.id) * 0.12 * k * k;
      const pos = piece.pos.map((p, i) => ({ x: p.x + twitch * (i % 2 ? 1 : -1), z: p.z - twitch * 0.5 }));
      if (pos.length === 1) pos.push({ x: pos[0].x + 0.01, z: pos[0].z });
      body.update(pos, 0, 'cut', piece.hasTail ? 'tail' : 'cut');
      body.mesh.position.y = -(1 - k) * 1.2;
    }
    for (const [id, body] of this.severed) {
      if (!liveCut.has(id)) {
        this.scene.remove(body.mesh);
        this.severed.delete(id);
      }
    }

    for (let i = this.sprays.length - 1; i >= 0; i--) {
      if (!this.sprays[i].update(dt)) {
        this.scene.remove(this.sprays[i].points);
        this.sprays.splice(i, 1);
      }
    }
  }
}

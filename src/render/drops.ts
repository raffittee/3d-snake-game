import * as THREE from 'three';
import { BALANCE } from '../config/balance';
import type { ItemId, Tier, World } from '../sim/types';
import {
  FUSE_TIP,
  batteryModel,
  energyDrinkModel,
  firecrackerModel,
  iceCleatsModel,
  macheteModel,
  mongooseCageModel,
  smokeBombModel,
  sparkTexture,
  swimRingModel,
} from './itemModels';
import { mongooseModel } from './mongoose';

const HOVER_Y = 0.9;

/** A soft round glow, tinted per tier with the sprite's color. */
function glowTexture(): THREE.CanvasTexture {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.3)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A wooden Y-frame slingshot with a dark band and pouch, about 0.9 units tall. */
function slingshotModel(): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#7a5634', roughness: 0.75 });
  const band = new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.6 });
  const stick = (r: number, len: number, x: number, y: number, tilt: number): void => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, len, 8), wood);
    m.position.set(x, y, 0);
    m.rotation.z = tilt;
    m.castShadow = true;
    g.add(m);
  };
  stick(0.06, 0.45, 0, -0.22, 0);
  stick(0.05, 0.42, -0.1, 0.17, 0.5);
  stick(0.05, 0.42, 0.1, 0.17, -0.5);
  const tipL = new THREE.Vector3(-0.2, 0.35, 0);
  const tipR = new THREE.Vector3(0.2, 0.35, 0);
  const pouch = new THREE.Vector3(0, 0.2, 0.04);
  for (const tip of [tipL, tipR]) {
    const len = tip.distanceTo(pouch);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 5), band);
    m.position.copy(tip).add(pouch).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pouch.clone().sub(tip).normalize());
    g.add(m);
  }
  const p = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), band);
  p.position.copy(pouch);
  p.scale.set(1.3, 0.7, 0.6);
  g.add(p);
  return g;
}

/** The machete lying in the arena: the hand model, scaled up a little to read from a distance. */
function macheteDrop(): THREE.Group {
  const g = new THREE.Group();
  const m = macheteModel();
  m.scale.setScalar(1.6);
  m.rotation.z = 0.5;
  m.position.y = -0.2;
  g.add(m);
  return g;
}

/** The swim ring lying in the arena: standing up, turning, like a buoy. */
function swimRingDrop(): THREE.Group {
  const g = new THREE.Group();
  const m = swimRingModel();
  m.scale.setScalar(1.3);
  g.add(m);
  return g;
}

/** The firecracker lying in the arena: scaled up so it reads from a distance, tipped over. */
function firecrackerDrop(): THREE.Group {
  const g = new THREE.Group();
  const m = firecrackerModel();
  m.scale.setScalar(4.6);
  m.rotation.z = 0.9;
  g.add(m);
  return g;
}

/** The smoke bomb lying in the arena, scaled up to read from a distance. */
function smokeBombDrop(): THREE.Group {
  const g = new THREE.Group();
  const m = smokeBombModel();
  m.scale.setScalar(4.2);
  m.rotation.z = 0.35;
  g.add(m);
  return g;
}

/** The energy drink lying in the arena, scaled up to read from a distance. */
function energyDrinkDrop(): THREE.Group {
  const g = new THREE.Group();
  const m = energyDrinkModel();
  m.scale.setScalar(4.4);
  g.add(m);
  return g;
}

/** The mongoose's cage lying in the arena, with the animal inside; scaled up to read from a distance. */
function mongooseDrop(): THREE.Group {
  const g = new THREE.Group();
  const inside = mongooseModel().group;
  inside.scale.setScalar(0.25);
  inside.position.y = -0.08;
  const cage = mongooseCageModel(inside).group;
  cage.scale.setScalar(3.4);
  g.add(cage);
  return g;
}

/** The ice cleats lying in the arena, standing up a little so they read, scaled up. */
function iceCleatsDrop(): THREE.Group {
  const g = new THREE.Group();
  const m = iceCleatsModel();
  m.scale.setScalar(3.6);
  m.rotation.x = -0.9;
  g.add(m);
  return g;
}

/** The battery lying in the cave, standing up, scaled up to read (and glinting in the beam). */
function batteryDrop(): THREE.Group {
  const g = new THREE.Group();
  const m = batteryModel();
  m.scale.setScalar(7);
  g.add(m);
  return g;
}

const MODELS: Record<ItemId, () => THREE.Group> = {
  battery: batteryDrop,
  iceCleats: iceCleatsDrop,
  mongoose: mongooseDrop,
  energyDrink: energyDrinkDrop,
  slingshot: slingshotModel,
  machete: macheteDrop,
  swimRing: swimRingDrop,
  firecracker: firecrackerDrop,
  smokeBomb: smokeBombDrop,
};

/** Firecracker size in the world (the hand model is real size; this reads better at a distance). */
const CRACKER_SCALE = 3;
/** Seconds the smoke of a bang hangs before it is gone. */
const SMOKE_LIFE = 2.4;

/** Puffs of smoke (a bang, or a smoke bomb's cloud), with an optional flash at the start. */
interface Burst {
  flash: THREE.Sprite | null;
  smoke: Array<{ sprite: THREE.Sprite; vx: number; vy: number; vz: number }>;
  age: number;
  life: number;
  /** Puff size at the start, and how fast it grows (units per second). */
  size: number;
  grow: number;
  opacity: number;
}

/**
 * Thrown things and what they leave: firecrackers tumbling in flight, lying with a sputtering fuse,
 * then a bang (a flash and puffs of smoke); a smoke bomb's thick cloud. Pools are filled from world
 * state each frame; bursts are started by the game when it sees a `firecrackerBang` or `smokeBomb` event.
 */
export class ItemEffects {
  private readonly sparkMat = new THREE.SpriteMaterial({ map: sparkTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  private readonly flashMat = new THREE.SpriteMaterial({ map: sparkTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  private readonly smokeTex = glowTexture();
  private readonly flying: THREE.Group[] = [];
  private readonly lying: Array<{ group: THREE.Group; spark: THREE.Sprite }> = [];
  private readonly bursts: Burst[] = [];
  private spin = 0;

  constructor(private readonly scene: THREE.Scene) {}

  private cracker(): THREE.Group {
    const g = new THREE.Group();
    const m = firecrackerModel();
    m.scale.setScalar(CRACKER_SCALE);
    g.add(m);
    this.scene.add(g);
    return g;
  }

  sync(world: World, dt: number, now: number): void {
    this.spin += dt * 9;
    let f = 0;
    for (const p of world.projectiles) {
      if (p.kind !== 'firecracker') continue;
      const g = this.flying[f] ?? this.cracker();
      this.flying[f++] = g;
      g.visible = true;
      g.position.set(p.x, p.y, p.z);
      g.rotation.set(this.spin, this.spin * 0.6, 0);
    }
    for (let i = f; i < this.flying.length; i++) this.flying[i].visible = false;

    world.firecrackers.forEach((c, i) => {
      let v = this.lying[i];
      if (!v) {
        const group = this.cracker();
        const spark = new THREE.Sprite(this.sparkMat);
        group.add(spark);
        v = { group, spark };
        this.lying[i] = v;
      }
      v.group.visible = true;
      // On its side on the ground, the fuse end up a little.
      v.group.position.set(c.x, 0.05, c.z);
      v.group.rotation.set(0, i * 2.1, Math.PI / 2 - 0.15);
      const tip = FUSE_TIP.clone().multiplyScalar(CRACKER_SCALE);
      v.spark.position.copy(tip);
      // The fuse burns down: the spark sputters, brighter as it gets close.
      const k = 1 - Math.max(0, c.fuse / c.total);
      v.spark.scale.setScalar((0.25 + 0.2 * k) * (0.75 + 0.5 * Math.abs(Math.sin(now * 0.05 + i))));
    });
    for (let i = world.firecrackers.length; i < this.lying.length; i++) this.lying[i].group.visible = false;

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.age += dt;
      if (b.flash) {
        const k = b.age / 0.2;
        b.flash.visible = k < 1;
        b.flash.scale.setScalar(2 + k * 10);
        b.flash.material.opacity = Math.max(0, 1 - k);
      }
      // Thick at first, thinning out over the last third of its life.
      const fade = Math.min(1, (1 - b.age / b.life) * 3);
      for (const s of b.smoke) {
        s.sprite.position.x += s.vx * dt;
        s.sprite.position.y += s.vy * dt;
        s.sprite.position.z += s.vz * dt;
        s.vx *= 1 - dt * 1.5;
        s.vz *= 1 - dt * 1.5;
        s.sprite.scale.setScalar(b.size + b.age * b.grow);
        s.sprite.material.opacity = Math.max(0, b.opacity * fade);
      }
      if (b.age > b.life) {
        this.scene.remove(...b.smoke.map((s) => s.sprite));
        if (b.flash) {
          this.scene.remove(b.flash);
          b.flash.material.dispose();
        }
        for (const s of b.smoke) s.sprite.material.dispose();
        this.bursts.splice(i, 1);
      }
    }
  }

  /** The bang at (x, z): a flash and a few puffs of smoke. */
  bang(x: number, z: number): void {
    const flash = new THREE.Sprite(this.flashMat.clone());
    flash.position.set(x, 0.6, z);
    this.scene.add(flash);
    const smoke: Burst['smoke'] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random();
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, color: '#7d7a72', transparent: true, depthWrite: false, opacity: 0.75 }));
      sprite.position.set(x, 0.4 + Math.random() * 0.4, z);
      this.scene.add(sprite);
      smoke.push({ sprite, vx: Math.cos(a) * 2.2, vy: 0.7 + Math.random() * 0.6, vz: Math.sin(a) * 2.2 });
    }
    this.bursts.push({ flash, smoke, age: 0, life: SMOKE_LIFE, size: 2, grow: 3, opacity: 0.75 });
  }

  /** A smoke bomb at (x, z): a thick pale cloud that billows out around you and hangs for `seconds`. */
  cloud(x: number, z: number, seconds: number): void {
    const smoke: Burst['smoke'] = [];
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.5;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, color: '#c9c8c2', transparent: true, depthWrite: false, opacity: 0.6 }));
      sprite.position.set(x + Math.cos(a) * r, 0.3 + Math.random() * 1.6, z + Math.sin(a) * r);
      this.scene.add(sprite);
      const s = 0.9 + Math.random() * 1.4;
      smoke.push({ sprite, vx: Math.cos(a) * s, vy: 0.08 + Math.random() * 0.2, vz: Math.sin(a) * s });
    }
    this.bursts.push({ flash: null, smoke, age: 0, life: seconds + 1, size: 2.4, grow: 0.7, opacity: 0.6 });
  }

  clear(): void {
    for (const g of this.flying) g.visible = false;
    for (const v of this.lying) v.group.visible = false;
    for (const b of this.bursts) {
      this.scene.remove(...b.smoke.map((s) => s.sprite));
      if (b.flash) this.scene.remove(b.flash);
    }
    this.bursts.length = 0;
  }
}

/** Slingshot stones in flight: a small pool of grey pebbles placed from world.projectiles each frame. */
export class StoneViews {
  private readonly geo = new THREE.IcosahedronGeometry(1, 1);
  private readonly mat = new THREE.MeshStandardMaterial({ color: '#8d8a82', roughness: 0.85 });
  private readonly pool: THREE.Mesh[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  sync(world: World): void {
    const r = BALANCE.items.defs.slingshot.stoneRadius;
    const stones = world.projectiles.filter((p) => p.kind === 'stone');
    stones.forEach((s, i) => {
      let m = this.pool.at(i);
      if (!m) {
        m = new THREE.Mesh(this.geo, this.mat);
        m.scale.set(r, r * 0.8, r * 0.9);
        m.castShadow = true;
        this.scene.add(m);
        this.pool.push(m);
      }
      m.visible = true;
      m.position.set(s.x, s.y, s.z);
    });
    for (let i = stones.length; i < this.pool.length; i++) this.pool[i].visible = false;
  }
}

/** Items lying in the arena: the item's model, hovering and turning, with a glow in its tier's color. */
export class DropViews {
  private readonly glowTex = glowTexture();
  private readonly glowMats: Record<Tier, THREE.SpriteMaterial>;
  /** A solid ring on the ground in the tier's color: additive glow washes out to white on bright
   *  grass, so this is what makes white / blue / gold readable at a glance. */
  private readonly ringMats: Record<Tier, THREE.MeshBasicMaterial>;
  private readonly ringGeo = new THREE.RingGeometry(0.42, 0.56, 40);
  private readonly views = new Map<number, { group: THREE.Group; model: THREE.Group; ring: THREE.Mesh; phase: number }>();

  constructor(
    private readonly scene: THREE.Scene,
    tierColors: Record<Tier, string>,
  ) {
    const mat = (color: string) =>
      new THREE.SpriteMaterial({ map: this.glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.glowMats = { white: mat(tierColors.white), blue: mat(tierColors.blue), gold: mat(tierColors.gold) };
    const ring = (color: string) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
    this.ringMats = { white: ring(tierColors.white), blue: ring(tierColors.blue), gold: ring(tierColors.gold) };
  }

  sync(world: World, dt: number): void {
    const live = new Set<number>();
    for (const d of world.drops) {
      live.add(d.id);
      let view = this.views.get(d.id);
      if (!view) {
        const group = new THREE.Group();
        const model = MODELS[d.item]();
        group.add(model);
        const glow = new THREE.Sprite(this.glowMats[d.tier]);
        // Rarer tiers glow bigger, so a gold drop is spotted from further away.
        glow.scale.setScalar(d.tier === 'gold' ? 2.6 : d.tier === 'blue' ? 2.1 : 1.7);
        group.add(glow);
        group.position.set((d.x + 0.5) * world.grid.cell - world.grid.half, HOVER_Y, (d.z + 0.5) * world.grid.cell - world.grid.half);
        this.scene.add(group);
        const ring = new THREE.Mesh(this.ringGeo, this.ringMats[d.tier]);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(group.position.x, 0.03, group.position.z);
        this.scene.add(ring);
        view = { group, model, ring, phase: d.id * 1.3 };
        this.views.set(d.id, view);
      }
      view.phase += dt;
      view.model.rotation.y += dt * 1.2;
      view.group.position.y = HOVER_Y + Math.sin(view.phase * 2) * 0.1;
    }
    for (const [id, view] of this.views) {
      if (!live.has(id)) {
        this.scene.remove(view.group, view.ring);
        this.views.delete(id);
      }
    }
  }

  clear(): void {
    for (const view of this.views.values()) this.scene.remove(view.group, view.ring);
    this.views.clear();
  }
}

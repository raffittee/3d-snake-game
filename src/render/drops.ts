import * as THREE from 'three';
import { BALANCE } from '../config/balance';
import type { ItemId, Tier, World } from '../sim/types';
import { macheteModel, swimRingModel } from './itemModels';

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

const MODELS: Record<ItemId, () => THREE.Group> = { slingshot: slingshotModel, machete: macheteDrop, swimRing: swimRingDrop };

/** Slingshot stones in flight: a small pool of grey pebbles placed from world.projectiles each frame. */
export class StoneViews {
  private readonly geo = new THREE.IcosahedronGeometry(1, 1);
  private readonly mat = new THREE.MeshStandardMaterial({ color: '#8d8a82', roughness: 0.85 });
  private readonly pool: THREE.Mesh[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  sync(world: World): void {
    const r = BALANCE.items.defs.slingshot.stoneRadius;
    world.projectiles.forEach((s, i) => {
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
    for (let i = world.projectiles.length; i < this.pool.length; i++) this.pool[i].visible = false;
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

import * as THREE from 'three';
import { hiddenInGrass } from '../sim/tiles';
import type { World } from '../sim/types';

const GEM_COLOR = '#ffb22e';
const HOVER_Y = 1.0;
/** In tall grass a pellet sits low, under the grass tops: only a faint glow shows between the blades. */
const HIDDEN_Y = 0.5;

function glowTexture(): THREE.CanvasTexture {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,214,110,0.9)');
    grad.addColorStop(0.35, 'rgba(255,190,70,0.35)');
    grad.addColorStop(1, 'rgba(255,170,40,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Pellets drawn as glowing gems: a faceted crystal plus a soft additive halo. */
export class PelletViews {
  private readonly gemGeo = new THREE.OctahedronGeometry(0.3, 0);
  private readonly gemMat = new THREE.MeshStandardMaterial({
    color: GEM_COLOR,
    emissive: GEM_COLOR,
    emissiveIntensity: 0.9,
    roughness: 0.15,
    metalness: 0.1,
    flatShading: true,
  });
  private readonly glowMat = new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  private readonly views = new Map<number, { group: THREE.Group; gem: THREE.Mesh; phase: number; y: number }>();

  constructor(private readonly scene: THREE.Scene) {}

  sync(world: World, dt: number): void {
    const live = new Set<number>();
    for (const p of world.pellets) {
      live.add(p.id);
      let view = this.views.get(p.id);
      if (!view) {
        const group = new THREE.Group();
        const gem = new THREE.Mesh(this.gemGeo, this.gemMat);
        gem.scale.set(1, 1.5, 1);
        gem.castShadow = true;
        group.add(gem);
        const glow = new THREE.Sprite(this.glowMat);
        group.position.set((p.x + 0.5) * world.grid.cell - world.grid.half, HOVER_Y, (p.z + 0.5) * world.grid.cell - world.grid.half);
        const hidden = hiddenInGrass(world, group.position.x, group.position.z);
        glow.scale.setScalar(hidden ? 1.1 : 1.8);
        group.add(glow);
        this.scene.add(group);
        view = { group, gem, phase: p.id * 1.7, y: hidden ? HIDDEN_Y : HOVER_Y };
        this.views.set(p.id, view);
      }
      view.phase += dt;
      view.gem.rotation.y += dt * 1.6;
      view.group.position.y = view.y + Math.sin(view.phase * 2.4) * (view.y === HOVER_Y ? 0.12 : 0.05);
    }
    for (const [id, view] of this.views) {
      if (!live.has(id)) {
        this.scene.remove(view.group);
        this.views.delete(id);
      }
    }
  }

  clear(): void {
    for (const view of this.views.values()) this.scene.remove(view.group);
    this.views.clear();
  }
}

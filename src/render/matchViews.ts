import * as THREE from 'three';
import { cellToWorld } from '../sim/grid';
import type { World } from '../sim/types';

const NEST_GEMS = 12;

/**
 * What a multiplayer mode adds to the arena. Classic: the nest you carry pellets to, a ring of
 * woven twigs on a soft glowing ground ring, with gems piling up inside as it fills.
 */
export class MatchViews {
  readonly group = new THREE.Group();
  private nest: THREE.Group | null = null;
  private gems: THREE.Mesh[] = [];
  private glow: THREE.Mesh | null = null;

  constructor(world: World) {
    const nest = world.match?.nest;
    if (!nest) return;
    const g = new THREE.Group();
    g.position.set(cellToWorld(world.grid, nest.x), 0, cellToWorld(world.grid, nest.z));
    const twig = new THREE.MeshStandardMaterial({ color: '#6b5232', roughness: 0.95 });
    const dark = new THREE.MeshStandardMaterial({ color: '#4a3820', roughness: 1 });
    // Woven rim: a few twisted tori at slightly different tilts read as layered twigs.
    for (let i = 0; i < 4; i++) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.95 + i * 0.04, 0.09 - i * 0.01, 8, 40), i % 2 ? dark : twig);
      rim.rotation.x = Math.PI / 2 + (i - 1.5) * 0.06;
      rim.rotation.z = i * 0.7;
      rim.position.y = 0.12 + i * 0.05;
      rim.castShadow = true;
      g.add(rim);
    }
    const bed = new THREE.Mesh(new THREE.CircleGeometry(0.9, 28), dark);
    bed.rotation.x = -Math.PI / 2;
    bed.position.y = 0.05;
    g.add(bed);
    const gemMat = new THREE.MeshStandardMaterial({ color: '#d8f08a', emissive: '#9fc23a', emissiveIntensity: 0.9, roughness: 0.3 });
    for (let i = 0; i < NEST_GEMS; i++) {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), gemMat);
      const a = i * 2.4;
      const r = 0.15 + (i % 4) * 0.15;
      gem.position.set(Math.cos(a) * r, 0.15 + Math.floor(i / 6) * 0.12, Math.sin(a) * r);
      gem.rotation.set(a, a * 0.5, 0);
      gem.visible = false;
      g.add(gem);
      this.gems.push(gem);
    }
    this.glow = new THREE.Mesh(
      new THREE.RingGeometry(1.4, 2.9, 40),
      new THREE.MeshBasicMaterial({ color: '#d8f08a', transparent: true, opacity: 0.18, depthWrite: false }),
    );
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.03;
    g.add(this.glow);
    this.nest = g;
    this.group.add(g);
  }

  update(world: World, now: number): void {
    const nest = world.match?.nest;
    if (!nest || !this.nest) return;
    const shown = Math.round((nest.filled / Math.max(1, nest.need)) * NEST_GEMS);
    this.gems.forEach((g, i) => (g.visible = i < shown));
    if (this.glow) (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.14 + 0.08 * Math.sin(now * 0.003);
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BALANCE } from '../config/balance';
import { cellToWorld } from '../sim/grid';
import { createRng } from '../sim/rng';
import { Tile } from '../sim/tiles';
import type { World } from '../sim/types';
import { pbrMaterial } from './assets';
import type { TerrainLook } from './terrains';

/**
 * The dark cave, drawn from the world's tiles: rough rock walls up to the ceiling along every edge
 * of the open floor (only the rock you can see is built), a rock ceiling over everything,
 * stalactites, and a few patches of faintly glowing green fungus to find your way by. Render only.
 */
export class CaveViews {
  readonly group = new THREE.Group();
  private readonly fungus: THREE.MeshStandardMaterial;

  private constructor(world: World, look: TerrainLook) {
    const { grid, tiles } = world;
    const n = grid.size;
    const c = grid.cell;
    const h = BALANCE.cave.ceiling;
    const rng = createRng(n * 977 + 13);
    const rock = (x: number, z: number) => x < 0 || z < 0 || x >= n || z >= n || tiles[z * n + x] === Tile.CaveWall;
    const rockMat = pbrMaterial(look.wall, '#77756c');

    // Walls: a rough block per rock cell that touches open floor (the rest is never seen).
    const blocks: THREE.BufferGeometry[] = [];
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] !== Tile.CaveWall) continue;
      const x = i % n;
      const z = (i / n) | 0;
      if (rock(x + 1, z) && rock(x - 1, z) && rock(x, z + 1) && rock(x, z - 1)) continue;
      const g = new THREE.BoxGeometry(c * 1.08, h, c * 1.08, 2, 4, 2);
      // Push the vertices about so the rock is lumpy, not a wall of boxes.
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) {
        const vx = pos.getX(k);
        const vy = pos.getY(k);
        const vz = pos.getZ(k);
        const wob = (Math.sin((x * 7.1 + vy * 2.3 + vz) * 1.7) + Math.cos((z * 5.3 + vy * 1.9 + vx) * 1.3)) * 0.18;
        pos.setXYZ(k, vx * (1 + wob), vy, vz * (1 + wob));
      }
      g.computeVertexNormals();
      // World-unit UVs so the rock texture keeps its size.
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (pos.getX(k) + pos.getZ(k) + x * c) / look.wall.tile, (pos.getY(k) + h / 2) / look.wall.tile);
      g.translate(cellToWorld(grid, x), h / 2, cellToWorld(grid, z));
      blocks.push(g);
    }
    if (blocks.length) {
      const walls = new THREE.Mesh(mergeGeometries(blocks), rockMat);
      walls.castShadow = walls.receiveShadow = true;
      this.group.add(walls);
    }

    // The ceiling: one rock plane over the whole cave, facing down.
    const ceilGeo = new THREE.PlaneGeometry(grid.half * 2 + 8, grid.half * 2 + 8, 1, 1);
    ceilGeo.rotateX(Math.PI / 2);
    const uv = ceilGeo.getAttribute('uv') as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) * (grid.half * 2 + 8)) / look.wall.tile, (uv.getY(k) * (grid.half * 2 + 8)) / look.wall.tile);
    const ceiling = new THREE.Mesh(ceilGeo, pbrMaterial(look.wall, '#4d4b45'));
    ceiling.position.y = h;
    ceiling.receiveShadow = true;
    this.group.add(ceiling);

    // Stalactites over open floor, here and there.
    const open: number[] = [];
    for (let i = 0; i < tiles.length; i++) if (tiles[i] === Tile.Open) open.push(i);
    const count = Math.min(140, Math.floor(open.length * 0.08));
    const stal = new THREE.InstancedMesh(new THREE.ConeGeometry(0.22, 1, 7), rockMat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    for (let k = 0; k < count; k++) {
      const i = open[rng.int(open.length)];
      const len = 0.5 + rng.next() * 1.6;
      m.compose(
        new THREE.Vector3(cellToWorld(grid, i % n) + (rng.next() - 0.5) * c, h - len / 2, cellToWorld(grid, (i / n) | 0) + (rng.next() - 0.5) * c),
        q,
        new THREE.Vector3(0.6 + rng.next() * 0.8, len, 0.6 + rng.next() * 0.8),
      );
      stal.setMatrixAt(k, m);
    }
    stal.castShadow = true;
    this.group.add(stal);

    // Glowing fungus: small clusters low on the walls, a faint sickly green.
    this.fungus = new THREE.MeshStandardMaterial({ color: '#2f4a28', emissive: '#7fd16a', emissiveIntensity: 0.6, roughness: 0.6 });
    const shore = open.filter((i) => {
      const x = i % n;
      const z = (i / n) | 0;
      return rock(x + 1, z) || rock(x - 1, z) || rock(x, z + 1) || rock(x, z - 1);
    });
    const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 8, 6), this.fungus, Math.min(220, shore.length));
    for (let k = 0; k < caps.count; k++) {
      const i = shore[rng.int(shore.length)];
      m.compose(
        new THREE.Vector3(cellToWorld(grid, i % n) + (rng.next() - 0.5) * c * 0.8, 0.05 + rng.next() * 0.5, cellToWorld(grid, (i / n) | 0) + (rng.next() - 0.5) * c * 0.8),
        new THREE.Quaternion(),
        new THREE.Vector3(1, 0.5 + rng.next() * 0.4, 1).multiplyScalar(0.6 + rng.next()),
      );
      caps.setMatrixAt(k, m);
    }
    this.group.add(caps);
  }

  /** The cave for this world, or null when the level has none. */
  static build(world: World, look: TerrainLook): CaveViews | null {
    return world.tiles.some((t) => t === Tile.CaveWall) ? new CaveViews(world, look) : null;
  }

  update(now: number): void {
    this.fungus.emissiveIntensity = 0.5 + 0.15 * Math.sin(now * 0.0012);
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}

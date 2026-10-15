import * as THREE from 'three';
import { BALANCE } from '../config/balance';
import { lerp, lerpAngle } from '../sim/math';
import { segmentHalfWidth } from '../sim/snake';
import type { World } from '../sim/types';
import type { Palette } from './palette';

// The prototype was built on three r128, which did no color-space conversion. Turning it off
// keeps the flat LCD look identical. Revisit this when terrains get their own palettes.
THREE.ColorManagement.enabled = false;

/** What the camera needs besides the world. Owned by the game layer. */
export interface CameraView {
  mode: 'menu' | 'play' | 'dead';
  /** Camera angles. In play mode the game copies them from the player each frame. */
  yaw: number;
  pitch: number;
  /** View-bob phase, advanced while the player moves. */
  bob: number;
  /** Seconds since the title screen opened (orbit angle). */
  menuT: number;
  /** Seconds since death. */
  deathT: number;
  /** 0..1, how close the snake is. Adds a little camera shake. */
  danger: number;
  reducedMotion: boolean;
}

const WALL_HEIGHT = 2.6;
const PILLAR_HEIGHT = 3.4;

/** Draws a World. Keeps no game rules, only meshes. */
export class GameRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 200);
  private levelGroup = new THREE.Group();
  private readonly edgeMat: THREE.LineBasicMaterial;
  private readonly blockMat: THREE.MeshLambertMaterial;
  private readonly segGeo = new THREE.BoxGeometry(1, 1, 1);
  private readonly segEdges = new THREE.EdgesGeometry(this.segGeo);
  private readonly segMatA: THREE.MeshLambertMaterial;
  private readonly segMatB: THREE.MeshLambertMaterial;
  private readonly segs: THREE.Mesh[] = [];
  private readonly head = new THREE.Group();
  private readonly tongue: THREE.Mesh;
  private readonly pelletGeo = new THREE.OctahedronGeometry(0.42);
  private readonly pelletEdges = new THREE.EdgesGeometry(this.pelletGeo);
  private readonly pelletMat: THREE.MeshLambertMaterial;
  private readonly pellets = new Map<number, { mesh: THREE.Mesh; phase: number }>();
  private headYaw = Math.PI / 2;
  private world: World | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly palette: Palette,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.scene.background = new THREE.Color(palette.lcd);
    this.scene.fog = new THREE.Fog(palette.lcd, 5, 40);
    this.camera.rotation.order = 'YXZ';
    // Light intensities are multiplied by pi to match the old (r128) lighting model.
    this.scene.add(new THREE.HemisphereLight(new THREE.Color('#f2fff6'), new THREE.Color(palette.mid), 0.9 * Math.PI));
    const sun = new THREE.DirectionalLight(0xffffff, 0.55 * Math.PI);
    sun.position.set(12, 24, 8);
    this.scene.add(sun);

    this.edgeMat = new THREE.LineBasicMaterial({ color: palette.deep });
    this.blockMat = new THREE.MeshLambertMaterial({ color: palette.mid });
    this.segMatA = new THREE.MeshLambertMaterial({ color: palette.ink });
    this.segMatB = new THREE.MeshLambertMaterial({ color: palette.ink2 });
    this.pelletMat = new THREE.MeshLambertMaterial({ color: palette.lcd });
    this.scene.add(this.levelGroup);
    this.tongue = this.buildHead();
    this.scene.add(this.head);
    this.resize();
  }

  /** The 3D view renders at low resolution and is scaled up with pixelated filtering. */
  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const scale = Math.min(1, Math.max(0.42, 760 / w));
    this.renderer.setSize(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)), false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(world: World, view: CameraView, dt: number, now: number): void {
    if (world !== this.world) this.setWorld(world);
    this.syncPellets(world, dt);
    this.placeSnake(world, view, dt, now);
    this.updateCamera(world, view, dt);
    this.renderer.render(this.scene, this.camera);
  }

  // --- building ---

  private block(w: number, h: number, d: number, x: number, y: number, z: number, group: THREE.Group): void {
    const geo = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, this.blockMat);
    m.position.set(x, y, z);
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), this.edgeMat));
    group.add(m);
  }

  private buildHead(): THREE.Mesh {
    const p = this.palette;
    const hg = new THREE.BoxGeometry(2.0, 1.9, 2.2);
    const hm = new THREE.Mesh(hg, new THREE.MeshLambertMaterial({ color: p.deep }));
    hm.add(new THREE.LineSegments(new THREE.EdgesGeometry(hg), new THREE.LineBasicMaterial({ color: p.ink })));
    this.head.add(hm);
    const eyeM = new THREE.MeshBasicMaterial({ color: p.lcd });
    const pupM = new THREE.MeshBasicMaterial({ color: p.alert });
    for (const x of [-0.55, 0.55]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.06), eyeM);
      eye.position.set(x, 0.45, 1.12);
      this.head.add(eye);
      const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.36, 0.06), pupM);
      pupil.position.set(x, 0.45, 1.16);
      this.head.add(pupil);
    }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.06), new THREE.MeshBasicMaterial({ color: p.ink }));
    mouth.position.set(0, -0.35, 1.12);
    this.head.add(mouth);
    const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 1), new THREE.MeshBasicMaterial({ color: p.alert }));
    tongue.position.set(0, -0.35, 1.2);
    this.head.add(tongue);
    return tongue;
  }

  /** Rebuild everything that belongs to one arena: floor, walls, pillars. */
  private setWorld(world: World): void {
    this.world = world;
    this.disposeLevelGroup();
    this.levelGroup = new THREE.Group();
    this.scene.add(this.levelGroup);
    const { grid } = world;
    const n = grid.size;
    const p = this.palette;

    // Floor: one checker tile per grid cell so the snake's grid is readable.
    const px = 8;
    const tc = document.createElement('canvas');
    tc.width = tc.height = n * px;
    const g = tc.getContext('2d');
    if (g) {
      for (let z = 0; z < n; z++) {
        for (let x = 0; x < n; x++) {
          g.fillStyle = (x + z) % 2 ? p.lcd2 : p.lcd;
          g.fillRect(x * px, z * px, px, px);
        }
      }
      g.globalAlpha = 0.35;
      g.fillStyle = p.ink;
      for (let i = 0; i <= n; i++) {
        g.fillRect(i * px, 0, 1, n * px);
        g.fillRect(0, i * px, n * px, 1);
      }
    }
    const tex = new THREE.CanvasTexture(tc);
    tex.magFilter = THREE.NearestFilter;
    const width = n * grid.cell;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(width, width), new THREE.MeshBasicMaterial({ map: tex }));
    ground.rotation.x = -Math.PI / 2;
    this.levelGroup.add(ground);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: p.lcd2 }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.01;
    this.levelGroup.add(outer);

    // Perimeter walls sit just outside the grid.
    const h = grid.half;
    this.block(width + 2, WALL_HEIGHT, 1, 0, WALL_HEIGHT / 2, -h - 0.5, this.levelGroup);
    this.block(width + 2, WALL_HEIGHT, 1, 0, WALL_HEIGHT / 2, h + 0.5, this.levelGroup);
    this.block(1, WALL_HEIGHT, width, -h - 0.5, WALL_HEIGHT / 2, 0, this.levelGroup);
    this.block(1, WALL_HEIGHT, width, h + 0.5, WALL_HEIGHT / 2, 0, this.levelGroup);

    for (let i = 0; i < world.pillars.length; i++) {
      if (!world.pillars[i]) continue;
      const cx = (i % n + 0.5) * grid.cell - grid.half;
      const cz = (Math.floor(i / n) + 0.5) * grid.cell - grid.half;
      this.block(grid.cell, PILLAR_HEIGHT, grid.cell, cx, PILLAR_HEIGHT / 2, cz, this.levelGroup);
    }

    for (const view of this.pellets.values()) this.scene.remove(view.mesh);
    this.pellets.clear();
    this.headYaw = Math.PI / 2;
  }

  private disposeLevelGroup(): void {
    this.scene.remove(this.levelGroup);
    this.levelGroup.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          // Shared materials (blocks, edges) are reused across arenas; only free per-arena ones.
          if (m === this.blockMat || m === this.edgeMat) continue;
          if ('map' in m && m.map instanceof THREE.Texture) m.map.dispose();
          m.dispose();
        }
      }
    });
  }

  // --- per frame ---

  private syncPellets(world: World, dt: number): void {
    const live = new Set<number>();
    for (const p of world.pellets) {
      live.add(p.id);
      let view = this.pellets.get(p.id);
      if (!view) {
        const mesh = new THREE.Mesh(this.pelletGeo, this.pelletMat);
        mesh.add(new THREE.LineSegments(this.pelletEdges, this.edgeMat));
        mesh.position.set((p.x + 0.5) * world.grid.cell - world.grid.half, 1.0, (p.z + 0.5) * world.grid.cell - world.grid.half);
        this.scene.add(mesh);
        view = { mesh, phase: p.id * 1.7 };
        this.pellets.set(p.id, view);
      }
      view.phase += dt;
      view.mesh.rotation.y += dt * 2;
      view.mesh.position.y = 1.0 + Math.sin(view.phase * 3) * 0.15;
    }
    for (const [id, view] of this.pellets) {
      if (!live.has(id)) {
        this.scene.remove(view.mesh);
        this.pellets.delete(id);
      }
    }
  }

  private segMesh(i: number): THREE.Mesh {
    while (this.segs.length <= i) {
      const m = new THREE.Mesh(this.segGeo, this.segs.length % 2 ? this.segMatB : this.segMatA);
      m.add(new THREE.LineSegments(this.segEdges, this.edgeMat));
      this.scene.add(m);
      this.segs.push(m);
    }
    return this.segs[i];
  }

  private placeSnake(world: World, view: CameraView, dt: number, now: number): void {
    const { snake } = world;
    const len = snake.pos.length;
    for (let i = 1; i < len; i++) {
      const m = this.segMesh(i);
      const s = segmentHalfWidth(i, len) * 2;
      m.visible = true;
      m.scale.set(s, s, s);
      m.position.set(snake.pos[i].x, s / 2, snake.pos[i].z);
    }
    for (let i = Math.max(1, len); i < this.segs.length; i++) this.segs[i].visible = false;

    const c0 = snake.cells[0];
    const p0 = snake.prev[0] ?? c0;
    const dx = c0.x - p0.x;
    const dz = c0.z - p0.z;
    if (dx || dz) this.headYaw = lerpAngle(this.headYaw, Math.atan2(dx, dz), Math.min(1, dt * 14));
    if (view.mode !== 'dead') {
      this.head.position.set(snake.pos[0].x, 0.95, snake.pos[0].z);
      this.head.rotation.y = this.headYaw;
    }
    const flick = Math.max(0, Math.sin(now * 0.012));
    this.tongue.scale.z = 0.2 + flick * 1.2;
    this.tongue.position.z = 1.15 + this.tongue.scale.z * 0.5;
  }

  private updateCamera(world: World, view: CameraView, dt: number): void {
    const { player, snake, grid } = world;
    if (view.mode === 'menu') {
      const a = view.menuT * 0.12;
      const radius = grid.half * 1.07;
      this.camera.position.set(Math.cos(a) * radius, grid.half * 0.75, Math.sin(a) * radius);
      this.camera.lookAt(0, 0, 0);
      return;
    }
    if (view.mode === 'dead') {
      // Turn to face the snake while its head slides up to the camera.
      const h = snake.pos[0];
      const target = Math.atan2(-(h.x - player.x), -(h.z - player.z));
      view.yaw = lerpAngle(view.yaw, target, Math.min(1, dt * 10));
      view.pitch = lerp(view.pitch, -0.12, Math.min(1, dt * 6));
      const k = Math.min(1, view.deathT / 0.35);
      const fx = -Math.sin(view.yaw);
      const fz = -Math.cos(view.yaw);
      this.head.position.set(lerp(h.x, player.x + fx * 1.5, k), lerp(0.95, 1.35, k), lerp(h.z, player.z + fz * 1.5, k));
      this.head.rotation.y = view.yaw + Math.PI;
    }
    const bob = view.reducedMotion ? 0 : Math.sin(view.bob) * 0.06;
    const shake = view.reducedMotion ? 0 : view.mode === 'dead' ? Math.max(0, 0.25 - view.deathT * 0.25) : 0.05 * view.danger * view.danger;
    const sink = view.mode === 'dead' ? Math.min(0.5, view.deathT) : 0;
    this.camera.position.set(
      player.x + (Math.random() - 0.5) * shake,
      BALANCE.player.eyeHeight + bob + (Math.random() - 0.5) * shake - sink,
      player.z + (Math.random() - 0.5) * shake,
    );
    this.camera.rotation.set(view.pitch, view.yaw, 0);
  }
}

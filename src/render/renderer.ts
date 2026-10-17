import * as THREE from 'three';
import { BALANCE } from '../config/balance';
import { DEFAULT_SETTINGS } from '../settings';
import type { Quality } from '../settings';
import { lerp, lerpAngle } from '../sim/math';
import type { World } from '../sim/types';
import { buildArena, disposeArena } from './arena';
import { loadSky } from './assets';
import { DropViews, StoneViews } from './drops';
import type { Palette } from './palette';
import { PelletViews } from './pellets';
import { SnakeViews } from './snakes';
import { terrainLook } from './terrains';
import { Viewmodel } from './viewmodel';
import type { TerrainLook } from './terrains';

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

/** The title-screen orbit stays this close however big the arena is. */
const MENU_ORBIT_MAX = 34;
/** On the death camera you end up this far in front of the snake's open jaws. */
const DEATH_CAM_DISTANCE = 3;
const SHADOW_MAP_SIZE = 2048;
/** Body rings per segment: smoother at high quality. */
const RINGS_PER_SEGMENT: Record<Quality, number> = { high: 7, low: 4 };
/** Device pixel ratio cap per quality, before the render scale setting. */
const PIXEL_RATIO_CAP: Record<Quality, number> = { high: 2, low: 1 };

/** Draws a World: grounded realistic look (ADR 0002). Keeps no game rules, only meshes. */
export class GameRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(DEFAULT_SETTINGS.fov, 1, 0.05, 600);
  private readonly sun = new THREE.DirectionalLight();
  private readonly hemi = new THREE.HemisphereLight();
  private readonly pmrem: THREE.PMREMGenerator;
  private envMap: THREE.Texture | null = null;
  private arena = new THREE.Group();
  private readonly snakes: SnakeViews;
  private readonly pellets: PelletViews;
  private readonly drops: DropViews;
  private readonly stones: StoneViews;
  private readonly viewmodel = new Viewmodel();
  private look: TerrainLook = terrainLook('plains');
  private world: World | null = null;
  private quality: Quality = DEFAULT_SETTINGS.quality;
  private renderScale = DEFAULT_SETTINGS.renderScale;

  constructor(canvas: HTMLCanvasElement, quality: Quality, palette: Palette) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.autoClear = false;
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
    this.scene.add(this.arena);
    this.snakes = new SnakeViews(this.scene, RINGS_PER_SEGMENT[quality], BALANCE.snake.maxLength);
    this.pellets = new PelletViews(this.scene);
    this.drops = new DropViews(this.scene, palette.tiers);
    this.stones = new StoneViews(this.scene);
    this.camera.rotation.order = 'YXZ';
    this.applyLook();
    this.setQuality(quality);
  }

  setFov(degrees: number): void {
    this.camera.fov = degrees;
    this.camera.updateProjectionMatrix();
  }

  /** Fraction of full resolution to render at. */
  setRenderScale(scale: number): void {
    this.renderScale = scale;
    this.resize();
  }

  /** high: shadows and image-based lighting. low: neither, plus a lower pixel ratio and a coarser body. */
  setQuality(quality: Quality): void {
    const changed = quality !== this.quality;
    this.quality = quality;
    const high = quality === 'high';
    this.renderer.shadowMap.enabled = high;
    this.sun.castShadow = high;
    this.scene.environment = high ? this.envMap : null;
    this.viewmodel.scene.environment = this.scene.environment;
    this.hemi.intensity = high ? this.look.hemi.intensity * 0.25 : this.look.hemi.intensity;
    if (changed) {
      this.snakes.setRings(RINGS_PER_SEGMENT[quality]);
      // Shadow on/off changes shader programs.
      this.scene.traverse((o) => {
        if (o instanceof THREE.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
      });
    }
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_CAP[this.quality]) * this.renderScale);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewmodel.setAspect(w / h);
  }

  render(world: World, view: CameraView, dt: number, now: number): void {
    if (world !== this.world) this.setWorld(world);
    this.pellets.sync(world, dt);
    this.drops.sync(world, dt);
    this.stones.sync(world);
    this.placeSnake(world, view, dt, now);
    this.updateCamera(world, view, dt, now);
    // Two passes: the world, then the first-person hands on top with a fresh depth buffer,
    // so they never clip into rocks or the snake.
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    const p = world.player;
    this.viewmodel.update(world.inventory[world.selectedSlot] ?? null, view.mode === 'play', dt, view.bob, p.moving && p.y === 0 && !p.swimming, view.yaw, view.pitch, view.reducedMotion, p.swimming);
    this.renderer.clearDepth();
    this.renderer.render(this.viewmodel.scene, this.viewmodel.camera);
  }

  /** Blood where a cut landed. */
  spray(x: number, z: number): void {
    this.snakes.spray(x, z);
  }

  /** The hands play the selected item's use motion. */
  playUse(): void {
    this.viewmodel.playUse();
  }

  // --- building ---

  /** Lights, fog and sky for the current terrain. */
  private applyLook(): void {
    const look = this.look;
    this.renderer.toneMappingExposure = look.exposure;
    this.scene.fog = new THREE.Fog(look.fog.color, look.fog.near, look.fog.far);
    this.scene.background = new THREE.Color(look.fog.color);
    this.sun.color.set(look.sun.color);
    this.sun.intensity = look.sun.intensity;
    this.hemi.color.set(look.hemi.sky);
    this.hemi.groundColor.set(look.hemi.ground);
    loadSky(look.sky)
      .then((hdr) => {
        if (look !== this.look) return;
        this.envMap?.dispose();
        this.envMap = this.pmrem.fromEquirectangular(hdr).texture;
        this.scene.background = hdr;
        this.scene.backgroundIntensity = look.backgroundIntensity;
        this.scene.environmentIntensity = look.envIntensity;
        if (this.quality === 'high') this.scene.environment = this.viewmodel.scene.environment = this.envMap;
      })
      .catch((err: unknown) => console.warn('Sky failed to load', err));
  }

  private setWorld(world: World): void {
    this.world = world;
    const look = terrainLook(world.level.terrain);
    if (look !== this.look) {
      this.look = look;
      this.applyLook();
      this.setQuality(this.quality);
    }
    this.scene.remove(this.arena);
    disposeArena(this.arena);
    this.arena = buildArena(world, look);
    this.scene.add(this.arena);
    this.fitSunToArena(world);
    this.pellets.clear();
    this.drops.clear();
    this.snakes.clear();
  }

  /** The sun's shadow camera covers exactly the arena, so shadow detail scales with map size. */
  private fitSunToArena(world: World): void {
    const half = world.grid.half + 4;
    const [dx, dy, dz] = this.look.sun.direction;
    const len = Math.hypot(dx, dy, dz);
    this.sun.position.set((dx / len) * 120, (dy / len) * 120, (dz / len) * 120);
    this.sun.target.position.set(0, 0, 0);
    const cam = this.sun.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 1;
    cam.far = 260;
    cam.updateProjectionMatrix();
  }

  // --- per frame ---

  private placeSnake(world: World, view: CameraView, dt: number, now: number): void {
    this.snakes.update(world, view, dt, now, world.killerId);
  }

  private updateCamera(world: World, view: CameraView, dt: number, now: number): void {
    const { player, grid } = world;
    if (view.mode === 'menu') {
      const a = view.menuT * 0.1;
      const radius = Math.min(grid.half * 1.05, MENU_ORBIT_MAX);
      this.camera.position.set(Math.cos(a) * radius, radius * 0.45, Math.sin(a) * radius);
      this.camera.lookAt(0, 2, 0);
      return;
    }
    let camX = player.x;
    let camZ = player.z;
    if (view.mode === 'dead') {
      // The head stays on its body: it rears up and opens its jaws, and the camera backs off to
      // DEATH_CAM_DISTANCE in front of the snout so you look into them. (Sliding the head to the
      // camera instead left the neck running through the camera.)
      const killer = world.snakes.find((s) => s.id === world.killerId) ?? world.snakes[0];
      const killerView = this.snakes.view(killer?.id ?? null);
      if (!killer || !killerView) return;
      const h = killer.pos[0];
      const k = Math.min(1, view.deathT / 0.35);
      const away = Math.hypot(player.x - h.x, player.z - h.z);
      // Caught: the head is on top of you, so back off along its heading. Crushed: back off away from it.
      const dirX = away > 0.5 ? (player.x - h.x) / away : Math.sin(killerView.headYaw);
      const dirZ = away > 0.5 ? (player.z - h.z) / away : Math.cos(killerView.headYaw);
      const want = Math.max(away, DEATH_CAM_DISTANCE);
      const limit = grid.half - 0.5;
      camX = Math.min(limit, Math.max(-limit, lerp(player.x, h.x + dirX * want, k)));
      camZ = Math.min(limit, Math.max(-limit, lerp(player.z, h.z + dirZ * want, k)));
      const target = Math.atan2(-(h.x - camX), -(h.z - camZ));
      view.yaw = lerpAngle(view.yaw, target, Math.min(1, dt * 10));
      view.pitch = lerp(view.pitch, -0.08, Math.min(1, dt * 6));
      const head = killerView.head;
      head.group.position.set(h.x, lerp(0, 0.45, k), h.z);
      head.group.scale.setScalar(1);
      // Snout toward the camera, tipped up.
      head.group.rotation.set(-0.25 * k, lerpAngle(killerView.headYaw, Math.atan2(camX - h.x, camZ - h.z), k), 0);
      head.setJaw(Math.min(1, view.deathT / 0.5));
      head.flick(now);
    }
    const bob = view.reducedMotion ? 0 : Math.sin(view.bob) * 0.05;
    const shake = view.reducedMotion ? 0 : view.mode === 'dead' ? Math.max(0, 0.25 - view.deathT * 0.25) : 0.05 * view.danger * view.danger;
    const sink = view.mode === 'dead' ? Math.min(0.4, view.deathT) : 0;
    this.camera.position.set(
      camX + (Math.random() - 0.5) * shake,
      BALANCE.player.eyeHeight + player.y + bob + (Math.random() - 0.5) * shake - sink,
      camZ + (Math.random() - 0.5) * shake,
    );
    this.camera.rotation.set(view.pitch, view.yaw, 0);
  }
}

import { Audio8 } from './audio';
import { Input } from './input';
import { LEVELS } from './levels';
import { readPalette } from './render/palette';
import { GameRenderer } from './render/renderer';
import type { CameraView } from './render/renderer';
import { BALANCE } from './config/balance';
import { clamp } from './sim/math';
import { createWorld, dangerLevel, drainEvents, gapToSnake, scoreOf, updateDemo, updateWorld } from './sim/world';
import type { World } from './sim/types';
import { loadBest, saveBest } from './storage';
import { $ } from './ui/dom';
import { Hud } from './ui/hud';
import { Panels } from './ui/panels';

export type GameState = 'menu' | 'play' | 'paused' | 'dead';

export interface GameOptions {
  seed?: number;
  god: boolean;
}

const DEATH_DELAY_MS = 1100;

/** Owns the state machine and the frame loop. Wires input, sim, renderer, HUD and sound together. */
export class Game {
  state: GameState = 'menu';
  world: World;
  private readonly view = $<HTMLCanvasElement>('view');
  private readonly audio = new Audio8();
  private readonly renderer: GameRenderer;
  private readonly hud: Hud;
  private readonly panels: Panels;
  private readonly input: Input;
  private readonly cam: CameraView;
  private best = loadBest();
  private finalScore = 0;
  private danger = 0;
  private wander = { x: 1, z: 1 };
  private wanderT = 0;
  private last = performance.now();
  /** Debug-panel frame stats, refreshed once a second. */
  private perf = { windowStart: performance.now(), frames: 0, worstMs: 0, fps: 0, shownWorstMs: 0, shownPeakDelta: 0 };
  private seedCounter: number;
  /** Frames drawn so far. Tests use it to know the loop is alive. */
  frames = 0;

  constructor(private readonly options: GameOptions) {
    const palette = readPalette();
    this.renderer = new GameRenderer(this.view, palette);
    this.hud = new Hud(palette);
    this.input = new Input(this.view, {
      onPause: () => this.pause(),
      onMute: () => this.audio.toggleMute(),
      onEnter: () => {
        if (this.state === 'menu' && this.panels.startVisible) this.start();
      },
    });
    this.panels = new Panels(this.input.touch);
    this.seedCounter = options.seed ?? Math.floor(Math.random() * 0x7fffffff);
    this.cam = {
      mode: 'menu',
      yaw: 0,
      pitch: 0,
      bob: 0,
      menuT: 0,
      deathT: 0,
      danger: 0,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
    this.world = this.newWorld();
    this.bindUI();
    window.addEventListener('resize', () => this.renderer.resize());
    this.panels.setBest(this.best);
    this.panels.show('start');
    requestAnimationFrame((t) => this.frame(t));
  }

  /** A fresh arena. With a fixed ?seed= every run is the same arena; otherwise each run differs. */
  private newWorld(): World {
    const seed = this.options.seed ?? Math.floor(Math.random() * 0x7fffffff);
    this.seedCounter = seed;
    const world = createWorld(LEVELS[0], seed);
    world.invulnerable = this.options.god;
    return world;
  }

  get seed(): number {
    return this.seedCounter;
  }

  private bindUI(): void {
    this.panels.on('startBtn', () => this.start());
    this.panels.on('againBtn', () => this.start());
    this.panels.on('restartBtn', () => this.start());
    this.panels.on('resumeBtn', () => this.resume());
    this.panels.on('menuBtn', () => this.toMenu());
    this.panels.on('pauseBtn', () => this.pause());
  }

  // --- state changes ---

  start(): void {
    this.audio.unlock();
    this.input.reset();
    this.world = this.newWorld();
    this.cam.yaw = this.world.player.yaw;
    this.cam.pitch = 0;
    this.cam.bob = 0;
    this.cam.deathT = 0;
    this.danger = 0;
    this.state = 'play';
    this.input.active = true;
    this.panels.show(null);
    this.panels.setPlayUI(true);
    this.input.requestLock();
    this.audio.start();
  }

  pause(): void {
    if (this.state !== 'play') return;
    this.state = 'paused';
    this.input.active = false;
    this.input.reset();
    // Without this the pointer stays locked and the Resume button cannot be clicked.
    this.input.releaseLock();
    this.panels.show('pause');
  }

  resume(): void {
    this.audio.unlock();
    this.state = 'play';
    this.input.active = true;
    this.panels.show(null);
    this.input.requestLock();
  }

  toMenu(): void {
    this.state = 'menu';
    this.input.active = false;
    this.input.reset();
    this.panels.setPlayUI(false);
    this.world = this.newWorld();
    this.cam.menuT = 0;
    this.panels.show('start');
    this.hud.clearDanger();
  }

  private die(): void {
    this.state = 'dead';
    this.input.active = false;
    this.cam.deathT = 0;
    this.audio.death();
    this.input.releaseLock();
    this.input.reset();
    this.finalScore = scoreOf(this.world);
    const isBest = this.finalScore > this.best;
    if (isBest) {
      this.best = this.finalScore;
      saveBest(this.best);
    }
    this.panels.showDeath({
      cause: this.world.deathCause ?? 'caught',
      elapsed: this.world.elapsed,
      score: this.finalScore,
      length: this.world.snake.cells.length,
      pellets: this.world.pelletsCollected,
      isBest,
      best: this.best,
    });
    window.setTimeout(() => {
      if (this.state === 'dead') {
        this.panels.setPlayUI(false);
        this.panels.show('dead');
      }
    }, DEATH_DELAY_MS);
  }

  // --- per frame ---

  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.trackFrame(now, now - this.last);
    this.last = now;
    this.step(dt);
    this.frames++;
    const w = this.world;
    this.cam.mode = this.state === 'menu' ? 'menu' : this.state === 'dead' ? 'dead' : 'play';
    this.cam.danger = this.danger;
    if (this.state === 'play' || this.state === 'paused') {
      this.cam.yaw = w.player.yaw;
      this.cam.pitch = w.player.pitch;
    }
    this.renderer.render(w, this.cam, dt, now);
    if (this.state !== 'menu') {
      this.hud.drawMap(w);
      this.hud.update(w, this.danger, this.state === 'dead', this.finalScore);
    }
    if (this.panels.startVisible) this.hud.drawMini(dt);
  }

  private trackFrame(now: number, rawMs: number): void {
    const p = this.perf;
    p.frames++;
    p.worstMs = Math.max(p.worstMs, rawMs);
    if (now - p.windowStart < 1000) return;
    p.fps = (p.frames * 1000) / (now - p.windowStart);
    p.shownWorstMs = p.worstMs;
    p.shownPeakDelta = this.input.takePeakDelta();
    p.frames = 0;
    p.worstMs = 0;
    p.windowStart = now;
  }

  private step(dt: number): void {
    const w = this.world;
    if (this.state === 'play') {
      const input = this.input.sample();
      updateWorld(w, input, dt);
      if (w.player.moving) this.cam.bob += dt * (w.player.sprinting ? 14 : 9);
      this.danger = dangerLevel(gapToSnake(w));
      this.handleEvents();
      if (w.status === 'dead') this.die();
    } else if (this.state === 'menu') {
      this.cam.menuT += dt;
      this.wanderT -= dt;
      const head = w.snake.cells[0];
      if (this.wanderT <= 0 || (head.x === this.wander.x && head.z === this.wander.z)) {
        const n = w.grid.size;
        this.wander = { x: 1 + w.rng.int(n - 2), z: 1 + w.rng.int(n - 2) };
        this.wanderT = 6;
      }
      updateDemo(w, dt, this.wander.x, this.wander.z);
    } else if (this.state === 'dead') {
      this.cam.deathT += dt;
    }
  }

  private handleEvents(): void {
    for (const e of drainEvents(this.world)) {
      if (e.type === 'pelletCollected') this.audio.pellet();
      else if (e.type === 'snakeAtePellet') this.audio.gulp();
      else if (e.type === 'snakeStep') this.audio.step(e.distance);
    }
  }

  /** A text dump for the ?debug=1 panel. */
  debugText(): string {
    const w = this.world;
    const s = w.snake;
    return [
      `state ${this.state}  seed ${this.seed}`,
      `t ${w.elapsed.toFixed(1)}s  score ${scoreOf(w)}`,
      `snake len ${s.cells.length} (+${s.pendingGrow})  step ${s.interval.toFixed(3)}s`,
      `player ${w.player.x.toFixed(1)},${w.player.z.toFixed(1)}  stam ${clamp(w.player.stamina, 0, 1).toFixed(2)}`,
      `gap ${gapToSnake(w).toFixed(1)}  sprint ${BALANCE.player.sprintSpeed}`,
      `fps ${this.perf.fps.toFixed(0)}  worst frame ${this.perf.shownWorstMs.toFixed(0)}ms  mouse peak ${this.perf.shownPeakDelta.toFixed(0)}px`,
    ].join('\n');
  }
}

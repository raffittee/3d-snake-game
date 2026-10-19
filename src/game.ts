import { Audio8 } from './audio';
import { Input } from './input';
import { LEVELS } from './levels';
import { readPalette } from './render/palette';
import { GameRenderer } from './render/renderer';
import type { CameraView } from './render/renderer';
import { BALANCE } from './config/balance';
import { clamp } from './sim/math';
import { createRng } from './sim/rng';
import type { Rng } from './sim/rng';
import { levelForXp, newRun, offerPerks, pendingPicks, xpForNextLevel } from './sim/run';
import type { RunState } from './sim/run';
import type { PerkId } from './sim/perks';
import { hiddenInGrass } from './sim/tiles';
import { stormAt } from './sim/weather';
import { createWorld, dangerLevel, drainEvents, gapToSnake, nearestSnake, scoreOf, updateDemo, updateWorld } from './sim/world';
import type { SimEvent, World } from './sim/types';
import type { Multiplayer } from './mp';
import type { PanelName } from './ui/panels';
import type { Quality, Settings } from './settings';
import { loadBest, loadSettings, saveBest, saveSettings } from './storage';
import { SettingsForm } from './ui/settings';
import { $ } from './ui/dom';
import { Hud } from './ui/hud';
import { Panels } from './ui/panels';

/** `complete`: the level-complete card. `perk`: picking a perk between levels. `mp`: multiplayer (src/mp.ts runs it). */
export type GameState = 'menu' | 'play' | 'paused' | 'dead' | 'complete' | 'perk' | 'mp';

/** Events that only matter to the player they are about (a sound, a flash): others' are skipped in multiplayer. */
const PERSONAL = new Set<SimEvent['type']>(['pelletCollected', 'died', 'lifeLost', 'secondWind', 'jumped', 'itemPickedUp', 'itemUsed', 'itemSpoiled', 'shotFired', 'firecrackerThrown', 'energyDrink', 'mongooseReleased', 'cleatsOn', 'batteryIn', 'batteryDead', 'macheteSwing', 'shotHit', 'smokeBomb']);

export interface GameOptions {
  seed?: number;
  god: boolean;
  /** ?quality=low forces low graphics quality whatever the saved setting says (e2e uses it). */
  forceQuality?: Quality;
  /** ?level=N starts runs on level N (1-based; debug and playtesting). */
  startLevel?: number;
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
  /** Seconds until your next swish through tall grass. */
  private grassStepT = 0;
  private last = performance.now();
  /** Debug-panel frame stats, refreshed once a second. */
  private perf = { windowStart: performance.now(), frames: 0, worstMs: 0, fps: 0, shownWorstMs: 0, shownPeakDelta: 0 };
  private seedCounter: number;
  /** The run through the campaign: level, perks, XP, banked score. */
  run: RunState;
  /** Perk offers come from their own seeded stream, so they never disturb the arena's randomness. */
  private perkRng: Rng;
  /** Frames drawn so far. Tests use it to know the loop is alive. */
  frames = 0;
  /** Multiplayer: the lobby and matches (src/mp.ts). Loaded on first use, so single player never downloads the network code. */
  mp: Multiplayer | null = null;
  /** Which card the Settings card's Back button returns to. */
  private settingsReturn: PanelName = 'start';

  constructor(private readonly options: GameOptions) {
    const palette = readPalette();
    const settings = loadSettings();
    this.renderer = new GameRenderer(this.view, options.forceQuality ?? settings.quality, palette);
    this.hud = new Hud(palette);
    this.input = new Input(this.view, {
      onPause: () => (this.state === 'mp' ? this.mp?.pause() : this.pause()),
      onMute: () => this.audio.toggleMute(),
      onEnter: () => {
        if (this.state === 'menu' && this.panels.startVisible) this.start();
      },
    });
    this.panels = new Panels(this.input.touch);
    this.seedCounter = options.seed ?? Math.floor(Math.random() * 0x7fffffff);
    this.run = newRun(this.seedCounter);
    this.run.levelIndex = this.firstLevel();
    this.perkRng = createRng(this.seedCounter ^ 0x5bd1e995);
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
    this.applySettings(settings);
    new SettingsForm(settings, (s) => {
      this.applySettings(s);
      saveSettings(s);
    });
    this.bindUI();
    window.addEventListener('resize', () => this.renderer.resize());
    this.panels.setBest(this.best);
    this.panels.show('start');
    requestAnimationFrame((t) => this.frame(t));
  }

  /** A fresh arena for the run's current level. With a fixed ?seed= every run is the same; otherwise each differs. */
  private newWorld(): World {
    const seed = (this.options.seed ?? Math.floor(Math.random() * 0x7fffffff)) + this.run.levelIndex * 7919;
    this.seedCounter = seed;
    const world = createWorld(LEVELS[this.run.levelIndex], seed, this.run.perks);
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
    this.panels.on('completeNextBtn', () => this.next());
    this.panels.on('completeMenuBtn', () => this.toMenu());
    this.panels.on('pauseBtn', () => this.pause());
    this.panels.onPerk((id) => this.pickPerk(id));
    this.panels.on('settingsFromStart', () => this.openSettings('start'));
    this.panels.on('settingsFromPause', () => this.openSettings('pause'));
    // Back returns to whichever card opened it (the title card, the pause card, the lobby...).
    this.panels.on('settingsBack', () => this.panels.show(this.settingsReturn));
    this.panels.on('mpBtn', () => void this.openMultiplayer());
  }

  /** "Play with friends": load the multiplayer code (first time only) and show its card. */
  async openMultiplayer(): Promise<Multiplayer> {
    if (!this.mp) {
      const { Multiplayer } = await import('./mp');
      this.mp ??= new Multiplayer({
        renderer: this.renderer,
        hud: this.hud,
        panels: this.panels,
        audio: this.audio,
        input: this.input,
        cam: this.cam,
        events: (events, world, me) => this.playEvents(events, world, me),
        exit: () => this.toMenu(),
        settings: (back) => this.openSettings(back),
      });
    }
    this.state = 'mp';
    this.mp.open();
    return this.mp;
  }

  private openSettings(back: PanelName): void {
    this.settingsReturn = back;
    this.panels.show('settings');
  }

  private applySettings(s: Settings): void {
    this.input.sensitivity = s.sensitivity;
    this.audio.setVolume(s.volume);
    this.renderer.setFov(s.fov);
    this.renderer.setRenderScale(s.renderScale);
    this.renderer.setQuality(this.options.forceQuality ?? s.quality);
  }

  // --- state changes ---

  /** A new run from Level 1, no perks. */
  start(): void {
    this.run = newRun(this.options.seed ?? Math.floor(Math.random() * 0x7fffffff));
    this.run.levelIndex = this.firstLevel();
    this.perkRng = createRng(this.run.seed ^ 0x5bd1e995);
    this.startLevel();
  }

  private firstLevel(): number {
    return Math.min(LEVELS.length - 1, Math.max(0, (this.options.startLevel ?? 1) - 1));
  }

  /** Play the run's current level: lives full, inventory empty, perks kept. */
  private startLevel(): void {
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
    this.cam.follow = undefined;
    this.run = newRun(this.run.seed);
    this.run.levelIndex = this.firstLevel();
    this.state = 'menu';
    this.input.active = false;
    this.input.reset();
    this.panels.setPlayUI(false);
    this.world = this.newWorld();
    this.cam.menuT = 0;
    this.panels.show('start');
    this.hud.clearDanger();
  }

  /**
   * Shared by death and level complete: stop input, free the pointer, record the run's score so far.
   * Returns whether it is a new best.
   */
  private endRun(): boolean {
    this.input.active = false;
    this.input.releaseLock();
    this.input.reset();
    this.finalScore = this.state === 'dead' ? this.run.score + scoreOf(this.world) : this.run.score;
    const isBest = this.finalScore > this.best;
    if (isBest) {
      this.best = this.finalScore;
      saveBest(this.best);
    }
    return isBest;
  }

  private complete(): void {
    this.state = 'complete';
    this.danger = 0;
    // Bank the level into the run before scoring: the run total is what counts as a best.
    const levelScore = scoreOf(this.world);
    this.run.score += levelScore;
    this.run.xp += this.world.xpGained;
    // Banked: the finished level no longer holds it (else the HUD would count it twice).
    this.world.xpGained = 0;
    const isBest = this.endRun();
    const last = this.run.levelIndex >= LEVELS.length - 1;
    this.panels.showComplete({
      levelNumber: this.run.levelIndex + 1,
      levelName: this.world.level.name,
      elapsed: this.world.elapsed,
      score: levelScore,
      runScore: this.run.score,
      pellets: this.world.pelletsCollected,
      livesLeft: this.world.player.lives,
      picks: pendingPicks(this.run),
      last,
      isBest,
      best: this.best,
    });
    this.panels.setPlayUI(false);
    this.panels.show('complete');
  }

  /** After a level: spend level-ups on perks, then the next level (or the end of the campaign). */
  private next(): void {
    if (pendingPicks(this.run) > 0) {
      const offer = offerPerks(this.perkRng, this.run.perks);
      if (offer.length > 0) {
        this.state = 'perk';
        this.panels.showPerks(offer, this.run.perks, pendingPicks(this.run));
        this.panels.show('perk');
        return;
      }
      // Every perk is already owned: the level-up has nothing to buy.
      this.run.picksSpent = levelForXp(this.run.xp);
    }
    if (this.run.levelIndex < LEVELS.length - 1) {
      this.run.levelIndex++;
      this.startLevel();
    } else {
      // Campaign done (for now): back to the title card; the next start is a new run.
      this.toMenu();
    }
  }

  private pickPerk(id: PerkId): void {
    if (this.state !== 'perk') return;
    this.run.perks.push(id);
    this.run.picksSpent++;
    this.audio.itemPickedUp();
    this.next();
  }

  private die(): void {
    this.state = 'dead';
    this.cam.deathT = 0;
    this.audio.death();
    const isBest = this.endRun();
    this.panels.showDeath({
      cause: this.world.deathCause ?? 'caught',
      levelNumber: this.run.levelIndex + 1,
      levelName: this.world.level.name,
      elapsed: this.world.elapsed,
      score: this.finalScore,
      length: this.world.snakes.reduce((n, s) => n + s.cells.length, 0),
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
    this.frames++;
    // Multiplayer draws its own frame while a round is on.
    if (this.state === 'mp' && this.mp?.frame(dt, now)) return;
    this.step(dt);
    const w = this.world;
    this.cam.mode = this.state === 'menu' || this.state === 'mp' ? 'menu' : this.state === 'dead' ? 'dead' : 'play';
    this.cam.danger = this.danger;
    if (this.state === 'play' || this.state === 'paused') {
      this.cam.yaw = w.player.yaw;
      this.cam.pitch = w.player.pitch;
    }
    this.renderer.render(w, this.cam, dt, now);
    if (this.state !== 'menu' && this.state !== 'mp') {
      this.hud.drawMap(w);
      this.hud.update(w, this.danger, this.state === 'dead', this.finalScore, this.hudRun(w));
    }
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
      if (w.player.moving && w.player.y === 0) this.cam.bob += dt * (w.player.sprinting ? 14 : 9);
      // Walking through tall grass swishes; mud squelches.
      this.grassStepT -= dt;
      if (w.player.moving && w.player.y === 0 && this.grassStepT <= 0) {
        if (hiddenInGrass(w, w.player.x, w.player.z)) {
          this.audio.grassStep();
          this.grassStepT = w.player.sprinting ? 0.24 : 0.36;
        } else if (w.player.inMud) {
          this.audio.mudStep();
          this.grassStepT = w.player.sprinting ? 0.34 : 0.5;
        }
      }
      this.danger = dangerLevel(gapToSnake(w, w.player));
      this.playEvents(drainEvents(w), w, w.player.id);
      if (w.status === 'dead') this.die();
      else if (w.status === 'complete') this.complete();
    } else if (this.state === 'menu' || this.state === 'mp') {
      // The title card, and the multiplayer cards around a match: the demo snake wanders.
      this.cam.menuT += dt;
      this.wanderT -= dt;
      const head = w.snakes[0]?.cells[0] ?? { x: -1, z: -1 };
      if (this.wanderT <= 0 || (head.x === this.wander.x && head.z === this.wander.z)) {
        const n = w.grid.size;
        this.wander = { x: 1 + w.rng.int(n - 2), z: 1 + w.rng.int(n - 2) };
        this.wanderT = 6;
      }
      updateDemo(w, dt, this.wander.x, this.wander.z);
    } else if (this.state === 'dead') {
      this.cam.deathT += dt;
    }
    // Desert wind swells with the sandstorm while you play; silent anywhere else.
    this.audio.setWind(this.state === 'play' ? stormAt(w.level, w.elapsed) : 0);
  }

  /**
   * Sounds and HUD flashes for what happened. `me`: your player (in multiplayer, events about other
   * players' items and lives are theirs, not yours; positional sounds play for everyone).
   */
  private playEvents(events: SimEvent[], world: World, me: number): void {
    const mine = (e: SimEvent): boolean => !('pid' in e) || e.pid === me || !PERSONAL.has(e.type);
    for (const e of events) {
      if (!mine(e)) continue;
      if (e.type === 'pelletCollected') this.audio.pellet();
      else if (e.type === 'snakeAtePellet') this.audio.gulp();
      // In tall grass you can't see it: you hear it rustle, from its side.
      else if (e.type === 'snakeStep') {
        if (e.hidden) this.audio.rustle(this.distanceTo(e.x, e.z, world), this.panOf(e.x, e.z, world));
        // In the dark you track it by sound: its steps carry further there.
        else this.audio.step(this.distanceTo(e.x, e.z, world), this.panOf(e.x, e.z, world), world.level.flashlight ? 30 : 16);
      } else if (e.type === 'firecrackerThrown') this.audio.firecrackerThrown();
      else if (e.type === 'firecrackerLanded') this.audio.fuseHiss(this.distanceTo(e.x, e.z, world), this.panOf(e.x, e.z, world));
      else if (e.type === 'firecrackerBang') {
        this.renderer.bang(e.x, e.z);
        this.audio.firecrackerBang(this.distanceTo(e.x, e.z, world), this.panOf(e.x, e.z, world));
      }
      else if (e.type === 'jumped') this.audio.jump();
      else if (e.type === 'itemSpawned') this.audio.itemSpawned();
      else if (e.type === 'itemPickedUp') this.audio.itemPickedUp();
      else if (e.type === 'itemUsed') this.renderer.playUse();
      else if (e.type === 'shotFired') this.audio.shotFired();
      else if (e.type === 'shotHit') this.audio.shotHit(e.target === 'head');
      else if (e.type === 'snakeStunned') this.hud.flashHit();
      else if (e.type === 'macheteSwing') this.audio.macheteSwing(e.result);
      else if (e.type === 'snakeCut' && e.result !== 'bounce') this.renderer.spray(e.x, e.z);
      else if (e.type === 'snakeSplitWarning') this.audio.splitWarning();
      else if (e.type === 'wallSmashed') this.audio.wallSmashed(this.distanceTo(e.x, e.z, world));
      else if (e.type === 'relicFound' && world.level.goal.kind === 'relicsThenGate' && world.level.goal.relic === 'lantern') this.audio.lanternLit();
      else if (e.type === 'relicFound' || e.type === 'mapFound') this.audio.relicFound();
      else if (e.type === 'energyDrink') this.audio.energyDrink();
      else if (e.type === 'stormWarning') this.audio.stormWarning();
      else if (e.type === 'iceCracking') this.audio.iceCracking(this.distanceTo(e.x, e.z, world), this.panOf(e.x, e.z, world));
      else if (e.type === 'iceBroke') this.audio.iceBroke(this.distanceTo(e.x, e.z, world), this.panOf(e.x, e.z, world));
      else if (e.type === 'cleatsOn') this.audio.cleatsOn();
      else if (e.type === 'bossPhase') this.audio.bossRoar();
      else if (e.type === 'batteryIn') this.audio.batteryIn();
      else if (e.type === 'batteryDead') this.audio.batteryDead();
      else if (e.type === 'doorOpened') this.audio.doorOpened();
      else if (e.type === 'doorShut') this.audio.doorShut();
      else if (e.type === 'doorBash') this.audio.doorBash(this.distanceTo(e.x, e.z, world), this.panOf(e.x, e.z, world));
      else if (e.type === 'doorBroken') this.audio.doorBroken(this.distanceTo(e.x, e.z, world), this.panOf(e.x, e.z, world));
      else if (e.type === 'snakeNoticed') this.audio.snakeNoticed(this.distanceTo(e.x, e.z, world), this.panOf(e.x, e.z, world));
      else if (e.type === 'snakeDefeated') this.audio.gateOpened();
      else if (e.type === 'snakeBurrowed' || e.type === 'snakeSurfaced') this.audio.sandBurst(this.distanceTo(e.x, e.z, world), this.panOf(e.x, e.z, world));
      else if (e.type === 'snakeRising') this.audio.sandRumble(this.distanceTo(e.x, e.z, world), this.panOf(e.x, e.z, world));
      else if (e.type === 'mongooseReleased') this.audio.mongooseReleased();
      else if (e.type === 'mongooseFight') this.audio.mongooseFight(this.distanceTo(e.x, e.z, world), this.panOf(e.x, e.z, world));
      else if (e.type === 'smokeBomb') {
        this.renderer.smokeCloud(e.x, e.z, BALANCE.items.defs.smokeBomb.seconds);
        this.audio.smokeBomb();
      }
      else if (e.type === 'gateOpened') this.audio.gateOpened();
      else if (e.type === 'itemSpoiled') this.audio.itemSpoiled();
      else if (e.type === 'secondWind') this.hud.flashLifeLost();
      else if (e.type === 'lifeLost') {
        this.audio.lifeLost();
        this.hud.flashLifeLost();
      }
      // Multiplayer.
      else if (e.type === 'playerDowned' || e.type === 'playerInfected' || e.type === 'playerOut') {
        if (e.pid === me) {
          this.audio.lifeLost();
          this.hud.flashLifeLost();
        } else this.audio.splitWarning();
      } else if (e.type === 'playerRevived') this.audio.itemPickedUp();
      else if (e.type === 'eggPassed') this.audio.relicFound();
      else if (e.type === 'nestFilled') this.audio.lanternLit();
      else if (e.type === 'playerEscaped') this.audio.gateOpened();
      else if (e.type === 'snakeWhip') this.audio.wallSmashed(this.distanceTo(e.x, e.z, world));
      else if (e.type === 'snakeDash' && e.pid === me) this.audio.sandBurst(0, 0);
    }
  }

  private distanceTo(x: number, z: number, world: World): number {
    return Math.hypot(x - world.player.x, z - world.player.z);
  }

  /** Stereo pan of a sound at (x, z): -1 hard left, 1 hard right of where you face. */
  private panOf(x: number, z: number, world: World): number {
    const p = world.player;
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < 1e-3) return 0;
    // Your right is (cos yaw, -sin yaw) when forward is (-sin yaw, -cos yaw).
    return ((x - p.x) * Math.cos(p.yaw) - (z - p.z) * Math.sin(p.yaw)) / d;
  }

  /** What the HUD shows about the run: level, XP toward the next level-up, the nearest snake for Keen ears. */
  private hudRun(w: World) {
    const xp = this.run.xp + w.xpGained;
    const lv = levelForXp(xp);
    let into = xp;
    for (let i = 0; i < lv; i++) into -= xpForNextLevel(i);
    const near = nearestSnake(w, w.player);
    return {
      levelNumber: this.run.levelIndex + 1,
      levelName: w.level.name,
      xpLevel: lv,
      xpFraction: into / xpForNextLevel(lv),
      keenEars: w.perks.includes('keenEars') && !!near && gapToSnake(w, w.player) < BALANCE.perks.keenEarsRange,
      snakeBearing: near ? Math.atan2(-(near.pos[0].x - w.player.x), -(near.pos[0].z - w.player.z)) - w.player.yaw : 0,
    };
  }

  /** A text dump for the ?debug=1 panel. */
  debugText(): string {
    const w = this.world;
    const s = w.snakes[0];
    return [
      `state ${this.state}  seed ${this.seed}  level ${this.run.levelIndex + 1}  xp ${this.run.xp + w.xpGained}  perks ${this.run.perks.join(',') || '-'}`,
      `t ${w.elapsed.toFixed(1)}s  score ${scoreOf(w)}`,
      `snakes ${w.snakes.map((q) => `${q.cells.length}${q.stump > 0 ? 's' : ''}${q.stunTimer > 0 ? '*' : ''}`).join(' ')}  step ${s ? s.interval.toFixed(3) : '-'}s  lives ${w.player.lives}`,
      `items ${w.player.inventory.map((h, i) => `${i === w.player.selectedSlot ? '>' : ''}${h ? `${h.item}/${h.tier} x${h.uses} ${h.spoilLeft.toFixed(0)}s` : '-'}`).join('  ')}  drops ${w.drops.length}`,
      `player ${w.player.x.toFixed(1)},${w.player.z.toFixed(1)}  stam ${clamp(w.player.stamina, 0, 1).toFixed(2)}`,
      `gap ${gapToSnake(w, w.player).toFixed(1)}  sprint ${BALANCE.player.sprintSpeed}`,
      `fps ${this.perf.fps.toFixed(0)}  worst frame ${this.perf.shownWorstMs.toFixed(0)}ms  mouse peak ${this.perf.shownPeakDelta.toFixed(0)}px`,
      this.mp ? this.mp.debugText() : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
}

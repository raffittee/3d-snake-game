import { BALANCE } from '../config/balance';
import { guideLines } from '../levels/guide';
import { TERRAIN_NAMES } from '../levels/modes';
import type { Palette } from '../render/palette';
import { gapToSnake, scoreOf } from '../sim/world';
import type { World } from '../sim/types';
import { $ } from './dom';
import { ITEM_ICONS, ITEM_NAMES } from './icons';
import { DoorState, Tile, hiddenInGrass } from '../sim/tiles';
import { doorInReach } from '../sim/house';
import { isUnder } from '../sim/snake';

export function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0')}`;
}

/** What the HUD shows about the run (the game layer works it out). */
export interface HudRun {
  levelNumber: number;
  levelName: string;
  xpLevel: number;
  /** 0..1 toward the next level-up. */
  xpFraction: number;
  /** Keen ears: show the arrow, and the snake's bearing relative to where you look (radians, 0 = ahead). */
  keenEars: boolean;
  snakeBearing: number;
}

const FLASH_MS = 600;
/** The spoil ring blinks for the last few seconds of an item's life. */
const SPOIL_WARN_SECONDS = 5;
/** Target minimap size in canvas pixels (2x the CSS size); the real size is a whole number of pixels per cell. */
const MAP_PX = 288;

/** HUD readouts, minimap and the red screen edge. */
export class Hud {
  private readonly time = $('hTime');
  private readonly score = $('hScore');
  private readonly len = $('hLen');
  private readonly gap = $('hGap');
  private readonly lives = $('hLives');
  private readonly livesBox = $('livesBox');
  /** performance.now() until which the red edge flashes after a lost life. */
  private flashUntil = 0;
  private readonly guideGoal = $('gGoal');
  private readonly guideProgress = $('gProgress');
  private readonly guideRule = $('gRule');
  private readonly stam = $('stam');
  private readonly bar = $('stamBar');
  private readonly buffs = $('buffs');
  private buffsShown = '';
  private readonly prompt = $('prompt');
  private readonly promptText = $('promptText');
  private promptShown = '';
  private readonly lightMeter = $('lightMeter');
  private readonly lightBar = $('lightBar');
  private readonly lightFill = $('lightFill');
  private readonly noiseMeter = $('noiseMeter');
  private readonly noiseFill = $('noiseFill');
  private readonly dangerEl = $('danger');
  private readonly cross = $('cross');
  private readonly levelLabel = $('gLevel');
  private readonly xpLabel = $('xpLabel');
  private readonly xpFill = $('xpFill');
  private readonly keenArrow = $('keenArrow');
  private readonly mapCtx: CanvasRenderingContext2D;
  private readonly slots: Array<{ el: HTMLElement; icon: HTMLElement; uses: HTMLElement; shown: string }> = [];

  constructor(private readonly palette: Palette) {
    const map = $<HTMLCanvasElement>('map').getContext('2d');
    if (!map) throw new Error('2D canvas is not available');
    this.mapCtx = map;
    for (let i = 0; i < BALANCE.items.slots; i++) {
      this.slots.push({ el: $(`slot${i}`), icon: $(`slotIcon${i}`), uses: $(`slotUses${i}`), shown: '' });
    }
  }

  /** Inventory slots: icon, uses, tier ring. The DOM changes only when a slot changes; the ring every frame. */
  private updateSlots(world: World): void {
    world.player.inventory.forEach((held, i) => {
      const view = this.slots[i];
      if (!view) return;
      const selected = i === world.player.selectedSlot;
      // Uses are whole numbers, except the swim ring's seconds in the water: show those rounded up.
      const uses = held ? Math.ceil(held.uses - 1e-6) : 0;
      const key = held ? `${held.item}|${held.tier}|${uses}|${selected}` : `empty|${selected}`;
      if (key !== view.shown) {
        view.shown = key;
        view.el.className = `slot${held ? ` ${held.tier}` : ' empty'}${selected ? ' selected' : ''}`;
        view.icon.innerHTML = held ? ITEM_ICONS[held.item] : '';
        view.uses.textContent = held ? (held.item === 'swimRing' ? `${uses}s` : String(uses)) : '';
        view.el.title = held ? `${ITEM_NAMES[held.item]} (${held.tier})` : 'Empty';
      }
      const left = held ? Math.max(0, held.spoilLeft / held.spoilTotal) : 0;
      view.el.style.setProperty('--p', left.toFixed(3));
      view.el.classList.toggle('spoiling', !!held && held.spoilLeft < SPOIL_WARN_SECONDS);
    });
  }

  update(world: World, danger: number, dead: boolean, finalScore: number, run: HudRun): void {
    this.levelLabel.textContent = world.match ? `Round ${world.match.round} \u00b7 ${TERRAIN_NAMES[world.level.terrain]}` : `Level ${run.levelNumber} \u00b7 ${run.levelName}`;
    // Multiplayer: the round clock replaces time and score; lives only count in Snake and Players;
    // steering a snake, you have no stamina, items or gap to watch.
    const mp = world.match;
    const piloting = world.player.snakeId !== null;
    this.setHidden(this.time, !!mp);
    this.setHidden(this.score, !!mp);
    this.setHidden(this.livesBox, (!!mp && mp.mode !== 'snakeAndPlayers') || piloting, true);
    this.setHidden(this.gap, piloting || world.player.out);
    this.setHidden(this.bar.closest('.hud-bottom'), piloting || world.player.out, true);
    this.setHidden(document.querySelector('.slots'), piloting || world.player.out, true);
    this.xpLabel.textContent = `XP \u00b7 ${run.xpLevel}`;
    this.xpFill.style.width = `${(Math.min(1, run.xpFraction) * 100).toFixed(1)}%`;
    this.keenArrow.hidden = !run.keenEars || dead;
    if (run.keenEars) this.keenArrow.style.transform = `rotate(${(-run.snakeBearing).toFixed(3)}rad)`;
    this.time.textContent = formatTime(world.elapsed);
    this.score.textContent = String(dead ? finalScore : scoreOf(world));
    // The longest snake, and how many there are once a cut has split it.
    const longest = world.snakes.reduce((m, s) => Math.max(m, s.cells.length), 0);
    this.len.textContent = world.snakes.length > 1 ? `${longest} \u00d7${world.snakes.length}` : String(longest);
    const gap = gapToSnake(world, world.player);
    this.gap.textContent = `${Math.round(gap)}m`;
    this.gap.classList.toggle('hot', gap < 6);
    const guide = guideLines(world);
    this.guideGoal.textContent = guide.goal;
    this.guideProgress.textContent = guide.progress;
    this.guideRule.textContent = guide.rule;
    this.updateSlots(world);
    this.lives.textContent = String(world.player.lives);
    this.livesBox.classList.toggle('grace', world.player.graceTimer > 0);
    this.stam.style.width = `${(world.player.stamina * 100).toFixed(1)}%`;
    this.bar.classList.toggle('tired', world.player.tired);
    // Energy drink: the bar glows while sprinting is free.
    this.bar.classList.toggle('energized', world.player.energy > 0);
    // Broken house: what R does at the door in front of you, and how far your noise carries.
    const door = dead ? null : doorInReach(world, world.player);
    const promptText = !door || door.state === DoorState.Broken ? '' : door.state === DoorState.Shut ? 'Open door' : 'Shut door';
    if (promptText !== this.promptShown) {
      this.promptShown = promptText;
      this.prompt.hidden = !promptText;
      this.promptText.textContent = promptText;
    }
    // Dark cave: the flashlight's battery.
    const lit = !!world.level.flashlight;
    this.lightMeter.hidden = !lit;
    if (lit) {
      this.lightFill.style.width = `${Math.min(100, (world.player.battery / BALANCE.cave.batteryStart) * 100).toFixed(0)}%`;
      this.lightBar.classList.toggle('low', world.player.battery < BALANCE.cave.batteryLow);
    }
    const ambush = world.level.snake.behavior === 'ambush';
    this.noiseMeter.hidden = !ambush;
    if (ambush) this.noiseFill.style.width = `${Math.min(100, (world.player.noise / BALANCE.noise.slam) * 100).toFixed(0)}%`;
    // Effects still running, with whole seconds left (the DOM only changes when the text does).
    const buffs = [
      world.player.energy > 0 ? `Energy ${Math.ceil(world.player.energy)}s` : '',
      world.player.cleats > 0 ? `Cleats ${Math.ceil(world.player.cleats)}s` : '',
    ].filter(Boolean);
    const text = buffs.join('|');
    if (text !== this.buffsShown) {
      this.buffsShown = text;
      this.buffs.hidden = buffs.length === 0;
      this.buffs.replaceChildren(
        ...buffs.map((b) => {
          const chip = document.createElement('span');
          chip.className = 'buff';
          chip.textContent = b;
          return chip;
        }),
      );
    }
    const flash = Math.max(0, (this.flashUntil - performance.now()) / FLASH_MS) * 0.9;
    this.dangerEl.style.opacity = dead ? '0.9' : Math.max(danger * 0.75, flash).toFixed(3);
  }

  /** Hide a readout (its box: the value's parent, or `el` itself when `self`). Only touches the DOM on a change. */
  private setHidden(el: Element | null, hidden: boolean, self = false): void {
    const box = self ? el : el?.parentElement;
    if (box instanceof HTMLElement && box.hidden !== hidden) box.hidden = hidden;
  }

  /** The crosshair flashes when a stone stuns the snake, so you know the shot landed. */
  flashHit(): void {
    this.cross.classList.remove('hit');
    // Restart the animation even when hits come in quick succession.
    void this.cross.offsetWidth;
    this.cross.classList.add('hit');
  }

  /** Brief red edge when a life is lost. */
  flashLifeLost(): void {
    this.flashUntil = performance.now() + FLASH_MS;
  }

  clearDanger(): void {
    this.flashUntil = 0;
    this.dangerEl.style.opacity = '0';
  }

  /** North-up minimap with the player arrow. Drawn at 2x its CSS size so it stays crisp. */
  drawMap(world: World): void {
    const g = this.mapCtx;
    const p = this.palette;
    const { grid, player } = world;
    const n = grid.size;
    const cs = Math.max(3, Math.floor(MAP_PX / n));
    const canvas = g.canvas;
    if (canvas.width !== n * cs) canvas.width = canvas.height = n * cs;
    const at = (cell: number): number => (cell + 0.5) * cs;
    g.fillStyle = p.ground;
    g.fillRect(0, 0, canvas.width, canvas.height);
    // Corn maze: nothing to see until you find the map.
    if (world.level.minimap?.offUntilMap && world.relicsFound < 1) {
      g.fillStyle = p.start;
      g.font = `600 ${Math.round(canvas.width / 9)}px Inter, system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('No map', canvas.width / 2, canvas.height / 2);
      return;
    }

    // Landmarks: their real footprint, with a bright outline.
    for (const l of world.level.landmarks) {
      g.fillStyle = p.landmark;
      g.beginPath();
      g.arc(at(l.cell.x), at(l.cell.z), (l.size * cs) / 2, 0, Math.PI * 2);
      g.fill();
    }
    // Rocks (solid cells that are not landmarks).
    const landmark = new Set<number>();
    for (const l of world.level.landmarks) {
      const r = (l.size - 1) / 2;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) landmark.add((l.cell.z + dz) * n + l.cell.x + dx);
    }
    g.fillStyle = p.rock;
    for (let i = 0; i < n * n; i++) {
      if (!world.pillars[i] || landmark.has(i)) continue;
      g.beginPath();
      g.arc(at(i % n), at(Math.floor(i / n)), cs * 0.45, 0, Math.PI * 2);
      g.fill();
    }
    // Ruins: low walls light, crumbling walls darker; relics as gold stars; the gate once open.
    // Riverside: water and bridges. Tall grass: the grass patches.
    for (let i = 0; i < n * n; i++) {
      const t = world.tiles[i];
      const fill =
        t === Tile.LowWall ? p.lowWall
        : t === Tile.Crumble ? p.crumble
        : t === Tile.Water ? p.water
        : t === Tile.Bridge ? p.bridge
        : t === Tile.Grass ? p.grass
        : t === Tile.Corn ? p.corn
        : t === Tile.Mud ? p.mud
        : t === Tile.Log ? p.log
        : t === Tile.Pad ? p.pad
        : t === Tile.Ice ? p.ice
        : t === Tile.CrackedIce ? p.crackedIce
        : t === Tile.Hole ? p.hole
        : t === Tile.HouseWall ? p.houseWall
        : t === Tile.Door ? (world.doorState[i] === DoorState.Shut ? p.doorShut : p.doorOpen)
        : t === Tile.Closet ? p.closet
        : t === Tile.CaveWall ? p.rock
        : null;
      if (fill) {
        g.fillStyle = fill;
        g.fillRect((i % n) * cs, Math.floor(i / n) * cs, cs, cs);
      }
    }
    g.fillStyle = p.relic;
    for (const r of world.relics) {
      const cx = at(r.x);
      const cz = at(r.z);
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
        const rad = k % 2 ? cs * 0.35 : cs * 0.85;
        if (k === 0) g.moveTo(cx + Math.cos(a) * rad, cz + Math.sin(a) * rad);
        else g.lineTo(cx + Math.cos(a) * rad, cz + Math.sin(a) * rad);
      }
      g.closePath();
      g.fill();
    }
    if (world.level.gate) {
      g.strokeStyle = world.gateOpen ? p.relic : p.start;
      g.lineWidth = Math.max(1, cs * 0.35);
      g.strokeRect(at(world.gate.x) - cs * 1.2, at(world.gate.z) - cs * 0.6, cs * 2.4, cs * 1.2);
    }
    // Start pad.
    const { start } = world.level;
    g.strokeStyle = p.start;
    g.lineWidth = Math.max(1, cs * 0.2);
    g.beginPath();
    g.arc(at(start.x), at(start.z), cs * 0.6, 0, Math.PI * 2);
    g.stroke();
    // Item drops: diamonds in their tier's color.
    for (const d of world.drops) {
      const cx = at(d.x);
      const cz = at(d.z);
      const r = cs * 0.55;
      g.fillStyle = p.tiers[d.tier];
      g.beginPath();
      g.moveTo(cx, cz - r);
      g.lineTo(cx + r, cz);
      g.lineTo(cx, cz + r);
      g.lineTo(cx - r, cz);
      g.closePath();
      g.fill();
    }
    // Pellets (Tall grass hides them: they are what you search the grass for).
    g.fillStyle = p.pellet;
    if (!world.level.minimap?.hidePellets) {
      for (const pe of world.pellets) {
        g.beginPath();
        g.arc(at(pe.x), at(pe.z), cs * 0.38, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Snakes: one thick line through each one's segments, the head as a red dot. Whatever lies in
    // tall grass is left out: the grass hides it on the map as it does on screen.
    const toMap = (v: number): number => ((v + grid.half) / grid.cell) * cs;
    const dark = !!world.level.minimap?.dark;
    if (dark) {
      // Dark cave: only the cave around you shows (black beyond); never the snakes.
      g.fillStyle = '#000';
      g.beginPath();
      g.rect(0, 0, canvas.width, canvas.height);
      g.arc(toMap(player.x), toMap(player.z), BALANCE.cave.mapRadius * cs, 0, Math.PI * 2, true);
      g.fill();
    }
    for (const snake of dark ? [] : world.snakes) {
      g.strokeStyle = p.snake;
      g.lineWidth = cs * 0.75;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      let drawing = false;
      for (let i = 0; i < snake.pos.length; i++) {
        const q = snake.pos[i];
        // Hidden in tall grass, or under the sand (Burrow): not on the map either.
        if (hiddenInGrass(world, q.x, q.z) || isUnder(snake, i)) {
          drawing = false;
          continue;
        }
        if (drawing) g.lineTo(toMap(q.x), toMap(q.z));
        else g.moveTo(toMap(q.x), toMap(q.z));
        drawing = true;
      }
      g.stroke();
      const head = snake.pos[0];
      if (hiddenInGrass(world, head.x, head.z) || isUnder(snake, 0)) continue;
      g.fillStyle = p.alert;
      g.beginPath();
      g.arc(toMap(head.x), toMap(head.z), cs * 0.62, 0, Math.PI * 2);
      g.fill();
    }
    // Multiplayer: the nest, and everyone else as a dot in their color (a ring when downed).
    const nest = world.match?.nest;
    if (nest) {
      g.strokeStyle = p.pellet;
      g.lineWidth = Math.max(1, cs * 0.4);
      g.beginPath();
      g.arc(at(nest.x), at(nest.z), cs * 1.4, 0, Math.PI * 2);
      g.stroke();
    }
    for (const other of world.players) {
      if (other === player || other.out || other.snakeId !== null) continue;
      g.fillStyle = p.players[other.id % p.players.length];
      g.strokeStyle = g.fillStyle;
      g.lineWidth = Math.max(1, cs * 0.3);
      g.beginPath();
      g.arc(toMap(other.x), toMap(other.z), cs * 0.7, 0, Math.PI * 2);
      if (other.down > 0) g.stroke();
      else g.fill();
      if (other.egg) {
        g.strokeStyle = p.landmark;
        g.beginPath();
        g.arc(toMap(other.x), toMap(other.z), cs * 1.2, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // Player arrow.
    const px = toMap(player.x);
    const pz = toMap(player.z);
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    const k = cs / 3;
    g.fillStyle = p.player;
    g.beginPath();
    g.moveTo(px + fx * 6 * k, pz + fz * 6 * k);
    g.lineTo(px - fx * 3 * k + fz * 3.5 * k, pz - fz * 3 * k - fx * 3.5 * k);
    g.lineTo(px - fx * 3 * k - fz * 3.5 * k, pz - fz * 3 * k + fx * 3.5 * k);
    g.closePath();
    g.fill();
  }
}

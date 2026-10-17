import { BALANCE } from '../config/balance';
import { guideLines } from '../levels/guide';
import type { Palette } from '../render/palette';
import { gapToSnake, scoreOf } from '../sim/world';
import type { World } from '../sim/types';
import { $ } from './dom';
import { ITEM_ICONS, ITEM_NAMES } from './icons';

export function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0')}`;
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
  private readonly dangerEl = $('danger');
  private readonly cross = $('cross');
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
    world.inventory.forEach((held, i) => {
      const view = this.slots[i];
      if (!view) return;
      const selected = i === world.selectedSlot;
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
    this.time.textContent = formatTime(world.elapsed);
    this.score.textContent = String(dead ? finalScore : scoreOf(world));
    this.len.textContent = String(world.snake.cells.length);
    const gap = gapToSnake(world);
    this.gap.textContent = `${Math.round(gap)}m`;
    this.gap.classList.toggle('hot', gap < 6);
    const guide = guideLines(world);
    this.guideGoal.textContent = guide.goal;
    this.guideProgress.textContent = guide.progress;
    this.guideRule.textContent = guide.rule;
    this.updateSlots(world);
    this.lives.textContent = String(world.lives);
    this.livesBox.classList.toggle('grace', world.graceTimer > 0);
    this.stam.style.width = `${(world.player.stamina * 100).toFixed(1)}%`;
    this.bar.classList.toggle('tired', world.player.tired);
    const flash = Math.max(0, (this.flashUntil - performance.now()) / FLASH_MS) * 0.9;
    this.dangerEl.style.opacity = dead ? '0.9' : Math.max(danger * 0.75, flash).toFixed(3);
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
    const { grid, player, snake } = world;
    const n = grid.size;
    const cs = Math.max(3, Math.floor(MAP_PX / n));
    const canvas = g.canvas;
    if (canvas.width !== n * cs) canvas.width = canvas.height = n * cs;
    const at = (cell: number): number => (cell + 0.5) * cs;
    g.fillStyle = p.ground;
    g.fillRect(0, 0, canvas.width, canvas.height);

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
    // Pellets.
    g.fillStyle = p.pellet;
    for (const pe of world.pellets) {
      g.beginPath();
      g.arc(at(pe.x), at(pe.z), cs * 0.38, 0, Math.PI * 2);
      g.fill();
    }
    // Snake: one thick line through its segments, the head as a red dot.
    const toMap = (v: number): number => ((v + grid.half) / grid.cell) * cs;
    g.strokeStyle = p.snake;
    g.lineWidth = cs * 0.75;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    snake.pos.forEach((q, i) => (i ? g.lineTo(toMap(q.x), toMap(q.z)) : g.moveTo(toMap(q.x), toMap(q.z))));
    g.stroke();
    g.fillStyle = p.alert;
    g.beginPath();
    g.arc(toMap(snake.pos[0].x), toMap(snake.pos[0].z), cs * 0.62, 0, Math.PI * 2);
    g.fill();
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

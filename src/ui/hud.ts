import type { Palette } from '../render/palette';
import { gapToSnake, scoreOf } from '../sim/world';
import type { World } from '../sim/types';
import { $ } from './dom';

export function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0')}`;
}

/** HUD readouts, minimap and the red screen edge. */
export class Hud {
  private readonly time = $('hTime');
  private readonly score = $('hScore');
  private readonly len = $('hLen');
  private readonly gap = $('hGap');
  private readonly stam = $('stam');
  private readonly bar = $('stamBar');
  private readonly dangerEl = $('danger');
  private readonly mapCtx: CanvasRenderingContext2D;
  private readonly miniCtx: CanvasRenderingContext2D;
  private miniStep = 0;
  private miniAcc = 0;

  constructor(private readonly palette: Palette) {
    const map = $<HTMLCanvasElement>('map').getContext('2d');
    const mini = $<HTMLCanvasElement>('mini').getContext('2d');
    if (!map || !mini) throw new Error('2D canvas is not available');
    this.mapCtx = map;
    this.miniCtx = mini;
    this.mapCtx.imageSmoothingEnabled = false;
  }

  update(world: World, danger: number, dead: boolean, finalScore: number): void {
    this.time.textContent = formatTime(world.elapsed);
    this.score.textContent = String(dead ? finalScore : scoreOf(world));
    this.len.textContent = String(world.snake.cells.length);
    const gap = gapToSnake(world);
    this.gap.textContent = `${Math.round(gap)}m`;
    this.gap.classList.toggle('hot', gap < 6);
    this.stam.style.width = `${(world.player.stamina * 100).toFixed(1)}%`;
    this.bar.classList.toggle('tired', world.player.tired);
    this.dangerEl.style.opacity = dead ? '0.9' : (danger * 0.75).toFixed(3);
  }

  clearDanger(): void {
    this.dangerEl.style.opacity = '0';
  }

  /** North-up minimap with the player arrow. */
  drawMap(world: World): void {
    const g = this.mapCtx;
    const p = this.palette;
    const { grid, player, snake } = world;
    const n = grid.size;
    const cs = 5;
    g.fillStyle = p.lcd;
    g.fillRect(0, 0, 140, 140);
    g.fillStyle = p.mid;
    for (let i = 0; i < n * n; i++) if (world.pillars[i]) g.fillRect((i % n) * cs, Math.floor(i / n) * cs, cs, cs);
    g.fillStyle = p.ink;
    for (const pe of world.pellets) g.fillRect(pe.x * cs + 1, pe.z * cs + 1, 3, 3);
    for (let i = snake.cells.length - 1; i >= 0; i--) {
      const c = snake.cells[i];
      g.fillStyle = i === 0 ? p.alert : p.deep;
      g.fillRect(c.x * cs, c.z * cs, cs - (i ? 1 : 0), cs - (i ? 1 : 0));
    }
    const px = ((player.x + grid.half) / grid.cell) * cs;
    const pz = ((player.z + grid.half) / grid.cell) * cs;
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    g.fillStyle = p.deep;
    g.beginPath();
    g.moveTo(px + fx * 6, pz + fz * 6);
    g.lineTo(px - fx * 3 + fz * 3.5, pz - fz * 3 - fx * 3.5);
    g.lineTo(px - fx * 3 - fz * 3.5, pz - fz * 3 + fx * 3.5);
    g.closePath();
    g.fill();
  }

  /** The little 2D snake on the title card. */
  drawMini(dt: number): void {
    this.miniAcc += dt;
    if (this.miniAcc > 0.13) {
      this.miniAcc = 0;
      this.miniStep++;
    }
    const g = this.miniCtx;
    const p = this.palette;
    const cs = 5;
    const w = 28;
    g.fillStyle = p.lcd;
    g.fillRect(0, 0, 140, 25);
    const run = (this.miniStep % (w + 16)) - 2;
    g.fillStyle = p.alert;
    g.fillRect(run * cs, 2 * cs, 4, 4);
    for (let i = 0; i < 8; i++) {
      const x = run - 4 - i;
      g.fillStyle = i === 0 ? p.deep : p.ink;
      if (x >= 0 && x < w) g.fillRect(x * cs, 2 * cs, 4, 4);
    }
  }
}


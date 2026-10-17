import type { LevelConfig } from '../levels/types';
import type { Grid } from './grid';
import type { Rng } from './rng';
import { Tile } from './tiles';
import type { Cell } from './types';

export interface Layout {
  tiles: Uint8Array;
  /** Relic cells (Ruins), empty elsewhere. */
  relics: Cell[];
  /** An exit the layout places itself (Riverside: the dock on the far bank, at the water's edge). */
  exit?: Cell;
}

interface Room {
  x0: number;
  z0: number;
  w: number;
  h: number;
}

/** Areas that stay plain ground: the start, the snake's starting lane, the gate, landmarks, the outer ring. */
function keepOut(level: LevelConfig, n: number, ring = true): (x: number, z: number) => boolean {
  const { start, snake, gate, landmarks } = level;
  return (x, z) => {
    if (ring && (x <= 0 || z <= 0 || x >= n - 1 || z >= n - 1)) return true;
    if (landmarks.some((l) => Math.abs(x - l.cell.x) <= (l.size - 1) / 2 + 2 && Math.abs(z - l.cell.z) <= (l.size - 1) / 2 + 2)) return true;
    if (Math.abs(x - start.x) <= 3 && Math.abs(z - start.z) <= 3) return true;
    if (z >= snake.spawn.z - 1 && z <= snake.spawn.z + 2 && x <= snake.spawn.x + 3) return true;
    if (gate && Math.abs(x - gate.x) <= 3 && Math.abs(z - gate.z) <= 4) return true;
    return false;
  };
}

/**
 * Ruins: walled rooms with doorways. Each wall cell is a low wall (jump it) or a crumbling wall
 * (the snake smashes it). Every side of a room gets a doorway two cells wide, so you can always walk
 * in. One relic waits inside each of the first rooms.
 */
function ruins(level: LevelConfig, grid: Grid, rng: Rng, rooms: number, crumbleShare: number, relicCount: number): Layout {
  const n = grid.size;
  const tiles = new Uint8Array(n * n);
  const off = keepOut(level, n);
  const placed: Room[] = [];
  for (let tries = 0; tries < 400 && placed.length < rooms; tries++) {
    const w = 6 + rng.int(5);
    const h = 6 + rng.int(5);
    const x0 = 2 + rng.int(n - w - 4);
    const z0 = 2 + rng.int(n - h - 4);
    // Rooms keep two cells of open ground between them, and stay out of the keep-out areas.
    if (placed.some((r) => x0 < r.x0 + r.w + 2 && r.x0 < x0 + w + 2 && z0 < r.z0 + r.h + 2 && r.z0 < z0 + h + 2)) continue;
    let clear = true;
    for (let z = z0 - 1; z <= z0 + h && clear; z++) for (let x = x0 - 1; x <= x0 + w && clear; x++) if (off(x, z)) clear = false;
    if (!clear) continue;
    placed.push({ x0, z0, w, h });
  }
  for (const r of placed) {
    const wall = (x: number, z: number) => {
      tiles[z * n + x] = rng.next() < crumbleShare ? Tile.Crumble : Tile.LowWall;
    };
    for (let x = r.x0; x < r.x0 + r.w; x++) {
      wall(x, r.z0);
      wall(x, r.z0 + r.h - 1);
    }
    for (let z = r.z0 + 1; z < r.z0 + r.h - 1; z++) {
      wall(r.x0, z);
      wall(r.x0 + r.w - 1, z);
    }
    // A doorway two cells wide in the middle part of every side.
    const door = (len: number) => 1 + rng.int(Math.max(1, len - 4));
    const dTop = r.x0 + door(r.w);
    const dBottom = r.x0 + door(r.w);
    const dLeft = r.z0 + door(r.h);
    const dRight = r.z0 + door(r.h);
    for (let k = 0; k < 2; k++) {
      tiles[r.z0 * n + dTop + k] = Tile.Open;
      tiles[(r.z0 + r.h - 1) * n + dBottom + k] = Tile.Open;
      tiles[(dLeft + k) * n + r.x0] = Tile.Open;
      tiles[(dRight + k) * n + r.x0 + r.w - 1] = Tile.Open;
    }
  }
  // One relic per room (as many rooms as there are relics), somewhere inside it.
  const relics: Cell[] = [];
  const order = placed.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const i of order) {
    if (relics.length >= relicCount) break;
    const r = placed[i];
    relics.push({ x: r.x0 + 2 + rng.int(r.w - 4), z: r.z0 + 2 + rng.int(r.h - 4) });
  }
  // Not enough rooms: the rest lie in the open, away from the start.
  for (let tries = 0; relics.length < relicCount && tries < 500; tries++) {
    const x = 2 + rng.int(n - 4);
    const z = 2 + rng.int(n - 4);
    if (off(x, z) || tiles[z * n + x] !== Tile.Open || relics.some((c) => c.x === x && c.z === z)) continue;
    relics.push({ x, z });
  }
  return { tiles, relics };
}

/**
 * Riverside: a winding river from the west edge to the east edge (a sine through the middle), and
 * plank bridges two cells wide spread along it. You start on the south bank; the dock is on the north.
 */
function river(grid: Grid, rng: Rng, width: number, bridges: number, amplitude: number): Layout {
  const n = grid.size;
  const tiles = new Uint8Array(n * n);
  const phase = rng.next() * Math.PI * 2;
  const period = n * (0.7 + rng.next() * 0.4);
  const centre = (x: number) => Math.round(n / 2 + amplitude * Math.sin((x / period) * Math.PI * 2 + phase));
  for (let x = 0; x < n; x++) {
    const c = centre(x);
    for (let z = c - Math.floor(width / 2); z < c - Math.floor(width / 2) + width; z++) tiles[z * n + x] = Tile.Water;
  }
  // Bridges: spread evenly, a little jitter, two cells wide, straight across the water.
  for (let b = 0; b < bridges; b++) {
    const x0 = Math.round(((b + 1) * n) / (bridges + 1)) + rng.int(5) - 2;
    for (let x = x0; x < x0 + 2; x++) {
      for (let z = 0; z < n; z++) if (tiles[z * n + x] === Tile.Water) tiles[z * n + x] = Tile.Bridge;
    }
  }
  // The dock: on the north bank at the water's edge, toward the east end (far from where you start).
  const dx = n - 8;
  let dz = 0;
  while (dz < n - 1 && tiles[(dz + 1) * n + dx] !== Tile.Water && tiles[(dz + 1) * n + dx] !== Tile.Bridge) dz++;
  return { tiles, relics: [], exit: { x: dx, z: dz } };
}

/** The level's ground: plain everywhere (scatter), or generated (ruins, river). Seeded, so a seed gives the same map. */
export function generateLayout(level: LevelConfig, grid: Grid, rng: Rng): Layout {
  const n = grid.size;
  const layout = level.layout ?? { kind: 'scatter' };
  const relicCount = level.goal.kind === 'relicsThenGate' ? level.goal.relics : 0;
  if (layout.kind === 'ruins') return ruins(level, grid, rng, layout.rooms, layout.crumbleShare, relicCount);
  if (layout.kind === 'river') return river(grid, rng, layout.width, layout.bridges, layout.amplitude);
  return { tiles: new Uint8Array(n * n), relics: [] };
}

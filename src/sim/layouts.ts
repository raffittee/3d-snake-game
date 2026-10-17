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

/**
 * Tall grass: rounded patches of grass with wobbly edges, open clearings between them. The first
 * patch is centered on the snake's start so it begins hidden; the start and the landmarks stay clear.
 */
function meadow(level: LevelConfig, grid: Grid, rng: Rng, patches: number, minRadius: number, maxRadius: number): Layout {
  const n = grid.size;
  const tiles = new Uint8Array(n * n);
  const { start, snake, landmarks } = level;
  const clear = (x: number, z: number): boolean =>
    (Math.abs(x - start.x) <= 4 && Math.abs(z - start.z) <= 4) ||
    landmarks.some((l) => Math.abs(x - l.cell.x) <= (l.size - 1) / 2 + 1 && Math.abs(z - l.cell.z) <= (l.size - 1) / 2 + 1);
  for (let p = 0; p < patches; p++) {
    const cx = p === 0 ? snake.spawn.x - Math.floor(snake.startLength / 2) : 3 + rng.int(n - 6);
    const cz = p === 0 ? snake.spawn.z : 3 + rng.int(n - 6);
    const r = p === 0 ? Math.max(maxRadius * 0.8, snake.startLength / 2 + 2) : minRadius + rng.next() * (maxRadius - minRadius);
    // Two harmonics around the rim make each patch a blob, not a circle.
    const a3 = 0.12 + rng.next() * 0.14;
    const a5 = 0.06 + rng.next() * 0.1;
    const p3 = rng.next() * Math.PI * 2;
    const p5 = rng.next() * Math.PI * 2;
    const reach = Math.ceil(r * (1 + a3 + a5));
    for (let z = Math.max(1, cz - reach); z <= Math.min(n - 2, cz + reach); z++) {
      for (let x = Math.max(1, cx - reach); x <= Math.min(n - 2, cx + reach); x++) {
        const ang = Math.atan2(z - cz, x - cx);
        const rim = r * (1 + a3 * Math.sin(3 * ang + p3) + a5 * Math.sin(5 * ang + p5));
        if (Math.hypot(x - cx, z - cz) <= rim && !clear(x, z)) tiles[z * n + x] = Tile.Grass;
      }
    }
  }
  // The snake's whole starting body lies in grass, even where a rim wobbled in.
  for (let i = 0; i < snake.startLength; i++) tiles[snake.spawn.z * n + snake.spawn.x - i] = Tile.Grass;
  return { tiles, relics: [] };
}

/**
 * Corn maze: rooms of 2x2 cells on a 3-cell lattice, joined by 2-cell gaps knocked through the
 * 1-cell corn walls between them (a seeded depth-first maze), then a share of the remaining inner
 * walls knocked through too so the maze has loops. Clearings are cut for the start, the landmarks,
 * the exit and the snakes' starting lanes. The map lies in the open cell farthest from the start
 * by walking (not near the exit), so finding it means crossing the maze.
 */
function maze(level: LevelConfig, grid: Grid, rng: Rng, loops: number): Layout {
  const n = grid.size;
  const tiles = new Uint8Array(n * n).fill(Tile.Corn);
  const rooms = Math.floor((n - 1) / 3);
  const open = (x: number, z: number) => {
    if (x >= 1 && z >= 1 && x < n - 1 && z < n - 1) tiles[z * n + x] = Tile.Open;
  };
  const clear = (x0: number, z0: number, x1: number, z1: number) => {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) open(x, z);
  };
  // The 2-cell gap between room (i, j) and its neighbor in direction (di, dj).
  const knock = (i: number, j: number, di: number, dj: number) => {
    if (di) for (let d = 1; d <= 2; d++) open(3 * (i + (di > 0 ? 1 : 0)), 3 * j + d);
    else for (let d = 1; d <= 2; d++) open(3 * i + d, 3 * (j + (dj > 0 ? 1 : 0)));
  };
  for (let j = 0; j < rooms; j++) for (let i = 0; i < rooms; i++) clear(3 * i + 1, 3 * j + 1, 3 * i + 2, 3 * j + 2);

  const seen = new Uint8Array(rooms * rooms);
  const si = Math.min(rooms - 1, Math.floor((level.start.x - 1) / 3));
  const sj = Math.min(rooms - 1, Math.floor((level.start.z - 1) / 3));
  const stack: Array<[number, number]> = [[si, sj]];
  seen[sj * rooms + si] = 1;
  const dirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const next = dirs.filter(([di, dj]) => {
      const a = i + di;
      const b = j + dj;
      return a >= 0 && b >= 0 && a < rooms && b < rooms && !seen[b * rooms + a];
    });
    if (!next.length) {
      stack.pop();
      continue;
    }
    const [di, dj] = next[rng.int(next.length)];
    knock(i, j, di, dj);
    seen[(j + dj) * rooms + i + di] = 1;
    stack.push([i + di, j + dj]);
  }
  // Loops: knock through some of the walls the maze left standing.
  for (let j = 0; j < rooms; j++) {
    for (let i = 0; i < rooms; i++) {
      if (i + 1 < rooms && tiles[(3 * j + 1) * n + 3 * (i + 1)] === Tile.Corn && rng.next() < loops) knock(i, j, 1, 0);
      if (j + 1 < rooms && tiles[3 * (j + 1) * n + 3 * i + 1] === Tile.Corn && rng.next() < loops) knock(i, j, 0, 1);
    }
  }

  const { start, snake, landmarks } = level;
  clear(start.x - 3, start.z - 2, start.x + 3, start.z + 1);
  for (const l of landmarks) {
    const r = (l.size - 1) / 2 + 2;
    clear(l.cell.x - r, l.cell.z - r, l.cell.x + r, l.cell.z + r);
  }
  const exit = level.gate ?? { x: Math.floor(n / 2), z: 1 };
  clear(exit.x - 2, exit.z, exit.x + 2, exit.z + 1);
  // Behind the exit gate, the field's fence, not more corn: clear the outer row there too.
  for (let x = exit.x - 2; x <= exit.x + 2; x++) if (exit.z <= 1 && x > 0 && x < n - 1) tiles[x] = Tile.Open;
  for (const s of [snake.spawn, ...(snake.extraSpawns ?? [])]) clear(s.x - snake.startLength, s.z, s.x + 1, s.z + 1);

  // The map: the open cell farthest from the start by walking, away from the exit and the landmarks.
  const dist = new Int32Array(n * n).fill(-1);
  const solid = (x: number, z: number) => landmarks.some((l) => Math.abs(x - l.cell.x) <= (l.size - 1) / 2 && Math.abs(z - l.cell.z) <= (l.size - 1) / 2);
  const q: number[] = [start.z * n + start.x];
  dist[q[0]] = 0;
  let best = q[0];
  for (let h = 0; h < q.length; h++) {
    const id = q[h];
    const x = id % n;
    const z = (id / n) | 0;
    const awayFrom = (c: Cell, r: number) => Math.abs(x - c.x) > r || Math.abs(z - c.z) > r;
    const far = awayFrom(exit, 12) && [snake.spawn, ...(snake.extraSpawns ?? [])].every((s) => awayFrom(s, 8));
    if (far && dist[id] > dist[best]) best = id;
    for (const [dx, dz] of dirs) {
      const nx = x + dx;
      const nz = z + dz;
      const nid = nz * n + nx;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n || dist[nid] >= 0 || tiles[nid] !== Tile.Open || solid(nx, nz)) continue;
      dist[nid] = dist[id] + 1;
      q.push(nid);
    }
  }
  return { tiles, relics: [{ x: best % n, z: (best / n) | 0 }], exit };
}

/** Smooth seeded noise in 0..1 over the grid: two octaves of bilinear value noise. */
function valueNoise(n: number, rng: Rng): Float32Array {
  const out = new Float32Array(n * n);
  for (const [cells, weight] of [[7, 1], [15, 0.45]] as const) {
    const g = cells + 1;
    const v = Array.from({ length: g * g }, () => rng.next());
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const fx = (x / (n - 1)) * cells;
        const fz = (z / (n - 1)) * cells;
        const ix = Math.min(cells - 1, Math.floor(fx));
        const iz = Math.min(cells - 1, Math.floor(fz));
        const tx = fx - ix;
        const tz = fz - iz;
        const sx = tx * tx * (3 - 2 * tx);
        const sz = tz * tz * (3 - 2 * tz);
        const a = v[iz * g + ix] + (v[iz * g + ix + 1] - v[iz * g + ix]) * sx;
        const b = v[(iz + 1) * g + ix] + (v[(iz + 1) * g + ix + 1] - v[(iz + 1) * g + ix]) * sx;
        out[z * n + x] += (a + (b - a) * sz) * weight;
      }
    }
  }
  return out;
}

/**
 * Swamp: islands of firm ground (the highest `firm` share of a noise field) in mud. Every island is
 * joined to the start's island by a firm path across the mud: a fallen log (straight runs) or a chain
 * of lily pads. The start, the exit (the boat's jetty) and the landmarks stand on firm ground. The
 * lanterns stand on islands, spread apart and away from the start.
 */
function swamp(level: LevelConfig, grid: Grid, rng: Rng, firm: number, lanterns: number): Layout {
  const n = grid.size;
  const noise = valueNoise(n, rng);
  const sorted = Array.from(noise).sort((a, b) => b - a);
  const cut = sorted[Math.floor(sorted.length * firm)];
  const tiles = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) tiles[i] = noise[i] >= cut ? Tile.Open : Tile.Mud;
  const setFirm = (x0: number, z0: number, x1: number, z1: number) => {
    for (let z = Math.max(0, z0); z <= Math.min(n - 1, z1); z++) for (let x = Math.max(0, x0); x <= Math.min(n - 1, x1); x++) tiles[z * n + x] = Tile.Open;
  };
  const { start, landmarks } = level;
  setFirm(start.x - 4, start.z - 4, start.x + 4, start.z + 4);
  const exit = level.gate ?? { x: Math.floor(n / 2), z: 1 };
  setFirm(exit.x - 3, exit.z, exit.x + 3, exit.z + 3);
  for (const l of landmarks) {
    const r = (l.size - 1) / 2 + 1;
    setFirm(l.cell.x - r, l.cell.z - r, l.cell.x + r, l.cell.z + r);
  }

  // Islands: groups of firm cells joined side by side.
  const island = new Int32Array(n * n).fill(-1);
  const members: number[][] = [];
  for (let i = 0; i < n * n; i++) {
    if (tiles[i] !== Tile.Open || island[i] >= 0) continue;
    const id = members.length;
    const list: number[] = [i];
    island[i] = id;
    for (let h = 0; h < list.length; h++) {
      const x = list[h] % n;
      const z = (list[h] / n) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const nz = z + dz;
        const ni = nz * n + nx;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n || tiles[ni] !== Tile.Open || island[ni] >= 0) continue;
        island[ni] = id;
        list.push(ni);
      }
    }
    members.push(list);
  }
  // Join every island to the ones already joined to the start, nearest first, by an L-shaped path:
  // a log (straight runs) or a line of lily pads across the mud.
  const joined = new Set<number>([island[start.z * n + start.x]]);
  const joinedCells = () => members.flatMap((m, id) => (joined.has(id) ? m : []));
  const pending = members.map((_, id) => id).filter((id) => !joined.has(id));
  while (pending.length) {
    const reached = joinedCells();
    let best = { id: -1, a: 0, b: 0, d: Infinity };
    for (const id of pending) {
      // Sample the island's cells (enough to find a close pair cheaply).
      const m = members[id];
      for (let k = 0; k < m.length; k += Math.max(1, Math.floor(m.length / 24))) {
        const a = m[k];
        for (let j = 0; j < reached.length; j += Math.max(1, Math.floor(reached.length / 160))) {
          const b = reached[j];
          const d = Math.abs((a % n) - (b % n)) + Math.abs(((a / n) | 0) - ((b / n) | 0));
          if (d < best.d) best = { id, a, b, d };
        }
      }
    }
    const path = rng.next() < 0.5 ? Tile.Log : Tile.Pad;
    let x = best.a % n;
    let z = (best.a / n) | 0;
    const tx = best.b % n;
    const tz = (best.b / n) | 0;
    const lay = () => {
      if (tiles[z * n + x] === Tile.Mud) tiles[z * n + x] = path;
    };
    const alongX = () => {
      while (x !== tx) {
        x += Math.sign(tx - x);
        lay();
      }
    };
    const alongZ = () => {
      while (z !== tz) {
        z += Math.sign(tz - z);
        lay();
      }
    };
    if (rng.next() < 0.5) {
      alongX();
      alongZ();
    } else {
      alongZ();
      alongX();
    }
    joined.add(best.id);
    pending.splice(pending.indexOf(best.id), 1);
  }

  // Lanterns on firm ground, away from the start, the exit and each other.
  const relics: Cell[] = [];
  for (let tries = 0; relics.length < lanterns && tries < 4000; tries++) {
    const x = 3 + rng.int(n - 6);
    const z = 3 + rng.int(n - 6);
    if (tiles[z * n + x] !== Tile.Open) continue;
    if (Math.hypot(x - start.x, z - start.z) < 16 || Math.hypot(x - exit.x, z - exit.z) < 10) continue;
    if (landmarks.some((l) => Math.abs(x - l.cell.x) <= 3 && Math.abs(z - l.cell.z) <= 3)) continue;
    const spacing = tries < 3000 ? 16 : 10;
    if (relics.some((r) => Math.hypot(r.x - x, r.z - z) < spacing)) continue;
    relics.push({ x, z });
  }
  return { tiles, relics, exit };
}

/**
 * Desert: open sand (rocks come from the pillar pass). The relics (water flasks) lie far from the
 * start, far from each other and away from the exit (the oasis), so collecting them crosses the map.
 */
function desert(level: LevelConfig, grid: Grid, rng: Rng, flasks: number): Layout {
  const n = grid.size;
  const tiles = new Uint8Array(n * n);
  const exit = level.gate ?? { x: Math.floor(n / 2), z: 1 };
  const relics: Cell[] = [];
  for (let tries = 0; relics.length < flasks && tries < 4000; tries++) {
    const x = 3 + rng.int(n - 6);
    const z = 3 + rng.int(n - 6);
    if (Math.hypot(x - level.start.x, z - level.start.z) < 18 || Math.hypot(x - exit.x, z - exit.z) < 12) continue;
    if (level.landmarks.some((l) => Math.abs(x - l.cell.x) <= 3 && Math.abs(z - l.cell.z) <= 3)) continue;
    const spacing = tries < 3000 ? 18 : 10;
    if (relics.some((r) => Math.hypot(r.x - x, r.z - z) < spacing)) continue;
    relics.push({ x, z });
  }
  return { tiles, relics, exit };
}

/**
 * Frozen lake: ice everywhere but a snowy shore along the edges, the start and the landmarks, and a
 * few snowy islands; `cracks` patches (2x2 to 3x3) of cracked ice spread over the ice, away from the
 * start and from each other.
 */
function lake(level: LevelConfig, grid: Grid, rng: Rng, cracks: number): Layout {
  const n = grid.size;
  const noise = valueNoise(n, rng);
  const tiles = new Uint8Array(n * n).fill(Tile.Ice);
  const { start, landmarks } = level;
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const edge = Math.min(x, z, n - 1 - x, n - 1 - z);
      // A shore three cells deep (a little ragged), and islands where the noise peaks.
      if (edge < 2 + Math.round(noise[z * n + x] * 2) || noise[z * n + x] > 1.22) tiles[z * n + x] = Tile.Open;
    }
  }
  const setOpen = (x0: number, z0: number, x1: number, z1: number) => {
    for (let z = Math.max(0, z0); z <= Math.min(n - 1, z1); z++) for (let x = Math.max(0, x0); x <= Math.min(n - 1, x1); x++) tiles[z * n + x] = Tile.Open;
  };
  setOpen(start.x - 4, start.z - 3, start.x + 4, start.z + 3);
  for (const l of landmarks) {
    const r = (l.size - 1) / 2 + 1;
    setOpen(l.cell.x - r, l.cell.z - r, l.cell.x + r, l.cell.z + r);
  }
  const placed: Cell[] = [];
  for (let tries = 0; placed.length < cracks && tries < 3000; tries++) {
    const w = 2 + rng.int(2);
    const h = 2 + rng.int(2);
    const x0 = 3 + rng.int(n - 6 - w);
    const z0 = 3 + rng.int(n - 6 - h);
    if (Math.hypot(x0 - start.x, z0 - start.z) < 8) continue;
    if (placed.some((p) => Math.abs(p.x - x0) < 6 && Math.abs(p.z - z0) < 6)) continue;
    let ice = true;
    for (let z = z0; z < z0 + h && ice; z++) for (let x = x0; x < x0 + w && ice; x++) ice = tiles[z * n + x] === Tile.Ice;
    if (!ice) continue;
    for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) tiles[z * n + x] = Tile.CrackedIce;
    placed.push({ x: x0, z: z0 });
  }
  return { tiles, relics: [] };
}

/**
 * Broken house: the arena split again and again (a seeded binary split) into rooms at least
 * `roomMin` cells across, each split a full-height wall with a doorway two cells wide (most hold a
 * door; some are bare, a few walls have a hole knocked in them too). Closets stand against the walls
 * of most rooms, and a few piles of rubble lie about. The start, the front door (the exit, on the
 * north wall) and the snake's starting lane are clear. The key lies in the room farthest from the
 * start by walking.
 */
function house(level: LevelConfig, grid: Grid, rng: Rng, roomMin: number): Layout {
  const n = grid.size;
  const tiles = new Uint8Array(n * n);
  const rooms: Room[] = [];
  const split = (x0: number, z0: number, x1: number, z1: number) => {
    const w = x1 - x0 + 1;
    const h = z1 - z0 + 1;
    const canX = w >= roomMin * 2 + 1;
    const canZ = h >= roomMin * 2 + 1;
    if (!canX && !canZ) {
      rooms.push({ x0, z0, w, h });
      return;
    }
    const alongX = canX && (!canZ || w >= h ? rng.next() < 0.75 : rng.next() < 0.25);
    if (alongX) {
      const wx = x0 + roomMin + rng.int(w - roomMin * 2);
      for (let z = z0; z <= z1; z++) tiles[z * n + wx] = Tile.HouseWall;
      const dz = z0 + 1 + rng.int(Math.max(1, h - 3));
      const door = rng.next() < 0.8 ? Tile.Door : Tile.Open;
      tiles[dz * n + wx] = door;
      tiles[(dz + 1) * n + wx] = door;
      if (rng.next() < 0.25) tiles[(z0 + rng.int(h)) * n + wx] = Tile.Open;
      split(x0, z0, wx - 1, z1);
      split(wx + 1, z0, x1, z1);
    } else {
      const wz = z0 + roomMin + rng.int(h - roomMin * 2);
      for (let x = x0; x <= x1; x++) tiles[wz * n + x] = Tile.HouseWall;
      const dx = x0 + 1 + rng.int(Math.max(1, w - 3));
      const door = rng.next() < 0.8 ? Tile.Door : Tile.Open;
      tiles[wz * n + dx] = door;
      tiles[wz * n + dx + 1] = door;
      if (rng.next() < 0.25) tiles[wz * n + x0 + rng.int(w)] = Tile.Open;
      split(x0, z0, x1, wz - 1);
      split(x0, wz + 1, x1, z1);
    }
  };
  split(1, 1, n - 2, n - 2);
  // A wall cell that ended up in a doorway of a later wall must not seal it: doorways win.
  const isWall = (x: number, z: number) => x >= 0 && z >= 0 && x < n && z < n && tiles[z * n + x] === Tile.HouseWall;
  const nearDoor = (x: number, z: number) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && z + dz >= 0 && x + dx < n && z + dz < n && tiles[(z + dz) * n + x + dx] === Tile.Door) return true;
    return false;
  };
  // Closets: in most rooms, one against a wall (its back to the wall), never by a doorway.
  for (const r of rooms) {
    if (rng.next() > 0.75) continue;
    for (let tries = 0; tries < 20; tries++) {
      const x = r.x0 + rng.int(r.w);
      const z = r.z0 + rng.int(r.h);
      const backed = isWall(x - 1, z) || isWall(x + 1, z) || isWall(x, z - 1) || isWall(x, z + 1);
      if (!backed || tiles[z * n + x] !== Tile.Open || nearDoor(x, z)) continue;
      tiles[z * n + x] = Tile.Closet;
      break;
    }
  }
  // Rubble: a few cells of fallen masonry (the snake smashes through them, as in the ruins).
  for (let k = 0; k < rooms.length; k++) {
    const r = rooms[rng.int(rooms.length)];
    const x = r.x0 + 1 + rng.int(Math.max(1, r.w - 2));
    const z = r.z0 + 1 + rng.int(Math.max(1, r.h - 2));
    if (tiles[z * n + x] === Tile.Open && !nearDoor(x, z)) tiles[z * n + x] = Tile.Crumble;
  }
  // Clear the start, the front door and the snake's lane.
  const clear = (x0: number, z0: number, x1: number, z1: number) => {
    for (let z = Math.max(1, z0); z <= Math.min(n - 2, z1); z++) for (let x = Math.max(1, x0); x <= Math.min(n - 2, x1); x++) tiles[z * n + x] = Tile.Open;
  };
  const { start, snake } = level;
  clear(start.x - 1, start.z - 1, start.x + 1, start.z + 1);
  const exit = level.gate ?? { x: Math.floor(n / 2), z: 1 };
  clear(exit.x - 2, exit.z, exit.x + 2, exit.z + 1);
  clear(snake.spawn.x - snake.startLength, snake.spawn.z, snake.spawn.x, snake.spawn.z);

  // The key: the walkable cell (doors count as walkable) farthest from the start.
  const dist = new Int32Array(n * n).fill(-1);
  const q = [start.z * n + start.x];
  dist[q[0]] = 0;
  let best = q[0];
  for (let h = 0; h < q.length; h++) {
    const id = q[h];
    const x = id % n;
    const z = (id / n) | 0;
    if (dist[id] > dist[best] && tiles[id] === Tile.Open && Math.hypot(x - exit.x, z - exit.z) > 10) best = id;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      const nid = nz * n + nx;
      if (nx < 1 || nz < 1 || nx > n - 2 || nz > n - 2 || dist[nid] >= 0) continue;
      const t = tiles[nid];
      if (t !== Tile.Open && t !== Tile.Door && t !== Tile.Closet) continue;
      dist[nid] = dist[id] + 1;
      q.push(nid);
    }
  }
  return { tiles, relics: [{ x: best % n, z: (best / n) | 0 }], exit };
}

/**
 * Dark cave: rock grown by a seeded cellular automaton (start with `fill` of the cells rock, then
 * smooth five times: a cell turns to rock with 5+ rock neighbours, to open floor with 3 or fewer).
 * The start and the snake's starting lane are carved out; every open pocket not joined to the start
 * is filled in (one connected cave), and a tunnel joins the snake's lane if it ended up cut off.
 */
function cave(level: LevelConfig, grid: Grid, rng: Rng, fill: number): Layout {
  const n = grid.size;
  let tiles = new Uint8Array(n * n);
  const edge = (x: number, z: number) => x <= 0 || z <= 0 || x >= n - 1 || z >= n - 1;
  for (let i = 0; i < n * n; i++) tiles[i] = edge(i % n, (i / n) | 0) || rng.next() < fill ? Tile.CaveWall : Tile.Open;
  for (let pass = 0; pass < 5; pass++) {
    const next = new Uint8Array(tiles);
    for (let z = 1; z < n - 1; z++) {
      for (let x = 1; x < n - 1; x++) {
        let rock = 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if ((dx || dz) && tiles[(z + dz) * n + x + dx] === Tile.CaveWall) rock++;
        if (rock >= 5) next[z * n + x] = Tile.CaveWall;
        else if (rock <= 3) next[z * n + x] = Tile.Open;
      }
    }
    tiles = next;
  }
  const open = (x0: number, z0: number, x1: number, z1: number) => {
    for (let z = Math.max(1, z0); z <= Math.min(n - 2, z1); z++) for (let x = Math.max(1, x0); x <= Math.min(n - 2, x1); x++) tiles[z * n + x] = Tile.Open;
  };
  const { start, snake } = level;
  open(start.x - 3, start.z - 3, start.x + 3, start.z + 3);
  open(snake.spawn.x - snake.startLength, snake.spawn.z - 1, snake.spawn.x + 1, snake.spawn.z + 1);
  const reach = (from: number): Int32Array => {
    const dist = new Int32Array(n * n).fill(-1);
    const q = [from];
    dist[from] = 0;
    for (let h = 0; h < q.length; h++) {
      const id = q[h];
      const x = id % n;
      const z = (id / n) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = (z + dz) * n + x + dx;
        if (tiles[ni] !== Tile.Open || dist[ni] >= 0) continue;
        dist[ni] = dist[id] + 1;
        q.push(ni);
      }
    }
    return dist;
  };
  let dist = reach(start.z * n + start.x);
  if (dist[snake.spawn.z * n + snake.spawn.x] < 0) {
    // A tunnel two cells wide from the snake's lane straight down to the start's row, then across.
    open(snake.spawn.x - 1, snake.spawn.z, snake.spawn.x, start.z);
    open(Math.min(snake.spawn.x, start.x), start.z - 1, Math.max(snake.spawn.x, start.x), start.z);
    dist = reach(start.z * n + start.x);
  }
  for (let i = 0; i < n * n; i++) if (tiles[i] === Tile.Open && dist[i] < 0) tiles[i] = Tile.CaveWall;
  return { tiles, relics: [] };
}

/** The level's ground: plain everywhere (scatter), or generated (ruins, river, meadow, maze, swamp, desert, lake, house, cave). Seeded, so a seed gives the same map. */
export function generateLayout(level: LevelConfig, grid: Grid, rng: Rng): Layout {
  const n = grid.size;
  const layout = level.layout ?? { kind: 'scatter' };
  const relicCount = level.goal.kind === 'relicsThenGate' ? level.goal.relics : 0;
  if (layout.kind === 'ruins') return ruins(level, grid, rng, layout.rooms, layout.crumbleShare, relicCount);
  if (layout.kind === 'river') return river(grid, rng, layout.width, layout.bridges, layout.amplitude);
  if (layout.kind === 'meadow') return meadow(level, grid, rng, layout.patches, layout.minRadius, layout.maxRadius);
  if (layout.kind === 'maze') return maze(level, grid, rng, layout.loops);
  if (layout.kind === 'swamp') return swamp(level, grid, rng, layout.firm, relicCount);
  if (layout.kind === 'desert') return desert(level, grid, rng, relicCount);
  if (layout.kind === 'lake') return lake(level, grid, rng, layout.cracks);
  if (layout.kind === 'house') return house(level, grid, rng, layout.roomMin);
  if (layout.kind === 'cave') return cave(level, grid, rng, layout.fill);
  return { tiles: new Uint8Array(n * n), relics: [] };
}

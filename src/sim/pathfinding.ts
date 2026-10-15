import type { Rng } from './rng';

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Index into DIRS of the step taken, or -1 for none. */
export type StepDir = number;

export const stepOffset = (d: StepDir): readonly [number, number] => DIRS[d];

/**
 * Breadth-first search on the arena grid. Owns reusable scratch buffers, so create one
 * per world. `blocked` is filled by the caller before each search.
 */
export class Pathfinder {
  readonly blocked: Uint8Array;
  private readonly seen: Uint8Array;
  private readonly firstDir: Int8Array;
  private readonly queue: Int32Array;

  constructor(
    readonly size: number,
    private readonly rng: Rng,
  ) {
    const n = size * size;
    this.blocked = new Uint8Array(n);
    this.seen = new Uint8Array(n);
    this.firstDir = new Int8Array(n);
    this.queue = new Int32Array(n);
  }

  free(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.size && z < this.size && !this.blocked[z * this.size + x];
  }

  /** The four directions in random order. */
  shuffledDirs(): number[] {
    const a = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) {
      const j = this.rng.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * First step of a shortest path from (hx, hz) to (tx, tz), or -1 if unreachable.
   * The target cell itself may be blocked. Ties are broken at random.
   */
  firstStep(hx: number, hz: number, tx: number, tz: number): StepDir {
    const { size, seen, firstDir, queue, blocked } = this;
    seen.fill(0);
    let qh = 0;
    let qt = 0;
    seen[hz * size + hx] = 1;
    for (const d of this.shuffledDirs()) {
      const nx = hx + DIRS[d][0];
      const nz = hz + DIRS[d][1];
      if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
      if (nx === tx && nz === tz) return d;
      if (!this.free(nx, nz)) continue;
      const id = nz * size + nx;
      seen[id] = 1;
      firstDir[id] = d;
      queue[qt++] = id;
    }
    while (qh < qt) {
      const id = queue[qh++];
      const x = id % size;
      const z = (id / size) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0];
        const nz = z + DIRS[d][1];
        if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
        const nid = nz * size + nx;
        if (seen[nid]) continue;
        if (nx === tx && nz === tz) return firstDir[id];
        if (blocked[nid]) continue;
        seen[nid] = 1;
        firstDir[nid] = firstDir[id];
        queue[qt++] = nid;
      }
    }
    return -1;
  }

  /** How many free cells are reachable from (x, z), counted up to 250. */
  roomFrom(x: number, z: number): number {
    const { size, seen, queue } = this;
    seen.fill(0);
    let qh = 0;
    let qt = 0;
    let n = 0;
    queue[qt++] = z * size + x;
    seen[z * size + x] = 1;
    while (qh < qt && n < 250) {
      const id = queue[qh++];
      n++;
      const cx = id % size;
      const cz = (id / size) | 0;
      for (const [dx, dz] of DIRS) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (!this.free(nx, nz)) continue;
        const nid = nz * size + nx;
        if (seen[nid]) continue;
        seen[nid] = 1;
        queue[qt++] = nid;
      }
    }
    return n;
  }
}

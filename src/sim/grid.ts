/** The square arena: `size` x `size` cells, centered on world origin. */
export interface Grid {
  size: number;
  /** World units per cell. */
  cell: number;
  /** Half the arena width in world units. */
  half: number;
}

export function makeGrid(size: number, cell: number): Grid {
  return { size, cell, half: (size * cell) / 2 };
}

/** Cell index to the world coordinate of that cell's center. */
export function cellToWorld(g: Grid, i: number): number {
  return (i + 0.5) * g.cell - g.half;
}

/** World coordinate to cell index, clamped inside the arena. */
export function worldToCell(g: Grid, v: number): number {
  return Math.max(0, Math.min(g.size - 1, Math.floor((v + g.half) / g.cell)));
}

export function inBounds(g: Grid, x: number, z: number): boolean {
  return x >= 0 && z >= 0 && x < g.size && z < g.size;
}

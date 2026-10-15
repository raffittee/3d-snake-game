import { clamp } from './math';
import type { PlayerState } from './types';

/**
 * Circle (the player) against an axis-aligned square of half-width `h` centered at (bx, bz).
 * Returns how deep the circle sits inside it, or 0 when they do not touch.
 */
export function overlapDepth(p: PlayerState, radius: number, bx: number, bz: number, h: number): number {
  const nx = clamp(p.x, bx - h, bx + h);
  const nz = clamp(p.z, bz - h, bz + h);
  const dx = p.x - nx;
  const dz = p.z - nz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return 0;
  return d2 > 1e-8 ? radius - Math.sqrt(d2) : radius + Math.min(h - Math.abs(p.x - bx), h - Math.abs(p.z - bz));
}

/** Push the player out of the square along the shortest way. */
export function pushOut(p: PlayerState, radius: number, bx: number, bz: number, h: number): void {
  const nx = clamp(p.x, bx - h, bx + h);
  const nz = clamp(p.z, bz - h, bz + h);
  const dx = p.x - nx;
  const dz = p.z - nz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    const pen = radius - d;
    p.x += (dx / d) * pen;
    p.z += (dz / d) * pen;
    return;
  }
  // Center is inside the square: leave through the nearest face.
  const ox = h + radius - Math.abs(p.x - bx);
  const oz = h + radius - Math.abs(p.z - bz);
  if (ox < oz) p.x += Math.sign(p.x - bx || 1) * ox;
  else p.z += Math.sign(p.z - bz || 1) * oz;
}

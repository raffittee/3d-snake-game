import type { LevelConfig } from '../levels/types';

/**
 * Sandstorm strength at `t` seconds into the level, 0..1 (Desert). Waves start at `first` and then
 * every `every` seconds; each blows in over `ramp`, holds, and dies down over `ramp`, `length` in
 * all. Pure, so the renderer and the tests read the same storm.
 */
export function stormAt(level: LevelConfig, t: number): number {
  const s = level.storm;
  if (!s || t < s.first) return 0;
  const k = (t - s.first) % s.every;
  if (k < s.ramp) return k / s.ramp;
  if (k < s.length - s.ramp) return 1;
  if (k < s.length) return (s.length - k) / s.ramp;
  return 0;
}

/** The index of the wave whose warning time has come at `t` (the wind rises), or -1. */
export function stormWarningWave(level: LevelConfig, t: number): number {
  const s = level.storm;
  if (!s) return -1;
  const next = t < s.first ? 0 : Math.floor((t - s.first) / s.every) + 1;
  const start = s.first + next * s.every;
  return t >= start - s.warn ? next : -1;
}

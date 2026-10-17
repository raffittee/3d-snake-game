/** Player preferences. Pure data and validation; storage lives in storage.ts, UI in ui/settings.ts. */
export type Quality = 'high' | 'low';

export const QUALITIES: readonly Quality[] = ['high', 'low'];

export interface Settings {
  /** Multiplier on the base mouse/touch look speed. */
  sensitivity: number;
  /** Master volume, 0..1. */
  volume: number;
  /** Vertical field of view in degrees. */
  fov: number;
  /** Fraction of the screen's full resolution the 3D view renders at. Lower is faster. */
  renderScale: number;
  /** high: shadows and image-based lighting. low: no shadows, simpler lighting, for weak machines. */
  quality: Quality;
}

type NumberKey = Exclude<keyof Settings, 'quality'>;
type Range = { min: number; max: number; step: number };

export const SETTING_RANGES: Record<NumberKey, Range> = {
  sensitivity: { min: 0.25, max: 3, step: 0.05 },
  volume: { min: 0, max: 1, step: 0.05 },
  fov: { min: 60, max: 100, step: 1 },
  renderScale: { min: 0.5, max: 1, step: 0.05 },
};

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  volume: 0.8,
  fov: 75,
  renderScale: 1,
  quality: 'high',
};

/** Turn anything (for example JSON from storage) into valid settings: defaults for junk, ranges clamped. */
export function sanitizeSettings(raw: unknown): Settings {
  const src = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(SETTING_RANGES) as NumberKey[]) {
    const v = src[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const { min, max } = SETTING_RANGES[key];
    out[key] = Math.min(max, Math.max(min, v));
  }
  if (QUALITIES.includes(src.quality as Quality)) out.quality = src.quality as Quality;
  return out;
}

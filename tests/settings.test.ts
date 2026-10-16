import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SETTING_RANGES, sanitizeSettings } from '../src/settings';

describe('sanitizeSettings', () => {
  it('falls back to defaults for missing or broken input', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ sensitivity: 'fast', fov: NaN, quality: 'ultra' })).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values', () => {
    const s = { sensitivity: 1.5, volume: 0.3, fov: 90, renderScale: 0.75, quality: 'low' as const };
    expect(sanitizeSettings(s)).toEqual(s);
  });

  it('clamps numbers into their ranges', () => {
    const s = sanitizeSettings({ sensitivity: 99, volume: -1, fov: 10, renderScale: 5 });
    expect(s.sensitivity).toBe(SETTING_RANGES.sensitivity.max);
    expect(s.volume).toBe(SETTING_RANGES.volume.min);
    expect(s.fov).toBe(SETTING_RANGES.fov.min);
    expect(s.renderScale).toBe(SETTING_RANGES.renderScale.max);
  });

  it('fills in a partial object and drops unknown keys (including the old renderWidth)', () => {
    const s = sanitizeSettings({ fov: 80, renderWidth: 760, cheat: true });
    expect(s).toEqual({ ...DEFAULT_SETTINGS, fov: 80 });
  });

  it('defaults keep the current feel and full quality', () => {
    expect(DEFAULT_SETTINGS.fov).toBe(75);
    expect(DEFAULT_SETTINGS.sensitivity).toBe(1);
    expect(DEFAULT_SETTINGS.renderScale).toBe(1);
    expect(DEFAULT_SETTINGS.quality).toBe('high');
    for (const key of Object.keys(SETTING_RANGES) as Array<keyof typeof SETTING_RANGES>) {
      const r = SETTING_RANGES[key];
      expect(DEFAULT_SETTINGS[key]).toBeGreaterThanOrEqual(r.min);
      expect(DEFAULT_SETTINGS[key]).toBeLessThanOrEqual(r.max);
    }
  });
});

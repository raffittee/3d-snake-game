import { QUALITIES, SETTING_RANGES } from '../settings';
import type { Quality, Settings } from '../settings';
import { $ } from './dom';

type NumberKey = keyof typeof SETTING_RANGES;

const FORMAT: Record<NumberKey, (v: number) => string> = {
  sensitivity: (v) => `${v.toFixed(2)}x`,
  volume: (v) => `${Math.round(v * 100)}%`,
  fov: (v) => `${Math.round(v)}°`,
  renderScale: (v) => `${Math.round(v * 100)}%`,
};

/** Inputs on the settings card. Calls `onChange` with the full settings on every change. */
export class SettingsForm {
  private readonly values: Settings;

  constructor(initial: Settings, onChange: (s: Settings) => void) {
    this.values = { ...initial };
    for (const key of Object.keys(SETTING_RANGES) as NumberKey[]) {
      const input = $<HTMLInputElement>(`set-${key}`);
      const output = $(`out-${key}`);
      const { min, max, step } = SETTING_RANGES[key];
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(this.values[key]);
      output.textContent = FORMAT[key](this.values[key]);
      input.addEventListener('input', () => {
        this.values[key] = Number(input.value);
        output.textContent = FORMAT[key](this.values[key]);
        onChange({ ...this.values });
      });
    }
    const quality = $<HTMLSelectElement>('set-quality');
    quality.value = this.values.quality;
    quality.addEventListener('change', () => {
      if (!QUALITIES.includes(quality.value as Quality)) return;
      this.values.quality = quality.value as Quality;
      onChange({ ...this.values });
    });
  }
}

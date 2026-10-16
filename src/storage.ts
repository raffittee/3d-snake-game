import { sanitizeSettings } from './settings';
import type { Settings } from './settings';

const KEY = 'snake-hunt-best';
const SETTINGS_KEY = 'snake-hunt-settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return sanitizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitizeSettings(null);
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable: settings just last for this page load.
  }
}

/** localStorage can throw (private windows, blocked storage), so every access is guarded. */
export function loadBest(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

export function saveBest(score: number): void {
  try {
    localStorage.setItem(KEY, String(score));
  } catch {
    // Storage unavailable: the best score just lasts for this page load.
  }
}

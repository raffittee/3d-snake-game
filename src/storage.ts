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

const NAME_KEY = 'snake-hunt-name';
const TALK_KEY = 'snake-hunt-talk';

/** Your multiplayer name, remembered between visits. */
export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Storage unavailable: type it again next time.
  }
}

/** Push-to-talk or open mic, remembered between visits. */
export function loadTalkMode(): 'ptt' | 'open' {
  try {
    return localStorage.getItem(TALK_KEY) === 'open' ? 'open' : 'ptt';
  } catch {
    return 'ptt';
  }
}

export function saveTalkMode(mode: 'ptt' | 'open'): void {
  try {
    localStorage.setItem(TALK_KEY, mode);
  } catch {
    // Storage unavailable: push-to-talk next time.
  }
}

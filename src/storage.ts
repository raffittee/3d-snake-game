const KEY = 'snake-hunt-best';

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

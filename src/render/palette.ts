/** Minimap colors come from the CSS variables in style.css, so the HUD is themed in one place. */
export interface Palette {
  ground: string;
  rock: string;
  landmark: string;
  start: string;
  pellet: string;
  snake: string;
  player: string;
  /** Danger only: the snake's head. */
  alert: string;
}

export function readPalette(): Palette {
  const css = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return {
    ground: css('--map-ground'),
    rock: css('--map-rock'),
    landmark: css('--map-landmark'),
    start: css('--map-start'),
    pellet: css('--map-pellet'),
    snake: css('--map-snake'),
    player: css('--map-player'),
    alert: css('--alert'),
  };
}

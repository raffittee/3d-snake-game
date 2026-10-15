/** Colors come from the CSS variables in style.css so the 3D scene and the HUD always match. */
export interface Palette {
  lcd: string;
  lcd2: string;
  mid: string;
  ink: string;
  ink2: string;
  deep: string;
  alert: string;
}

export function readPalette(): Palette {
  const css = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return {
    lcd: css('--lcd'),
    lcd2: css('--lcd-2'),
    mid: css('--lcd-mid'),
    ink: css('--ink'),
    ink2: css('--ink-2'),
    deep: css('--ink-deep'),
    alert: css('--alert'),
  };
}

import type { ItemId } from '../sim/types';

/** Inline SVG icons for inventory slots, drawn in currentColor so CSS sets their color. */
export const ITEM_ICONS: Record<ItemId, string> = {
  // A Y-shaped frame with a band and pouch.
  slingshot:
    '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M16 29V17"/><path d="M16 17L8.5 6"/><path d="M16 17l7.5-11"/>' +
    '<path d="M8.5 6Q16 15 23.5 6" stroke-width="1.4"/><circle cx="16" cy="11.6" r="1.8" fill="currentColor" stroke="none"/></svg>',
  // A long blade with a curved edge, a guard and a grip, on the diagonal.
  machete:
    '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M11 21L25.5 4.5Q28.5 4 27.5 7L14.5 23.5Z" fill="currentColor" fill-opacity=".25"/>' +
    '<path d="M9.5 19.5l5 5"/><path d="M11.5 22.5l-6 6" stroke-width="3.2"/></svg>',
  // A ring buoy: a thick ring with four bands.
  swimRing:
    '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" aria-hidden="true">' +
    '<circle cx="16" cy="16" r="9.5" stroke-width="6"/>' +
    '<path d="M16 3.5v5M16 23.5v5M3.5 16h5M23.5 16h5" stroke="#1b211d" stroke-width="2.4"/></svg>',
};

export const ITEM_NAMES: Record<ItemId, string> = { slingshot: 'Slingshot', machete: 'Machete', swimRing: 'Swim ring' };

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
  // A banded tube on the diagonal, its fuse curling up to a spark.
  firecracker:
    '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M6.5 22.5l9-9 4 4-9 9z" fill="currentColor" fill-opacity=".25" stroke-width="2.2"/>' +
    '<path d="M10 19l4 4M13.5 15.5l4 4" stroke-width="1.6"/>' +
    '<path d="M17.5 15.5Q20 10 24 9.5" stroke-width="1.6"/>' +
    '<path d="M26 5v2.5M26 10.5V13M22 9h2.5M27.5 9H30M23.3 6.3l1.4 1.4M27.3 10.3l1.4 1.4" stroke-width="1.4"/></svg>',
  // A squat can with a lever and a ring pin, a puff of smoke rising.
  smokeBomb:
    '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="8" y="14" width="11" height="14" rx="2" fill="currentColor" fill-opacity=".25" stroke-width="2.2"/>' +
    '<path d="M10.5 14v-2.5h6V14M19 15.5l2.5 1v8" stroke-width="1.8"/><circle cx="9" cy="10" r="2" stroke-width="1.5"/>' +
    '<path d="M20 9.5a3 3 0 0 1 5-2.8 3 3 0 0 1 2.5 4.6" stroke-width="1.8"/></svg>',
  // A slim can with a lightning bolt.
  energyDrink:
    '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M11 6.5h10l1 2v17l-1 2H11l-1-2v-17z" fill="currentColor" fill-opacity=".2" stroke-width="2.2"/>' +
    '<path d="M17 10.5l-3.5 6.5h4l-2.5 6" stroke-width="2"/></svg>',
  // A mongoose in profile: long low body, pointed snout, bushy tail raised.
  mongoose:
    '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M5 19.5c2-3.5 7-4.5 12-4l5.5-1.5 3 1.8-1.2 1.8-2.6.4c-1 2.5-4 4-8.5 4H9" fill="currentColor" fill-opacity=".2" stroke-width="2"/>' +
    '<path d="M5 19.5Q2.5 15 4.5 10.5" stroke-width="2.6"/><path d="M10 21.3v4M18 21v4" stroke-width="2"/>' +
    '<circle cx="23" cy="15.6" r=".9" fill="currentColor" stroke="none"/></svg>',
  // A boot sole seen from below, with a frame of studs.
  iceCleats:
    '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M16 4c4.5 0 6.5 3.5 6.5 8.5 0 4-1.5 6-1.5 9.5s-2 6-5 6-5-2.5-5-6 -1.5-5.5-1.5-9.5C9.5 7.5 11.5 4 16 4z" fill="currentColor" fill-opacity=".2" stroke-width="2"/>' +
    '<g fill="currentColor" stroke="none"><circle cx="13" cy="10" r="1.4"/><circle cx="19" cy="10" r="1.4"/><circle cx="13" cy="15.5" r="1.4"/><circle cx="19" cy="15.5" r="1.4"/>' +
    '<circle cx="14" cy="22" r="1.4"/><circle cx="18" cy="22" r="1.4"/></g></svg>',
  // A battery cell with its terminal and a charge band.
  battery:
    '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="10" y="7" width="12" height="21" rx="2.5" fill="currentColor" fill-opacity=".2" stroke-width="2.2"/>' +
    '<path d="M14 4h4v3h-4z" fill="currentColor" stroke-width="1.6"/><path d="M10 13h12" stroke-width="2"/></svg>',
};

export const ITEM_NAMES: Record<ItemId, string> = { slingshot: 'Slingshot', machete: 'Machete', swimRing: 'Swim ring', firecracker: 'Firecracker', smokeBomb: 'Smoke bomb', energyDrink: 'Energy drink', mongoose: 'Mongoose', iceCleats: 'Ice cleats', battery: 'Battery' };

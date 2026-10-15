import '@fontsource/silkscreen/400.css';
import '@fontsource/silkscreen/700.css';
import '@fontsource/vt323/400.css';
import './style.css';
import { Game } from './game';

declare global {
  interface Window {
    __snake?: Game;
  }
}

/**
 * URL switches for development:
 *   ?debug=1  show the debug panel and expose window.__snake
 *   ?seed=N   same arena every run
 *   ?god=1    the snake cannot kill you
 */
const params = new URLSearchParams(location.search);
const seedParam = params.get('seed');
const debug = params.get('debug') === '1';
const god = params.get('god') === '1';

function boot(): void {
  const game = new Game({ seed: seedParam !== null && seedParam !== '' ? Number(seedParam) : undefined, god });
  if (debug || god) window.__snake = game;
  if (debug) {
    const panel = document.createElement('pre');
    panel.id = 'debug';
    panel.style.cssText = 'position:fixed;left:8px;bottom:8px;margin:0;padding:6px 8px;font:16px/1.1 monospace;background:rgba(43,53,39,.85);color:#c7f0d8;z-index:50;pointer-events:none';
    document.body.appendChild(panel);
    window.setInterval(() => {
      panel.textContent = game.debugText();
    }, 250);
  }
}

try {
  boot();
} catch (err) {
  // No WebGL, or something else failed during setup. Say so instead of leaving a blank page.
  const msg = document.createElement('p');
  msg.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;margin:0;padding:24px;text-align:center;font:24px VT323,monospace;background:#c7f0d8;color:#2b3527;z-index:100';
  msg.textContent = 'Snake Hunt needs WebGL, and it could not start in this browser. Try another browser or enable hardware acceleration.';
  document.body.appendChild(msg);
  console.error(err);
}

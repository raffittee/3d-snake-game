import type { DeathCause } from '../sim/types';
import { $ } from './dom';
import { formatTime } from './hud';

export type PanelName = 'start' | 'pause' | 'dead' | 'complete' | 'settings' | null;

export interface CompleteSummary {
  elapsed: number;
  score: number;
  pellets: number;
  livesLeft: number;
  isBest: boolean;
  best: number;
}

export interface DeathSummary {
  cause: DeathCause;
  elapsed: number;
  score: number;
  length: number;
  pellets: number;
  isBest: boolean;
  best: number;
}

/** Title, pause and game-over cards plus the play-only HUD chrome. */
export class Panels {
  private readonly overlay = $('overlay');
  private readonly cards: Record<Exclude<PanelName, null>, HTMLElement> = {
    start: $('panelStart'),
    pause: $('panelPause'),
    dead: $('panelDead'),
    complete: $('panelComplete'),
    settings: $('panelSettings'),
  };
  private readonly focusId = { start: 'startBtn', pause: 'resumeBtn', dead: 'againBtn', complete: 'completeAgainBtn', settings: 'settingsBack' } as const;

  constructor(private readonly touch: boolean) {
    if (touch) {
      $('keysDesk').hidden = true;
      $('keysTouch').hidden = false;
    }
  }

  get startVisible(): boolean {
    return !this.overlay.hidden && !this.cards.start.hidden;
  }

  show(name: PanelName): void {
    this.overlay.hidden = name === null;
    for (const key of Object.keys(this.cards) as Array<keyof typeof this.cards>) this.cards[key].hidden = key !== name;
    if (name) {
      const id = this.focusId[name];
      window.setTimeout(() => {
        try {
          $(id).focus({ preventScroll: true });
        } catch {
          // Focus is a nicety.
        }
      }, 30);
    }
  }

  setPlayUI(on: boolean): void {
    $('hud').hidden = !on;
    $('cross').hidden = !on || this.touch;
    $('sprintBtn').hidden = !(on && this.touch);
    $('pauseBtn').hidden = !(on && this.touch);
    if (!on) $('stick').hidden = true;
  }

  setBest(best: number): void {
    $('bestStart').textContent = String(best);
    $('bestDead').textContent = String(best);
    $('bestComplete').textContent = String(best);
  }

  showComplete(s: CompleteSummary): void {
    $('cTime').textContent = formatTime(s.elapsed);
    $('cScore').textContent = String(s.score);
    $('cPel').textContent = String(s.pellets);
    $('cLives').textContent = String(s.livesLeft);
    $('completeBest').hidden = !s.isBest;
    this.setBest(s.best);
  }

  showDeath(s: DeathSummary): void {
    $('deadCause').textContent = s.cause === 'crushed' ? 'Pinned against a wall' : 'Caught by the head';
    $('deadTitle').textContent = s.cause === 'crushed' ? 'Crushed' : 'Eaten';
    $('dTime').textContent = formatTime(s.elapsed);
    $('dScore').textContent = String(s.score);
    $('dLen').textContent = String(s.length);
    $('dPel').textContent = String(s.pellets);
    $('newBest').hidden = !s.isBest;
    this.setBest(s.best);
  }

  on(id: string, fn: () => void): void {
    $(id).addEventListener('click', fn);
  }
}

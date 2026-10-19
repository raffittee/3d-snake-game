import { PERKS } from '../sim/perks';
import type { PerkId } from '../sim/perks';
import type { DeathCause } from '../sim/types';
import { $ } from './dom';
import { formatTime } from './hud';

/** `mp`: create or join a room. `lobby`, `round` (scoreboard) and `mpPause`: multiplayer. */
export type PanelName = 'start' | 'pause' | 'dead' | 'complete' | 'settings' | 'perk' | 'mp' | 'lobby' | 'round' | 'mpPause' | null;

export interface CompleteSummary {
  levelNumber: number;
  levelName: string;
  elapsed: number;
  /** This level's score, and the run's total so far. */
  score: number;
  runScore: number;
  pellets: number;
  livesLeft: number;
  /** Level-ups waiting to be spent on perks. */
  picks: number;
  /** The last level of the campaign. */
  last: boolean;
  isBest: boolean;
  best: number;
}

export interface DeathSummary {
  cause: DeathCause;
  levelNumber: number;
  levelName: string;
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
    perk: $('panelPerk'),
    mp: $('panelMp'),
    lobby: $('panelLobby'),
    round: $('panelRound'),
    mpPause: $('panelMpPause'),
  };
  private readonly focusId = { start: 'startBtn', pause: 'resumeBtn', dead: 'againBtn', complete: 'completeNextBtn', settings: 'settingsBack', perk: 'perkChoices', mp: 'mpCreate', lobby: 'lobbyStart', round: 'roundLeave', mpPause: 'mpResumeBtn' } as const;
  private perkHandler: (id: PerkId) => void = () => undefined;

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
    $('cEyebrow').textContent = `Level ${s.levelNumber} \u00b7 ${s.levelName}`;
    $('cTitle').innerHTML = s.last ? 'Campaign<br>complete' : 'Level<br>complete';
    $('cRun').textContent =
      `Run score ${s.runScore}.` + (s.picks > 0 ? ` ${s.picks} level-up${s.picks > 1 ? 's' : ''} to spend on perks.` : '') + (s.last ? ' That is every level built so far.' : '');
    $('completeNextBtn').textContent = s.picks > 0 ? 'Pick perks' : s.last ? 'Finish run' : 'Next level';
    $('cTime').textContent = formatTime(s.elapsed);
    $('cScore').textContent = String(s.score);
    $('cPel').textContent = String(s.pellets);
    $('cLives').textContent = String(s.livesLeft);
    $('completeBest').hidden = !s.isBest;
    this.setBest(s.best);
  }

  showDeath(s: DeathSummary): void {
    const words: Record<typeof s.cause, [string, string]> = {
      caught: ['Eaten', 'Caught by the head'],
      crushed: ['Crushed', 'Pinned against a wall'],
      drowned: ['Drowned', 'The swim ring ran out'],
      fell: ['Fell in', 'The ice gave way under you'],
    };
    $('deadTitle').textContent = words[s.cause][0];
    $('deadCause').textContent = words[s.cause][1];
    $('deadReached').textContent = `Out of lives on Level ${s.levelNumber} (${s.levelName}). The run starts over at Level 1.`;
    $('dTime').textContent = formatTime(s.elapsed);
    $('dScore').textContent = String(s.score);
    $('dLen').textContent = String(s.length);
    $('dPel').textContent = String(s.pellets);
    $('newBest').hidden = !s.isBest;
    this.setBest(s.best);
  }

  /** Three perk cards; `pending` = level-ups left to spend (this one included). */
  showPerks(offer: PerkId[], owned: PerkId[], pending: number): void {
    $('perkEyebrow').textContent = pending > 1 ? `Level up \u00b7 ${pending} picks left` : 'Level up';
    const list = $('perkChoices');
    list.replaceChildren(
      ...offer.map((id) => {
        const b = document.createElement('button');
        b.className = 'perk';
        b.type = 'button';
        b.dataset.perk = id;
        const name = document.createElement('strong');
        name.textContent = PERKS[id].name;
        const text = document.createElement('span');
        text.textContent = PERKS[id].text;
        b.append(name, text);
        b.addEventListener('click', () => this.perkHandler(id));
        return b;
      }),
    );
    list.tabIndex = -1;
    $('perkOwned').textContent = owned.length ? `Your perks: ${owned.map((p) => PERKS[p].name).join(', ')}` : 'Perks last for the whole run.';
  }

  onPerk(fn: (id: PerkId) => void): void {
    this.perkHandler = fn;
  }

  on(id: string, fn: () => void): void {
    $(id).addEventListener('click', fn);
  }
}

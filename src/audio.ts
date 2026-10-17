/** Tiny square-wave beeps, phone style. No audio files. */
export class Audio8 {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 1;
  muted = false;

  /** Master volume, 0..1. */
  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Browsers only allow audio after a user gesture, so call this from a click or key press. */
  unlock(): void {
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) {
          this.ctx = new Ctor();
          this.master = this.ctx.createGain();
          this.master.gain.value = this.volume;
          this.master.connect(this.ctx.destination);
        }
      } catch {
        this.ctx = null;
        this.master = null;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): void {
    this.muted = !this.muted;
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'square', to?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || this.volume <= 0) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private later(ms: number, fn: () => void): void {
    window.setTimeout(fn, ms);
  }

  start(): void {
    this.tone(523, 0.08, 0.06);
    this.later(90, () => this.tone(784, 0.1, 0.06));
  }

  pellet(): void {
    this.tone(660, 0.07, 0.07);
    this.later(70, () => this.tone(990, 0.1, 0.07));
  }

  gulp(): void {
    this.tone(200, 0.2, 0.08, 'sawtooth', 90);
  }

  death(): void {
    this.tone(440, 0.6, 0.11, 'square', 55);
    this.later(180, () => this.tone(110, 0.5, 0.09, 'sawtooth', 40));
  }

  /** A faint chime: an item fell somewhere in the arena. */
  itemSpawned(): void {
    this.tone(880, 0.06, 0.025, 'triangle');
    this.later(80, () => this.tone(1320, 0.08, 0.02, 'triangle'));
  }

  itemPickedUp(): void {
    this.tone(523, 0.06, 0.06);
    this.later(60, () => this.tone(784, 0.06, 0.06));
    this.later(120, () => this.tone(1047, 0.09, 0.05));
  }

  /** The slingshot's twang. */
  shotFired(): void {
    this.tone(260, 0.16, 0.08, 'sawtooth', 140);
  }

  /** A heavy thunk on the snake's head, a light tick on anything else. */
  shotHit(head: boolean): void {
    if (head) {
      this.tone(150, 0.18, 0.12, 'square', 70);
      this.later(60, () => this.tone(95, 0.25, 0.08, 'triangle', 60));
    } else {
      this.tone(900, 0.04, 0.025, 'triangle', 600);
    }
  }

  /** A soft falling blip: an item rotted away. */
  itemSpoiled(): void {
    this.tone(330, 0.25, 0.05, 'triangle', 160);
  }

  jump(): void {
    this.tone(330, 0.09, 0.04, 'square', 520);
  }

  /** A shorter version of the death sound: you lost a life but the run goes on. */
  lifeLost(): void {
    this.tone(440, 0.3, 0.1, 'square', 110);
  }

  /** A low thud per snake step. Louder and higher the closer it is. */
  step(distance: number): void {
    if (distance > 16) return;
    const near = 1 - distance / 16;
    this.tone(70 + near * 40, 0.06, 0.02 + near * 0.07, 'square', 45);
  }
}

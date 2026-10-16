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

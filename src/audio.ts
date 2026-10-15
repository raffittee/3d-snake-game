/** Tiny square-wave beeps, phone style. No audio files. */
export class Audio8 {
  private ctx: AudioContext | null = null;
  muted = false;

  /** Browsers only allow audio after a user gesture, so call this from a click or key press. */
  unlock(): void {
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) this.ctx = new Ctor();
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): void {
    this.muted = !this.muted;
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'square', to?: number): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
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

  /** A low thud per snake step. Louder and higher the closer it is. */
  step(distance: number): void {
    if (distance > 16) return;
    const near = 1 - distance / 16;
    this.tone(70 + near * 40, 0.06, 0.02 + near * 0.07, 'square', 45);
  }
}

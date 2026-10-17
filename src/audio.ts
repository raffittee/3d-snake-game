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

  private noiseBuffer: AudioBuffer | null = null;

  /**
   * A burst of filtered noise (rustling, hissing, a bang), panned left/right: `pan` -1..1.
   * `freq` is the band-pass center; low `q` = broad.
   */
  private noise(dur: number, vol: number, freq: number, pan = 0, q = 0.8, attack = 0.01): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || this.volume <= 0) return;
    if (!this.noiseBuffer) {
      const len = ctx.sampleRate;
      this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out: AudioNode = src.connect(bp).connect(g);
    if (typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      out = out.connect(p);
    }
    out.connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  /** Grass rustling where a hidden snake moved: louder when close, from its side. Heard up to 26 units. */
  rustle(distance: number, pan: number): void {
    if (distance > 26) return;
    const near = 1 - distance / 26;
    this.noise(0.14 + Math.random() * 0.08, 0.015 + near * near * 0.1, 2200 + Math.random() * 1800, pan, 0.6, 0.02);
  }

  /** Your own steps through tall grass: a soft swish. */
  grassStep(): void {
    this.noise(0.09, 0.012, 3200 + Math.random() * 800, (Math.random() - 0.5) * 0.3, 0.7);
  }

  /** A firecracker leaves your hand: a quick whoosh. */
  firecrackerThrown(): void {
    this.noise(0.18, 0.05, 1400, 0, 0.9, 0.04);
  }

  /** The fuse sputters where it landed. */
  fuseHiss(distance: number, pan: number): void {
    const near = Math.max(0.15, 1 - distance / 40);
    this.noise(0.9, 0.035 * near, 6500, pan, 1.2, 0.03);
  }

  /** A wet squelch: your step in swamp mud. */
  mudStep(): void {
    this.noise(0.14, 0.02, 420 + Math.random() * 160, (Math.random() - 0.5) * 0.3, 1.4, 0.02);
    this.tone(95, 0.08, 0.012, 'sine', 60);
  }

  /** A signal lantern catches: a soft whoomp of flame and a warm chime. */
  lanternLit(): void {
    this.noise(0.35, 0.06, 700, 0, 0.5, 0.04);
    this.later(120, () => this.tone(659, 0.18, 0.05, 'triangle'));
    this.later(220, () => this.tone(988, 0.22, 0.04, 'triangle'));
  }

  /** The can's crack and fizz, then a couple of gulps. */
  energyDrink(): void {
    this.noise(0.05, 0.08, 4000, 0, 0.8, 0.002);
    this.noise(0.6, 0.03, 7000, 0, 0.6, 0.02);
    [300, 520].forEach((ms) => this.later(ms, () => this.tone(150, 0.1, 0.05, 'sine', 90)));
  }

  private wind: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  /** Desert wind, 0..1: a steady roar that swells with the sandstorm (a loop, started on first use). */
  setWind(level: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    if (!this.wind) {
      if (level <= 0) return;
      this.noise(0.01, 0.0001, 1000); // makes sure the noise buffer exists
      if (!this.noiseBuffer) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(lp).connect(gain).connect(this.master);
      src.start();
      this.wind = { src, gain };
    }
    const target = this.muted ? 0 : Math.max(0, Math.min(1, level)) * 0.16;
    this.wind.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.3);
  }

  /** The wind rises: a sandstorm is coming. */
  stormWarning(): void {
    this.noise(3.5, 0.08, 500, 0, 0.4, 1.8);
  }

  /** A deep rumble and a hiss of sand: the snake dives, or breaks the surface. */
  sandBurst(distance: number, pan: number): void {
    const near = Math.max(0.15, 1 - distance / 40);
    this.noise(0.6, 0.12 * near, 260, pan, 0.6, 0.02);
    this.tone(55, 0.5, 0.08 * near, 'sine', 40);
  }

  /** The sand heaving before the snake comes up: a low tremor. */
  sandRumble(distance: number, pan: number): void {
    const near = Math.max(0.2, 1 - distance / 30);
    this.noise(1, 0.09 * near, 120, pan, 0.8, 0.1);
  }

  /** The mongoose: a scamper when it is let go, a chatter of hisses when it fights. */
  mongooseReleased(): void {
    [0, 60, 120, 180].forEach((ms) => this.later(ms, () => this.noise(0.04, 0.03, 2500, 0, 1)));
  }

  mongooseFight(distance: number, pan: number): void {
    const near = Math.max(0.2, 1 - distance / 30);
    [0, 90, 160, 260].forEach((ms) => this.later(ms, () => this.noise(0.08, 0.06 * near, 3200, pan, 2)));
    this.later(40, () => this.tone(880, 0.06, 0.03 * near, 'square', 660));
  }

  /** Ice giving way under the snake: sharp creaks and cracks. */
  iceCracking(distance: number, pan: number): void {
    const near = Math.max(0.2, 1 - distance / 45);
    [0, 110, 260, 380].forEach((ms, k) => this.later(ms, () => this.noise(0.05, (0.06 + k * 0.02) * near, 3500 + k * 700, pan, 3, 0.002)));
    this.tone(1900, 0.12, 0.02 * near, 'triangle', 600);
  }

  /** The ice breaks: a shatter and a heavy splash. */
  iceBroke(distance: number, pan: number): void {
    const near = Math.max(0.2, 1 - distance / 50);
    this.noise(0.25, 0.22 * near, 4200, pan, 0.6, 0.003);
    this.later(60, () => this.noise(0.7, 0.18 * near, 500, pan, 0.5, 0.02));
    this.tone(80, 0.4, 0.06 * near, 'sine', 45);
  }

  /** A door: a creak open, a slam shut, a heavy thud as the snake bashes it, a splintering crash when it gives. */
  doorOpened(): void {
    this.tone(220, 0.35, 0.03, 'sawtooth', 330);
  }

  doorShut(): void {
    this.noise(0.18, 0.2, 300, 0, 0.7, 0.003);
    this.tone(90, 0.2, 0.08, 'square', 60);
  }

  doorBash(distance: number, pan: number): void {
    const near = Math.max(0.2, 1 - distance / 35);
    this.noise(0.16, 0.16 * near, 220, pan, 0.8, 0.004);
    this.tone(70, 0.18, 0.07 * near, 'sine', 45);
  }

  doorBroken(distance: number, pan: number): void {
    const near = Math.max(0.2, 1 - distance / 40);
    this.noise(0.5, 0.25 * near, 1800, pan, 0.5, 0.004);
    this.later(70, () => this.noise(0.3, 0.15 * near, 350, pan, 0.7, 0.01));
  }

  /** The Ambush snake heard you: a sharp hiss from its side. */
  snakeNoticed(distance: number, pan: number): void {
    const near = Math.max(0.3, 1 - distance / 30);
    this.noise(0.55, 0.12 * near, 5500, pan, 1.2, 0.02);
  }

  /** Strapping the cleats on: two buckle clicks. */
  cleatsOn(): void {
    this.tone(1800, 0.03, 0.04, 'square');
    this.later(260, () => this.tone(1600, 0.03, 0.04, 'square'));
  }

  /** A smoke bomb: a pop and a long, broad hiss. */
  smokeBomb(): void {
    this.tone(180, 0.08, 0.06, 'square', 90);
    this.noise(1.6, 0.06, 1800, 0, 0.3, 0.05);
  }

  /** The bang: a sharp crack and a low boom, from its side. */
  firecrackerBang(distance: number, pan: number): void {
    const near = Math.max(0.2, 1 - distance / 60);
    this.noise(0.12, 0.4 * near, 2600, pan, 0.5, 0.003);
    this.noise(0.45, 0.25 * near, 380, pan, 0.4, 0.005);
    this.tone(70, 0.35, 0.12 * near, 'sawtooth', 32);
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

  /** Machete: a wet chop on a cut, a ringing clank when it bounces off, a whoosh on a miss. */
  macheteSwing(result: 'cut' | 'bounce' | 'miss'): void {
    this.tone(700, 0.1, 0.025, 'triangle', 220);
    if (result === 'cut') {
      this.later(40, () => this.tone(120, 0.16, 0.12, 'sawtooth', 55));
      this.later(70, () => this.tone(80, 0.22, 0.06, 'triangle', 50));
    } else if (result === 'bounce') {
      this.later(40, () => this.tone(1650, 0.18, 0.05, 'triangle', 1500));
      this.later(45, () => this.tone(2470, 0.12, 0.03, 'triangle', 2300));
    }
  }

  /** Stone breaking: the snake smashed a crumbling wall. Louder when it is close. */
  wallSmashed(distance: number): void {
    const near = Math.max(0, 1 - distance / 30);
    if (near <= 0) return;
    this.tone(70, 0.35, 0.05 + near * 0.09, 'sawtooth', 35);
    this.later(50, () => this.tone(140, 0.2, 0.04 * near, 'square', 60));
  }

  /** A bright chime for a relic, and a fanfare when the gate opens. */
  relicFound(): void {
    this.tone(784, 0.08, 0.06, 'triangle');
    this.later(90, () => this.tone(1175, 0.14, 0.06, 'triangle'));
  }

  gateOpened(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.later(i * 110, () => this.tone(f, 0.18, 0.06, 'triangle')));
  }

  /** A low rising groan: the snake is about to split by itself. */
  splitWarning(): void {
    this.tone(90, 0.9, 0.07, 'sawtooth', 160);
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

  /** A low thud per snake step, from its side. Louder and higher the closer it is (heard further in the dark cave). */
  step(distance: number, pan = 0, range = 16): void {
    if (distance > range) return;
    const near = 1 - distance / range;
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || this.volume <= 0) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(70 + near * 40, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.06);
    g.gain.setValueAtTime(0.02 + near * 0.07, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    let out: AudioNode = o.connect(g);
    if (typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      out = out.connect(p);
    }
    out.connect(this.master);
    o.start(t);
    o.stop(t + 0.08);
  }

  /** The Mother Snake's fight moves on: a deep, rising roar. */
  bossRoar(): void {
    this.tone(55, 1.2, 0.12, 'sawtooth', 110);
    this.noise(1.1, 0.1, 300, 0, 0.5, 0.1);
  }

  /** The flashlight: a click as a battery goes in; a dying fizz as it runs out. */
  batteryIn(): void {
    this.tone(2400, 0.03, 0.04, 'square');
    this.later(90, () => this.tone(1200, 0.04, 0.04, 'square'));
  }

  batteryDead(): void {
    this.tone(900, 0.4, 0.03, 'triangle', 120);
  }
}

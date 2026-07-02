/**
 * Web Audio graph (plan §6): master → sfx/music buses. All SFX are
 * synthesized square/triangle/noise chip voices — zero asset weight.
 * Browsers require a user gesture before audio: the context is created and
 * resumed on the first keydown/pointerdown.
 */
export type SfxName =
  | "flipper"
  | "bumper"
  | "sling"
  | "target"
  | "bank"
  | "rollover"
  | "spinnerTick"
  | "launch"
  | "drain"
  | "saved"
  | "multiplier"
  | "tilt"
  | "warning"
  | "start"
  | "gameOver";

export class AudioEngine {
  private ctx?: AudioContext;
  private sfxGain?: GainNode;
  private musicGain?: GainNode;
  private noiseBuf?: AudioBuffer;
  private sfxVol = 0.5;
  private musicVol = 0.25;

  constructor() {
    const unlock = () => {
      this.ensure();
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("keydown", unlock);
    window.addEventListener("pointerdown", unlock);
  }

  get context(): AudioContext | undefined {
    return this.ctx;
  }

  get musicBus(): GainNode | undefined {
    return this.musicGain;
  }

  setVolumes(sfx: number, music: number): void {
    this.sfxVol = sfx;
    this.musicVol = music;
    if (this.sfxGain) this.sfxGain.gain.value = sfx;
    if (this.musicGain) this.musicGain.gain.value = music;
  }

  private ensure(): AudioContext | undefined {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return undefined;
      }
      const master = this.ctx.createGain();
      master.gain.value = 0.8;
      master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVol;
      this.sfxGain.connect(master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVol;
      this.musicGain.connect(master);
      // one second of white noise, reused by every noise voice
      this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /**
   * One synthesized voice: oscillator with pitch glide + exponential decay.
   * `when` defaults to now; the music sequencer passes scheduled times.
   */
  tone(
    type: OscillatorType,
    from: number,
    to: number,
    dur: number,
    vol: number,
    when = 0,
    bus: GainNode | undefined = this.sfxGain,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !bus) return;
    const t0 = Math.max(ctx.currentTime, when || ctx.currentTime);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(
    dur: number,
    vol: number,
    cutoff = 4000,
    when = 0,
    bus: GainNode | undefined = this.sfxGain,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !bus || !this.noiseBuf) return;
    const t0 = Math.max(ctx.currentTime, when || ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(bus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** Fire a named chip SFX (no-op until the context is unlocked). */
  sfx(name: SfxName): void {
    if (!this.ensure()) return;
    switch (name) {
      case "flipper":
        this.tone("square", 160, 110, 0.05, 0.35);
        this.noise(0.03, 0.15, 2500);
        break;
      case "bumper":
        this.tone("square", 240, 70, 0.09, 0.5);
        this.noise(0.05, 0.3, 5000);
        break;
      case "sling":
        this.tone("square", 320, 110, 0.07, 0.4);
        this.noise(0.04, 0.2, 4500);
        break;
      case "target":
        this.tone("square", 520, 260, 0.08, 0.4);
        this.noise(0.05, 0.2, 3000);
        break;
      case "bank":
        [523, 659, 784].forEach((f, i) => this.tone("square", f, f, 0.12, 0.35, this.now(i * 0.08)));
        break;
      case "rollover":
        this.tone("square", 880, 1175, 0.08, 0.3);
        break;
      case "spinnerTick":
        this.tone("square", 1320, 1180, 0.025, 0.18);
        break;
      case "launch":
        this.tone("sawtooth", 180, 900, 0.25, 0.4);
        this.noise(0.15, 0.2, 6000);
        break;
      case "drain":
        this.tone("triangle", 300, 55, 0.4, 0.45);
        break;
      case "saved":
        [440, 660].forEach((f, i) => this.tone("square", f, f, 0.1, 0.35, this.now(i * 0.09)));
        break;
      case "multiplier":
        [523, 659, 784, 1047].forEach((f, i) =>
          this.tone("square", f, f, 0.1, 0.32, this.now(i * 0.07)),
        );
        break;
      case "tilt":
        this.tone("sawtooth", 140, 70, 0.45, 0.5);
        this.noise(0.4, 0.35, 900);
        break;
      case "warning":
        this.tone("square", 220, 180, 0.12, 0.35);
        break;
      case "start":
        [392, 523].forEach((f, i) => this.tone("square", f, f, 0.11, 0.35, this.now(i * 0.1)));
        break;
      case "gameOver":
        [392, 330, 262].forEach((f, i) => this.tone("square", f, f, 0.22, 0.35, this.now(i * 0.2)));
        break;
    }
  }

  private now(offset: number): number {
    return this.ctx ? this.ctx.currentTime + offset : 0;
  }
}

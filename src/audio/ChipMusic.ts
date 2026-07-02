import { AudioEngine } from "./AudioEngine";

/**
 * Procedural chiptune sequencer (plan §6, route 2): square lead, triangle
 * bass, square arps and noise hats over a lookahead scheduler. The Moondial
 * theme is an original 4-bar A-minor loop (Am → F → C → G), dreamy register.
 * Tracker-module (.xm) playback can replace this later on the same bus.
 */
const BPM = 104;
const STEP = 60 / BPM / 4; // sixteenth note
const STEPS_PER_BAR = 16;
const BARS = 4;

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** Chord tones per bar (midi): Am, F, C, G. */
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
];
/** Bass roots per bar. */
const ROOTS = [45, 41, 48, 43];
/** Lead melody: one note per quarter (4 per bar, 0 = rest). */
const LEAD = [76, 0, 72, 74, 69, 0, 0, 72, 71, 0, 67, 71, 74, 72, 71, 0];

export class ChipMusic {
  private timer: number | undefined;
  private step = 0;
  private nextTime = 0;

  constructor(private engine: AudioEngine) {}

  get playing(): boolean {
    return this.timer !== undefined;
  }

  start(): void {
    const ctx = this.engine.context;
    if (this.timer !== undefined || !ctx) return;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.06;
    this.timer = window.setInterval(() => this.pump(), 25);
  }

  stop(): void {
    if (this.timer !== undefined) {
      window.clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Schedule everything due in the next 120 ms. */
  private pump(): void {
    const ctx = this.engine.context;
    if (!ctx) return;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.scheduleStep(this.step, this.nextTime);
      this.step = (this.step + 1) % (STEPS_PER_BAR * BARS);
      this.nextTime += STEP;
    }
  }

  private scheduleStep(step: number, t: number): void {
    const bus = this.engine.musicBus;
    const bar = Math.floor(step / STEPS_PER_BAR) % BARS;
    const inBar = step % STEPS_PER_BAR;
    const chord = CHORDS[bar];

    // bass: root eighths, octave bounce
    if (inBar % 4 === 0)
      this.engine.tone("triangle", midi(ROOTS[bar]), midi(ROOTS[bar]), STEP * 3.2, 0.5, t, bus);
    else if (inBar % 4 === 2)
      this.engine.tone("triangle", midi(ROOTS[bar] + 12), midi(ROOTS[bar] + 12), STEP * 1.6, 0.3, t, bus);

    // arp: chord tones up an octave, every sixteenth, soft
    const arpNote = chord[inBar % 3] + 12;
    this.engine.tone("square", midi(arpNote), midi(arpNote), STEP * 0.9, 0.1, t, bus);

    // lead: quarters
    if (inBar % 4 === 0) {
      const n = LEAD[bar * 4 + inBar / 4];
      if (n) this.engine.tone("square", midi(n), midi(n), STEP * 3.6, 0.22, t, bus);
    }

    // hats: offbeat sixteenth ticks
    if (inBar % 2 === 1) this.engine.noise(0.03, 0.045, 8000, t, bus);
  }
}

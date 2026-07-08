import { AudioEngine } from "./AudioEngine";
import { CH, ROOT, type Section, type Song } from "./songs";

/**
 * Procedural chiptune sequencer (plan §6, route 2): detuned pulse/saw lead
 * (through the engine's flanger+echo insert), pulse/triangle bass, square
 * arps, kick/snare/hat noise drums, over a lookahead scheduler. Song data
 * (per-table original themes) lives in songs.ts — this class only performs.
 *
 * Style borrows Rob Hubbard's SID-era techniques (never his themes — music
 * must stay original per the IP rule): thin fixed-duty pulse timbres,
 * delayed vibrato on held lead notes, slide-ups into phrases, a rolling
 * 16th-note octave bass under high-energy sections, two-octave broken arps,
 * and shuffle-swung runs. Tracker-module (.xm) playback can replace this
 * later on the same bus.
 */
const STEPS_PER_BAR = 16;

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class ChipMusic {
  private timer: number | undefined;
  private step = 0;
  private nextTime = 0;
  private readonly stepS: number;
  private readonly sectionStartSteps: number[] = [];
  private readonly totalSteps: number;

  constructor(
    private engine: AudioEngine,
    private song: Song,
  ) {
    this.stepS = 60 / song.bpm / 4; // sixteenth note
    this.totalSteps = song.arrangement.reduce((acc, s) => {
      this.sectionStartSteps.push(acc);
      const want = s.chords.length * (STEPS_PER_BAR / s.leadStep);
      if (s.lead.length !== want)
        console.warn(`ChipMusic: section lead has ${s.lead.length} slots, expected ${want}`);
      return acc + s.chords.length * STEPS_PER_BAR;
    }, 0);
  }

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
      this.step = (this.step + 1) % this.totalSteps;
      this.nextTime += this.stepS;
    }
  }

  private scheduleStep(step: number, time: number): void {
    const bus = this.engine.musicBus;
    const STEP = this.stepS;
    const arrangement = this.song.arrangement;
    let idx = arrangement.length - 1;
    while (this.sectionStartSteps[idx] > step) idx--;
    const section: Section = arrangement[idx];
    const local = step - this.sectionStartSteps[idx];
    const bar = Math.floor(local / STEPS_PER_BAR);
    const inBar = local % STEPS_PER_BAR;
    const chordName = section.chords[bar];
    const chord = CH[chordName];
    const root = ROOT[chordName];
    // shuffle: odd sixteenths land late in swung sections
    const t = inBar % 2 === 1 ? time + STEP * section.swing : time;

    // crash wash on the downbeat of high-energy sections
    if (section.crash && local === 0) this.engine.noise(0.35, 0.1, 9000, t, bus);

    // bass
    if (section.bass === "roll") {
      // Hubbard rolling octave bass: every sixteenth, root/octave, buzzy
      // pulse, accents on the beat
      const n = inBar % 2 === 0 ? root : root + 12;
      const accent = inBar % 4 === 0;
      this.engine.tone(
        "pulse25", midi(n), midi(n),
        STEP * (accent ? 1.4 : 0.85), accent ? 0.4 : 0.24, t, bus,
      );
    } else if (section.bass === "pump") {
      if (inBar % 2 === 0) {
        const n = inBar % 8 === 6 ? root + 12 : root;
        this.engine.tone("triangle", midi(n), midi(n), STEP * 1.7, 0.42, t, bus);
      }
    } else {
      // dreamy root/octave bounce
      if (inBar % 4 === 0)
        this.engine.tone("triangle", midi(root), midi(root), STEP * 3.2, 0.5, t, bus);
      else if (inBar % 4 === 2)
        this.engine.tone("triangle", midi(root + 12), midi(root + 12), STEP * 1.6, 0.3, t, bus);
    }

    // arp: broken chord over two octaves, every sixteenth, soft
    if (section.arp) {
      const arpNote = chord[inBar % 3] + 12 + 12 * (Math.floor(inBar / 3) % 2);
      this.engine.tone("square", midi(arpNote), midi(arpNote), STEP * 0.9, 0.1, t, bus);
    }

    // lead: pattern slots with ties; two oscillators detuned ±0.3% through
    // the flanger+echo insert. Hubbard ornaments: phrase-start notes slide
    // up from below, held notes get delayed vibrato.
    if (inBar % section.leadStep === 0) {
      const slotsPerBar = STEPS_PER_BAR / section.leadStep;
      const slot = bar * slotsPerBar + inBar / section.leadStep;
      const n = section.lead[slot];
      if (n > 0) {
        let ties = 0;
        while (section.lead[slot + 1 + ties] === -1) ties++;
        const dur = (1 + ties) * section.leadStep * STEP * 0.92;
        const leadBus = this.engine.musicLeadBus ?? bus;
        const f = midi(n);
        const phraseStart = slot === 0 || section.lead[slot - 1] === 0;
        const opts = {
          glide: phraseStart ? 0.05 : undefined,
          vibrato:
            dur > STEP * 3 ? { delay: 0.16, rate: 5.6, depth: f * 0.009 } : undefined,
        };
        const bend = phraseStart ? 0.92 : 1;
        const vol = section.leadVol * 0.55;
        this.engine.tone(section.wave, f * 1.003 * bend, f * 1.003, dur, vol, t, leadBus, opts);
        this.engine.tone(section.wave, f * 0.997 * bend, f * 0.997, dur, vol, t, leadBus, opts);
      }
    }

    // drums
    const kick = () => {
      this.engine.tone("sine", 115, 42, 0.13, 0.5, t, bus);
      this.engine.noise(0.02, 0.1, 3000, t, bus);
    };
    const snare = () => {
      this.engine.noise(0.09, 0.16, 6500, t, bus);
      this.engine.tone("triangle", 195, 160, 0.06, 0.18, t, bus);
    };
    if (section.drums === "full") {
      if (inBar === 0 || inBar === 8) kick();
      if (inBar === 4 || inBar === 12) snare();
      if (inBar % 2 === 1) this.engine.noise(0.03, 0.045, 8000, t, bus);
    } else if (section.drums === "half") {
      if (inBar === 0) kick();
      if (inBar === 8) snare();
      if (inBar % 4 === 2) this.engine.noise(0.03, 0.04, 8000, t, bus);
    } else {
      if (inBar === 0) kick();
      if (inBar % 4 === 2) this.engine.noise(0.03, 0.03, 8000, t, bus);
    }
  }
}

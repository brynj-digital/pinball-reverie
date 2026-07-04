import { AudioEngine, ChipWave } from "./AudioEngine";

/**
 * Procedural chiptune sequencer (plan §6, route 2): detuned pulse/saw lead
 * (through the engine's flanger+echo insert), pulse/triangle bass, square
 * arps, kick/snare/hat noise drums, over a lookahead scheduler. The Moondial
 * theme is an original A-minor song — verse / chorus / bridge / middle eight
 * / solo, 60 bars (~2:20) before the arrangement loops.
 *
 * Style borrows Rob Hubbard's SID-era techniques (never his themes — music
 * must stay original per the IP rule): thin fixed-duty pulse timbres,
 * delayed vibrato on held lead notes, slide-ups into phrases, a rolling
 * 16th-note octave bass under high-energy sections, two-octave broken arps,
 * and a shuffle-swung solo of fast modal runs. Tracker-module (.xm)
 * playback can replace this later on the same bus.
 */
const BPM = 104;
const STEP = 60 / BPM / 4; // sixteenth note
const STEPS_PER_BAR = 16;

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** Chord tones (midi) keyed by root name, all voiced around octave 3–4. */
const CH = {
  Am: [57, 60, 64],
  C: [48, 52, 55],
  Dm: [50, 53, 57],
  Em: [52, 55, 59],
  E: [52, 56, 59],
  F: [53, 57, 60],
  G: [55, 59, 62],
};
const ROOT = { Am: 45, C: 48, Dm: 38, Em: 40, E: 40, F: 41, G: 43 };

type ChordName = keyof typeof CH;
type DrumStyle = "sparse" | "half" | "full";
type BassStyle = "bounce" | "pump" | "roll";

/**
 * One song section. `lead` holds `16 / leadStep` slots per bar
 * (leadStep 2 = eighths, 1 = sixteenths): midi note = attack, 0 = rest,
 * -1 = tie (extends the previous note). `swing` delays every odd sixteenth
 * by that fraction of a step (Hubbard shuffle).
 */
interface Section {
  chords: ChordName[];
  lead: number[];
  leadStep: 1 | 2;
  wave: ChipWave;
  drums: DrumStyle;
  bass: BassStyle;
  arp: boolean;
  leadVol: number;
  crash: boolean;
  swing: number;
}

// prettier-ignore
const VERSE: Section = {
  chords: ["Am", "F", "C", "G", "Am", "F", "C", "G"],
  lead: [
    76, -1,  0,  0, 72, -1, 74, -1,   69, -1,  0,  0,  0,  0, 72, -1,
    71, -1,  0,  0, 67, -1, 71, -1,   74, -1, 72, -1, 71, -1,  0,  0,
    76, -1,  0,  0, 72, -1, 74, -1,   69, -1,  0,  0, 72, 74, 76, -1,
    72, -1, 71, -1, 67, -1, 64, -1,   69, -1, -1, -1,  0,  0,  0,  0,
  ],
  leadStep: 2, wave: "pulse25", drums: "half", bass: "bounce",
  arp: true, leadVol: 0.22, crash: false, swing: 0,
};

// prettier-ignore
const CHORUS: Section = {
  chords: ["F", "G", "Am", "Em", "F", "G", "Am", "Am"],
  lead: [
    77, -1, 76, -1, 72, -1, 76, -1,   79, -1, 76, -1, 74, -1, 71, -1,
    76, -1, -1, -1, 72, -1, 74, -1,   71, -1, 74, -1, 76, -1, 79, -1,
    77, -1, 76, -1, 72, -1, 76, -1,   79, -1, 81, -1, 79, -1, 76, -1,
    76, -1, 74, -1, 72, -1, 74, -1,   69, -1, -1, -1, -1, -1,  0,  0,
  ],
  leadStep: 2, wave: "square", drums: "full", bass: "roll",
  arp: true, leadVol: 0.24, crash: true, swing: 0,
};

/**
 * The breather. Melody sits in the same octave as the verse/chorus — the
 * softness comes from the triangle timbre and sparse backing, not from
 * dropping register. Triangle has almost no harmonics, so its leadVol runs
 * hotter than the pulse sections to sound level with them.
 */
// prettier-ignore
const BRIDGE: Section = {
  chords: ["Dm", "Em", "F", "G"],
  lead: [
    74, -1, -1, -1, 77, -1, 76, -1,   76, -1, -1, -1,  0,  0, 71, -1,
    72, -1, 76, -1, 77, -1, 79, -1,   79, -1, -1, -1, -1, -1, -1, -1,
  ],
  leadStep: 2, wave: "triangle", drums: "sparse", bass: "bounce",
  arp: false, leadVol: 0.32, crash: false, swing: 0,
};

/**
 * Full-energy lift, but the contrast comes from the harmony (the E-major
 * turn) and the pump bass — the lead stays in the song's pulse family
 * (square, not saw) so it reads as the same instrument, and the solo after
 * it still has somewhere to go.
 */
// prettier-ignore
const MIDDLE_EIGHT: Section = {
  chords: ["F", "C", "Dm", "Am", "F", "C", "E", "E"],
  lead: [
    72, -1, 74, -1, 76, -1, 77, -1,   76, -1, -1, -1, 72, -1, 67, -1,
    74, -1, 77, -1, 74, -1, 72, -1,   72, -1, -1, -1, 69, -1,  0,  0,
    72, -1, 74, -1, 76, -1, 77, -1,   79, -1, -1, -1, 76, -1, 72, -1,
    71, -1, 68, -1, 71, -1, 74, -1,   76, -1, -1, -1, -1, -1,  0,  0,
  ],
  leadStep: 2, wave: "square", drums: "full", bass: "pump",
  arp: true, leadVol: 0.24, crash: true, swing: 0,
};

/**
 * The Hubbard-style solo: shuffle-swung sixteenth runs (A aeolian with a
 * chromatic F♯ passing note in bar 6) over an Am–G–F–E descent, thin
 * 12.5%-duty lead, rolling octave bass. The held G♯ at the end pulls back
 * to the chorus in A minor.
 */
// prettier-ignore
const SOLO: Section = {
  chords: ["Am", "G", "F", "E", "Am", "G", "F", "E"],
  lead: [
    69, 71, 72, 74, 76, 77, 76, 74,   76, -1, -1, -1, 72, -1, 74, -1,
    74, 76, 74, 71, 67, -1, 71, -1,   74, -1, 71, 74, 79, -1, -1, -1,
    77, 76, 77, 79, 81, -1, -1, -1,   77, -1, 76, -1, 72, -1, 76, -1,
    76, -1, 74, -1, 71, 68, 71, -1,   64, -1, -1, -1,  0,  0,  0,  0,
    76, 77, 76, 74, 72, 74, 72, 71,   69, -1, -1, -1, 76, -1, -1, -1,
    79, -1, 78, 79, 81, -1, 79, -1,   74, -1, 71, -1, 67, -1, -1, -1,
    65, 67, 69, 72, 76, 77, 76, 72,   74, -1, 72, -1, 69, -1, -1, -1,
    68, -1, 71, -1, 76, -1, 79, -1,   80, -1, -1, -1, -1, -1, -1, -1,
  ],
  leadStep: 1, wave: "pulse125", drums: "full", bass: "roll",
  arp: false, leadVol: 0.2, crash: true, swing: 0.33,
};

/** Song form: V C V C bridge M8 solo C, then da capo. */
const ARRANGEMENT: Section[] = [VERSE, CHORUS, VERSE, CHORUS, BRIDGE, MIDDLE_EIGHT, SOLO, CHORUS];
const SECTION_START_STEPS: number[] = [];
const TOTAL_STEPS = ARRANGEMENT.reduce((acc, s) => {
  SECTION_START_STEPS.push(acc);
  const want = s.chords.length * (STEPS_PER_BAR / s.leadStep);
  if (s.lead.length !== want)
    console.warn(`ChipMusic: section lead has ${s.lead.length} slots, expected ${want}`);
  return acc + s.chords.length * STEPS_PER_BAR;
}, 0);

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
      this.step = (this.step + 1) % TOTAL_STEPS;
      this.nextTime += STEP;
    }
  }

  private scheduleStep(step: number, time: number): void {
    const bus = this.engine.musicBus;
    let idx = ARRANGEMENT.length - 1;
    while (SECTION_START_STEPS[idx] > step) idx--;
    const section = ARRANGEMENT[idx];
    const local = step - SECTION_START_STEPS[idx];
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

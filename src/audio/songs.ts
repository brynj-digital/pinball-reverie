import type { ChipWave } from "./AudioEngine";

/**
 * Song data for the ChipMusic sequencer — one original theme per table
 * (M10). Pure data (no engine imports) so table modules stay Node-safe.
 * Style stays in the SID-era register per plan §6; themes must be original
 * (IP rule).
 */

/** Chord tones (midi) keyed by root name, all voiced around octave 3–4. */
export const CH = {
  Am: [57, 60, 64],
  A: [57, 61, 64],
  Bb: [58, 62, 65],
  C: [48, 52, 55],
  Dm: [50, 53, 57],
  Em: [52, 55, 59],
  E: [52, 56, 59],
  F: [53, 57, 60],
  G: [55, 59, 62],
  Gm: [55, 58, 62],
} as const;

export const ROOT: Record<ChordName, number> = {
  Am: 45,
  A: 45,
  Bb: 46,
  C: 48,
  Dm: 38,
  Em: 40,
  E: 40,
  F: 41,
  G: 43,
  Gm: 43,
};

export type ChordName = keyof typeof CH;
export type DrumStyle = "sparse" | "half" | "full";
export type BassStyle = "bounce" | "pump" | "roll";

/**
 * One song section. `lead` holds `16 / leadStep` slots per bar
 * (leadStep 2 = eighths, 1 = sixteenths): midi note = attack, 0 = rest,
 * -1 = tie (extends the previous note). `swing` delays every odd sixteenth
 * by that fraction of a step (Hubbard shuffle).
 */
export interface Section {
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

export interface Song {
  bpm: number;
  arrangement: Section[];
}

// ────────────────────────── MOONDIAL — A minor, 104 bpm ──────────────────────────
// Original song: verse / chorus / bridge / middle eight / solo, 60 bars
// (~2:20) before the arrangement loops. Hubbard-technique notes are in the
// section comments below.

// prettier-ignore
const M_VERSE: Section = {
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
const M_CHORUS: Section = {
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
const M_BRIDGE: Section = {
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
const M_MIDDLE_EIGHT: Section = {
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
const M_SOLO: Section = {
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
export const MOONDIAL_SONG: Song = {
  bpm: 104,
  arrangement: [M_VERSE, M_CHORUS, M_VERSE, M_CHORUS, M_BRIDGE, M_MIDDLE_EIGHT, M_SOLO, M_CHORUS],
};

// ────────────────────────── TIDEBREAKER — D minor, 92 bpm ──────────────────────────
// "Abyssal Signal": slower and sparser than Moondial — the theme is built
// around a sonar-ping motif (a lone high D answered two beats later, like a
// return echo). Verses run on triangle over a root-note swell; the chorus
// (the haul) tightens into pulse with the rolling bass; the abyss bridge
// drops the kit to almost nothing. The DIVE fiction lives in the arrangement:
// each pass sits a shade darker than the last before the chorus surfaces.

/** The descent: ping (D5) … echo (A4), long gaps, water moving underneath. */
// prettier-ignore
const T_VERSE: Section = {
  chords: ["Dm", "Dm", "Bb", "C", "Dm", "Dm", "Gm", "A"],
  lead: [
    74, -1, -1, -1,  0,  0, 69, -1,    0,  0, 74, -1,  0,  0, 72, -1,
    70, -1, -1, -1,  0,  0, 65, -1,    0,  0, 67, -1, 70, -1, 72, -1,
    74, -1, -1, -1,  0,  0, 69, -1,    0,  0, 74, -1, 77, -1, 76, -1,
    74, -1, 70, -1, 67, -1, 62, -1,   61, -1, -1, -1, -1, -1,  0,  0,
  ],
  leadStep: 2, wave: "triangle", drums: "sparse", bass: "bounce",
  arp: false, leadVol: 0.3, crash: false, swing: 0,
};

/** The haul: winch engaged — the ping motif doubled and driven. */
// prettier-ignore
const T_CHORUS: Section = {
  chords: ["Dm", "Bb", "F", "C", "Dm", "Bb", "Gm", "A"],
  lead: [
    74, -1, 77, -1, 74, -1, 72, -1,   70, -1, 74, -1, 70, -1, 67, -1,
    69, -1, 72, -1, 69, -1, 65, -1,   67, -1, 72, -1, 76, -1, 77, -1,
    74, -1, 77, -1, 79, -1, 77, -1,   74, -1, 77, -1, 74, -1, 70, -1,
    70, -1, 69, -1, 67, -1, 65, -1,   69, -1, -1, -1, -1, -1,  0,  0,
  ],
  leadStep: 2, wave: "pulse25", drums: "full", bass: "roll",
  arp: true, leadVol: 0.22, crash: true, swing: 0,
};

/** The abyss: kit gone, arp gone — pings in the dark over a bare root. */
// prettier-ignore
const T_ABYSS: Section = {
  chords: ["Dm", "Gm", "Bb", "A"],
  lead: [
    74, -1, -1, -1, -1, -1,  0,  0,    0,  0, 70, -1, -1, -1,  0,  0,
    77, -1, -1, -1,  0,  0, 74, -1,   73, -1, -1, -1, -1, -1, -1, -1,
  ],
  leadStep: 2, wave: "triangle", drums: "sparse", bass: "bounce",
  arp: false, leadVol: 0.34, crash: false, swing: 0,
};

/** Something vast passes: the low turn — F major light through the water,
 * then the A-major pull back down into the verse. */
// prettier-ignore
const T_SURGE: Section = {
  chords: ["Bb", "C", "F", "Dm", "Gm", "C", "A", "A"],
  lead: [
    70, -1, 72, -1, 74, -1, 77, -1,   76, -1, -1, -1, 72, -1, 69, -1,
    70, -1, 74, -1, 70, -1, 67, -1,   65, -1, -1, -1, 62, -1,  0,  0,
    67, -1, 70, -1, 72, -1, 74, -1,   77, -1, -1, -1, 74, -1, 72, -1,
    73, -1, 76, -1, 73, -1, 69, -1,   69, -1, -1, -1, -1, -1,  0,  0,
  ],
  leadStep: 2, wave: "square", drums: "half", bass: "pump",
  arp: true, leadVol: 0.24, crash: true, swing: 0,
};

/** Form: descent, haul, descent, haul, abyss, surge, haul — then dive again. */
export const TIDEBREAKER_SONG: Song = {
  bpm: 92,
  arrangement: [T_VERSE, T_CHORUS, T_VERSE, T_CHORUS, T_ABYSS, T_SURGE, T_CHORUS],
};

// ────────────────────────── MIDNIGHT MIDWAY — C major, 158 bpm ──────────────────────────
// "The Barker's Waltz-That-Isn't": the fastest, brightest theme in the
// lineup — a carousel tune squared off into 4/4. Square-wave organ over an
// oom-pah bounce bass; the chorus rolls; the middle eight is a full
// calliope — sixteenth-note arpeggio runs on the thin pulse, the sound of
// every ride running at once. The breather is the far, dark edge of the
// park where the music arrives on the wind.

/** The gate swings open: a jaunty organ figure walking up the C triad. */
// prettier-ignore
const W_VERSE: Section = {
  chords: ["C", "F", "C", "G", "C", "F", "G", "C"],
  lead: [
    72, -1, 76, -1, 79, -1, 76, -1,   77, -1, 81, -1, 77, -1, 74, -1,
    76, -1, 79, -1, 84, -1, 79, -1,   83, -1, 79, -1, 74, -1,  0,  0,
    72, -1, 76, -1, 79, -1, 76, -1,   77, -1, 81, -1, 84, -1, 81, -1,
    83, -1, 81, -1, 79, -1, 77, -1,   76, -1, 72, -1, -1, -1,  0,  0,
  ],
  leadStep: 2, wave: "square", drums: "half", bass: "bounce",
  arp: true, leadVol: 0.22, crash: false, swing: 0,
};

/** All lights on: the hook climbs to the top of the wheel and waves. */
// prettier-ignore
const W_CHORUS: Section = {
  chords: ["F", "G", "C", "Am", "F", "G", "C", "C"],
  lead: [
    81, -1, 84, -1, 81, -1, 79, -1,   83, -1, 86, -1, 83, -1, 81, -1,
    84, -1, 79, -1, 76, -1, 79, -1,   81, -1, -1, -1, 76, -1,  0,  0,
    81, -1, 84, -1, 81, -1, 79, -1,   83, -1, 86, -1, 88, -1, 86, -1,
    84, -1, 81, -1, 79, -1, 76, -1,   72, -1, -1, -1, -1, -1,  0,  0,
  ],
  leadStep: 2, wave: "pulse25", drums: "full", bass: "roll",
  arp: true, leadVol: 0.24, crash: true, swing: 0,
};

/**
 * The calliope: sixteenth-note broken-chord runs on the 12.5% pulse — a
 * fairground organ's player-piano roll. Each bar rolls its chord up two
 * octaves and back; the pump bass keeps the oom-pah stomping underneath.
 */
// prettier-ignore
const W_CALLIOPE: Section = {
  chords: ["C", "Am", "F", "G"],
  lead: [
    72, 76, 79, 84, 79, 76, 72, 76,   79, 84, 79, 76, 72, 76, 79, -1,
    69, 72, 76, 81, 76, 72, 69, 72,   76, 81, 76, 72, 69, 72, 76, -1,
    65, 69, 72, 77, 72, 69, 65, 69,   72, 77, 81, 77, 72, 69, 65, -1,
    67, 71, 74, 79, 74, 71, 67, 71,   74, 79, 83, 79, 74, 71, 67, -1,
  ],
  leadStep: 1, wave: "pulse125", drums: "full", bass: "pump",
  arp: false, leadVol: 0.2, crash: true, swing: 0,
};

/** The dark edge of the park: the tune drifts over on the wind, triangle
 * and almost nothing else, before the chorus drags you back in. */
// prettier-ignore
const W_EDGE: Section = {
  chords: ["Am", "F", "C", "G"],
  lead: [
    81, -1, -1, -1, 79, -1, 76, -1,   77, -1, -1, -1,  0,  0, 72, -1,
    76, -1, 79, -1, 76, -1, 74, -1,   74, -1, -1, -1, -1, -1, -1, -1,
  ],
  leadStep: 2, wave: "triangle", drums: "sparse", bass: "bounce",
  arp: false, leadVol: 0.32, crash: false, swing: 0,
};

/** Form: gate, lights, gate, lights, calliope, the dark edge, lights. */
export const MIDWAY_SONG: Song = {
  bpm: 158,
  arrangement: [W_VERSE, W_CHORUS, W_VERSE, W_CHORUS, W_CALLIOPE, W_EDGE, W_CHORUS],
};

// ────────────────────────── THE NIGHT MAIL — E minor, 132 bpm ──────────────────────────
// "Racing the Dawn": the rhythm IS the train — a wheel-clack ostinato on
// the rolling bass that never stops, with a lonely two-note whistle riding
// over it. Verses are the rails (tight pulse figure rocking E–B–E), the
// chorus is the whistle answered across the valley; the moor breather is
// triangle and wind; the gradient (middle eight) climbs — the banking
// engine shoving — and tips over into the chorus like a summit crested.

/** The rails: rocking ostinato, eighth after eighth — wheels over joints. */
// prettier-ignore
const N_RAILS: Section = {
  chords: ["Em", "Em", "C", "G", "Em", "Em", "Am", "G"],
  lead: [
    64, -1, 71, -1, 76, -1, 71, -1,   64, -1, 71, -1, 76, -1, 79, -1,
    60, -1, 67, -1, 72, -1, 67, -1,   67, -1, 74, -1, 79, -1, 74, -1,
    64, -1, 71, -1, 76, -1, 71, -1,   64, -1, 71, -1, 76, -1, 79, -1,
    69, -1, 72, -1, 76, -1, 72, -1,   74, -1, 71, -1, 67, -1,  0,  0,
  ],
  leadStep: 2, wave: "pulse25", drums: "half", bass: "roll",
  arp: true, leadVol: 0.22, crash: false, swing: 0,
};

/** The whistle: two long notes across the valley, the rails answering. */
// prettier-ignore
const N_WHISTLE: Section = {
  chords: ["C", "G", "Em", "Am", "C", "G", "Em", "Em"],
  lead: [
    79, -1, -1, -1, 76, -1, 74, -1,   74, -1, -1, -1, 71, -1, 74, -1,
    76, -1, -1, -1, 71, -1, 67, -1,   69, -1, 72, -1, 76, -1, 79, -1,
    79, -1, -1, -1, 76, -1, 74, -1,   74, -1, 79, -1, 74, -1, 71, -1,
    76, -1, -1, -1, 74, -1, 71, -1,   64, -1, -1, -1, -1, -1,  0,  0,
  ],
  leadStep: 2, wave: "square", drums: "full", bass: "roll",
  arp: true, leadVol: 0.24, crash: true, swing: 0,
};

/** The moor: the train far off — the whistle on the wind, wheels gone. */
// prettier-ignore
const N_MOOR: Section = {
  chords: ["Em", "C", "Am", "G"],
  lead: [
    79, -1, -1, -1,  0,  0, 74, -1,   76, -1, -1, -1,  0,  0, 72, -1,
    72, -1, 76, -1, 72, -1, 69, -1,   67, -1, -1, -1, -1, -1, -1, -1,
  ],
  leadStep: 2, wave: "triangle", drums: "sparse", bass: "bounce",
  arp: false, leadVol: 0.32, crash: false, swing: 0,
};

/** The gradient: the climb — a figure that steps up each bar, pump bass
 * shoving underneath, tipping over the top into the chorus. */
// prettier-ignore
const N_GRADIENT: Section = {
  chords: ["Am", "C", "G", "Em", "Am", "C", "G", "G"],
  lead: [
    69, -1, 72, -1, 76, -1, 72, -1,   72, -1, 76, -1, 79, -1, 76, -1,
    74, -1, 79, -1, 83, -1, 79, -1,   76, -1, -1, -1, 71, -1,  0,  0,
    69, -1, 72, -1, 76, -1, 79, -1,   72, -1, 76, -1, 79, -1, 84, -1,
    83, -1, 79, -1, 74, -1, 79, -1,   83, -1, -1, -1, -1, -1,  0,  0,
  ],
  leadStep: 2, wave: "square", drums: "full", bass: "pump",
  arp: true, leadVol: 0.24, crash: true, swing: 0,
};

/** Form: rails, whistle, rails, whistle, the moor, the gradient, whistle. */
export const NIGHTMAIL_SONG: Song = {
  bpm: 132,
  arrangement: [N_RAILS, N_WHISTLE, N_RAILS, N_WHISTLE, N_MOOR, N_GRADIENT, N_WHISTLE],
};

// ────────────────────────── SMALL HOURS — A minor, 100 bpm ──────────────────────────
// "The Small Hours": the lineup's first SHUFFLE — every section swings
// (Hubbard shuffle on the odd sixteenths), where the Night Mail ran dead
// straight. A walking bounce bass under a smoky thin-pulse lead that enters
// late and leaves early (the DJ talking over the record); the chorus is the
// show in full flight; the breather is a caller's voice, triangle and
// nearly alone; the middle eight is the transmitter warming up — a figure
// that climbs a third per bar and tips back into the chorus on the G.

/** The groove: late entries, short phrases, air between them. */
// prettier-ignore
const V_VERSE: Section = {
  chords: ["Am", "Dm", "G", "C", "Am", "Dm", "E", "E"],
  lead: [
     0,  0, 64, -1, 67, -1, 69, -1,   65, -1, -1, -1, 62, -1, 65, -1,
    67, -1, 71, -1, 74, -1, 71, -1,   72, -1, -1, -1,  0,  0, 67, -1,
     0,  0, 69, -1, 72, -1, 76, -1,   74, -1, -1, -1, 72, -1, 69, -1,
    68, -1, 71, -1, 68, -1, 64, -1,   64, -1, -1, -1, -1, -1,  0,  0,
  ],
  leadStep: 2, wave: "pulse25", drums: "half", bass: "bounce",
  arp: true, leadVol: 0.22, crash: false, swing: 0.3,
};

/** On air: the hook leans on the F–G lift and lands home on the sixth. */
// prettier-ignore
const V_CHORUS: Section = {
  chords: ["F", "G", "C", "Am", "F", "G", "Am", "Am"],
  lead: [
    77, -1, 76, -1, 72, -1, 69, -1,   74, -1, -1, -1, 71, -1, 74, -1,
    76, -1, 74, -1, 72, -1, 67, -1,   69, -1, -1, -1, 72, -1, 74, -1,
    77, -1, 76, -1, 72, -1, 76, -1,   79, -1, -1, -1, 74, -1, 71, -1,
    72, -1, 69, -1, 71, -1, 72, -1,   69, -1, -1, -1, -1, -1,  0,  0,
  ],
  leadStep: 2, wave: "square", drums: "full", bass: "roll",
  arp: true, leadVol: 0.24, crash: true, swing: 0.3,
};

/** A caller's voice: triangle, nearly alone, the kit down to brushes. */
// prettier-ignore
const V_CALLER: Section = {
  chords: ["Dm", "G", "C", "Am"],
  lead: [
    74, -1, -1, -1,  0,  0, 72, -1,   71, -1, -1, -1,  0,  0, 67, -1,
    72, -1, 76, -1, 74, -1, 72, -1,   69, -1, -1, -1, -1, -1, -1, -1,
  ],
  leadStep: 2, wave: "triangle", drums: "sparse", bass: "bounce",
  arp: false, leadVol: 0.32, crash: false, swing: 0.3,
};

/** The transmitter warming up: a figure climbing a third per bar, pump
 * bass underneath, tipping over on the G back into the chorus. */
// prettier-ignore
const V_TRANSMITTER: Section = {
  chords: ["Dm", "Em", "F", "G", "Am", "F", "G", "G"],
  lead: [
    65, -1, 69, -1, 72, -1, 69, -1,   67, -1, 71, -1, 74, -1, 71, -1,
    69, -1, 72, -1, 77, -1, 72, -1,   74, -1, -1, -1, 71, -1,  0,  0,
    76, -1, 72, -1, 69, -1, 72, -1,   77, -1, -1, -1, 76, -1, 72, -1,
    74, -1, 76, -1, 79, -1, 81, -1,   79, -1, -1, -1, -1, -1,  0,  0,
  ],
  leadStep: 2, wave: "square", drums: "full", bass: "pump",
  arp: true, leadVol: 0.24, crash: true, swing: 0.3,
};

/** Form: groove, on air, groove, on air, the caller, the transmitter, on air. */
export const SMALLHOURS_SONG: Song = {
  bpm: 100,
  arrangement: [V_VERSE, V_CHORUS, V_VERSE, V_CHORUS, V_CALLER, V_TRANSMITTER, V_CHORUS],
};

// ────────────────────────── THE SUMP — D minor, 92 bpm ──────────────────────────
// "Under the City": the lineup's most reverberant song — dub space, long
// echoing gaps, a pulse bass like distant pumps. The verse answers itself
// (phrase, silence, the echo of the phrase); the chorus is the floodgate
// open and the water moving; the breather is drips in a big dark room; the
// middle eight is the pump hall hammering. Straight time throughout.

/** Deep water: a sparse triangle line that leaves room for its own echo. */
// prettier-ignore
const S_VERSE: Section = {
  chords: ["Dm", "Bb", "F", "C", "Dm", "Bb", "Gm", "C"],
  lead: [
    74, -1, -1, -1,  0,  0, 77, -1,    0,  0,  0,  0, 74, -1,  0,  0,
     0,  0, 72, -1,  0,  0,  0,  0,   69, -1, -1, -1,  0,  0,  0,  0,
    74, -1, -1, -1,  0,  0, 77, -1,    0,  0, 81, -1, 77, -1,  0,  0,
     0,  0, 74, -1, 72, -1,  0,  0,   67, -1, -1, -1, -1, -1,  0,  0,
  ],
  leadStep: 2, wave: "triangle", drums: "sparse", bass: "pump",
  arp: false, leadVol: 0.2, crash: false, swing: 0,
};

/** The gate is open: the water moving, the pulse doubled under it. */
// prettier-ignore
const S_CHORUS: Section = {
  chords: ["Dm", "Gm", "Bb", "C", "Dm", "Gm", "C", "Dm"],
  lead: [
    74, -1, 77, -1, 74, -1, 72, -1,   70, -1, -1, -1, 74, -1, 70, -1,
    77, -1, -1, -1, 74, -1, 77, -1,   79, -1, 77, -1, 74, -1, 72, -1,
    74, -1, 77, -1, 81, -1, 77, -1,   82, -1, -1, -1, 79, -1, 77, -1,
    79, -1, 77, -1, 74, -1, 72, -1,   74, -1, -1, -1, -1, -1,  0,  0,
  ],
  leadStep: 2, wave: "pulse25", drums: "half", bass: "roll",
  arp: true, leadVol: 0.22, crash: false, swing: 0,
};

/** The breather: drips in the dark — near-silence, plinks off the beat. */
// prettier-ignore
const S_DRIPS: Section = {
  chords: ["Dm", "Dm", "Bb", "Bb", "Dm", "Dm", "C", "C"],
  lead: [
     0,  0,  0,  0, 86, -1,  0,  0,    0,  0,  0,  0,  0,  0, 81, -1,
     0,  0,  0,  0,  0,  0,  0,  0,   89, -1,  0,  0,  0,  0,  0,  0,
     0,  0, 86, -1,  0,  0,  0,  0,    0,  0,  0,  0, 82, -1,  0,  0,
     0,  0,  0,  0, 81, -1,  0,  0,    0,  0,  0,  0,  0,  0,  0,  0,
  ],
  leadStep: 2, wave: "triangle", drums: "sparse", bass: "pump",
  arp: false, leadVol: 0.16, crash: false, swing: 0,
};

/** The pump hall: pistons hammering — the middle eight drives. */
// prettier-ignore
const S_PUMPS: Section = {
  chords: ["Dm", "C", "Bb", "C", "Dm", "C", "Gm", "Am"],
  lead: [
    74, 74, -1, 74,  0, 74, 72, -1,   72, 72, -1, 72,  0, 72, 70, -1,
    70, 70, -1, 70,  0, 70, 72, -1,   72, -1, 74, -1, 76, -1, 77, -1,
    74, 74, -1, 74,  0, 74, 72, -1,   72, 72, -1, 72,  0, 72, 70, -1,
    79, -1, 77, -1, 76, -1, 72, -1,   74, -1, -1, -1, -1, -1,  0,  0,
  ],
  leadStep: 2, wave: "square", drums: "full", bass: "pump",
  arp: true, leadVol: 0.24, crash: true, swing: 0,
};

/** Form: deep water, the gate, deep water, the gate, drips, pumps, the gate. */
export const SUMP_SONG: Song = {
  bpm: 92,
  arrangement: [S_VERSE, S_CHORUS, S_VERSE, S_CHORUS, S_DRIPS, S_PUMPS, S_CHORUS],
};

// ────────────────────────── GLASSHOUSE — A minor, 116 bpm ──────────────────────────
// "Nocturne for the Night Shift": a music-box lead (thin, high, short
// phrases) over a soft pulse — the waltz the brief asked for, carried as a
// 3-against-4 cross-rhythm (ChipMusic bars are 16 sixteenths; true 3/4
// needs a sequencer seam noted as the brief's cut line). The chorus adds a
// counter-voice like a second moth; the breather is condensation; the
// middle eight is the swarm running in triplet-feel eighths.

/** The house at night: music-box thirds drifting over a slow pulse. */
// prettier-ignore
const G_VERSE: Section = {
  chords: ["Am", "F", "Dm", "E", "Am", "F", "C", "E"],
  lead: [
    81, -1, -1, 84, -1, -1, 81, -1,    0,  0, 76, -1, -1, -1,  0,  0,
    77, -1, -1, 81, -1, -1, 77, -1,    0,  0, 74, -1, -1, -1,  0,  0,
    81, -1, -1, 84, -1, -1, 88, -1,   -1, -1, 84, -1, 81, -1,  0,  0,
    80, -1, -1, 76, -1, -1, 74, -1,   76, -1, -1, -1, -1, -1,  0,  0,
  ],
  leadStep: 2, wave: "triangle", drums: "sparse", bass: "bounce",
  arp: false, leadVol: 0.2, swing: 0, crash: false,
};

/** In flower: the counter-moth joins, the pulse warms. */
// prettier-ignore
const G_CHORUS: Section = {
  chords: ["Am", "C", "F", "G", "Am", "C", "Dm", "E"],
  lead: [
    84, -1, 81, 84, -1, 88, 84, -1,   81, -1, 79, -1, 81, -1,  0,  0,
    84, -1, 81, 84, -1, 88, 84, -1,   86, -1, 84, -1, 81, -1,  0,  0,
    88, -1, 86, 88, -1, 91, 88, -1,   86, -1, 84, -1, 81, -1, 79, -1,
    81, -1, 79, 76, -1, 74, 76, -1,   81, -1, -1, -1, -1, -1,  0,  0,
  ],
  leadStep: 2, wave: "pulse25", drums: "half", bass: "bounce",
  arp: true, leadVol: 0.22, swing: 0, crash: false,
};

/** Condensation: near-silence, drips off the panes. */
// prettier-ignore
const G_DRIPS: Section = {
  chords: ["Am", "Am", "F", "F", "Dm", "Dm", "E", "E"],
  lead: [
     0,  0,  0,  0, 88, -1,  0,  0,    0,  0, 84, -1,  0,  0,  0,  0,
     0,  0,  0,  0,  0,  0, 89, -1,    0,  0,  0,  0,  0,  0,  0,  0,
     0,  0, 86, -1,  0,  0,  0,  0,    0,  0,  0,  0, 81, -1,  0,  0,
     0,  0,  0,  0,  0,  0, 80, -1,    0,  0,  0,  0,  0,  0,  0,  0,
  ],
  leadStep: 2, wave: "triangle", drums: "sparse", bass: "bounce",
  arp: false, leadVol: 0.15, swing: 0, crash: false,
};

/** The swarm: running sixteenth triplet-feel on the thin pulse. */
// prettier-ignore
const G_SWARM: Section = {
  chords: ["Am", "G", "F", "E", "Am", "G", "F", "E"],
  lead: [
    81, 84, 88, 81, 84, 88, 81, 84,   79, 83, 86, 79, 83, 86, 79, 83,
    77, 81, 84, 77, 81, 84, 77, 81,   76, 80, 83, 76, 80, 83, 80, 83,
    81, 84, 88, 81, 84, 88, 81, 84,   79, 83, 86, 79, 83, 86, 79, 83,
    77, 81, 84, 77, 81, 84, 88, -1,   88, -1, 87, -1, 88, -1,  0,  0,
  ],
  leadStep: 1, wave: "pulse125", drums: "full", bass: "roll",
  arp: true, leadVol: 0.22, swing: 0, crash: true,
};

/** Form: the house, in flower, the house, in flower, drips, swarm, in flower. */
export const GLASSHOUSE_SONG: Song = {
  bpm: 116,
  arrangement: [G_VERSE, G_CHORUS, G_VERSE, G_CHORUS, G_DRIPS, G_SWARM, G_CHORUS],
};

// ────────────────────────── SUMMIT — A minor, 76 bpm ──────────────────────────
// "Thin Air": the lineup's slowest, widest song. Long pedal bass, a lead
// that moves in whole phrases with real silence between them, cold
// intervals (fifths and fourths). The chorus is the cable car moving — a
// steady climbing arpeggio under the lead; the breather is wind alone;
// the middle eight doubles the SUBDIVISION, not the speed. The aurora
// section is the one warm place in the song.

/** The valley station: fifths in the cold, half the sky. */
// prettier-ignore
const A_VERSE: Section = {
  chords: ["Am", "Em", "F", "C", "Am", "Em", "G", "Am"],
  lead: [
    69, -1, -1, -1, 76, -1, -1, -1,    0,  0,  0,  0, 74, -1, -1, -1,
     0,  0, 72, -1, -1, -1,  0,  0,   69, -1, -1, -1, -1, -1,  0,  0,
    69, -1, -1, -1, 76, -1, -1, -1,    0,  0, 81, -1, -1, -1, 79, -1,
     0,  0, 76, -1, -1, -1, 72, -1,   74, -1, -1, -1, -1, -1,  0,  0,
  ],
  leadStep: 2, wave: "triangle", drums: "sparse", bass: "pump",
  arp: false, leadVol: 0.2, crash: false, swing: 0,
};

/** The car climbing: a steady rising figure under the wide lead. */
// prettier-ignore
const A_CHORUS: Section = {
  chords: ["Am", "F", "C", "G", "Am", "F", "Dm", "E"],
  lead: [
    76, -1, 79, -1, 81, -1, -1, -1,   77, -1, 81, -1, 84, -1, -1, -1,
    79, -1, 84, -1, 88, -1, -1, -1,   86, -1, 83, -1, 79, -1,  0,  0,
    76, -1, 79, -1, 81, -1, -1, -1,   77, -1, 81, -1, 84, -1, -1, -1,
    86, -1, 84, -1, 81, -1, 77, -1,   76, -1, -1, -1, -1, -1,  0,  0,
  ],
  leadStep: 2, wave: "pulse25", drums: "half", bass: "roll",
  arp: true, leadVol: 0.22, crash: false, swing: 0,
};

/** The breather: wind alone on the ridge — one held tone, then nothing. */
// prettier-ignore
const A_WIND: Section = {
  chords: ["Am", "Am", "Em", "Em", "F", "F", "E", "E"],
  lead: [
    81, -1, -1, -1, -1, -1, -1, -1,   -1, -1, -1, -1,  0,  0,  0,  0,
     0,  0,  0,  0,  0,  0,  0,  0,   76, -1, -1, -1, -1, -1,  0,  0,
     0,  0,  0,  0, 79, -1, -1, -1,   -1, -1,  0,  0,  0,  0,  0,  0,
     0,  0,  0,  0,  0,  0,  0,  0,   80, -1, -1, -1, -1, -1, -1, -1,
  ],
  leadStep: 2, wave: "triangle", drums: "sparse", bass: "pump",
  arp: false, leadVol: 0.16, crash: false, swing: 0,
};

/** The aurora: the only warm chords in the song, still slow. */
// prettier-ignore
const A_AURORA: Section = {
  chords: ["F", "C", "G", "Am", "F", "C", "E", "Am"],
  lead: [
    84, -1, 86, -1, 88, -1, 91, -1,   88, -1, 86, -1, 84, -1, 81, -1,
    84, -1, -1, -1, 88, -1, -1, -1,   86, -1, 84, -1, 81, -1,  0,  0,
    84, 86, 88, -1, 91, -1, 93, -1,   91, -1, 88, -1, 86, -1, 84, -1,
    81, -1, 84, -1, 88, -1, 84, -1,   81, -1, -1, -1, -1, -1,  0,  0,
  ],
  leadStep: 2, wave: "pulse25", drums: "full", bass: "roll",
  arp: true, leadVol: 0.24, crash: true, swing: 0,
};

/** Form: the valley, the climb, the valley, the climb, wind, aurora, the climb. */
export const SUMMIT_SONG: Song = {
  bpm: 76,
  arrangement: [A_VERSE, A_CHORUS, A_VERSE, A_CHORUS, A_WIND, A_AURORA, A_CHORUS],
};

// ────────────────────────── THUNDERHEAD — E minor, 140 bpm ──────────────────────────
// "Riding the Cell" — the lineup's fastest. Driving arpeggio bass under a
// storm-siren lead (long swells sit against the pace); the breather is THE
// EYE: near-silence, one held tone (grey-box prototype song — final mix
// waits with the master art behind the feel gate).

// prettier-ignore
const TH_VERSE: Section = {
  chords: ["Em", "C", "G", "Dm", "Em", "C", "Am", "E"],
  lead: [
    76, -1, 79, -1, 76, -1, 74, -1,   72, -1, 76, -1, 72, -1, 71, -1,
    74, -1, 79, -1, 74, -1, 71, -1,   69, -1, 74, -1, 71, -1, 67, -1,
    76, -1, 79, -1, 76, -1, 74, -1,   72, -1, 76, -1, 79, -1, 81, -1,
    83, -1, -1, -1, 81, -1, 79, -1,   78, -1, -1, -1, 74, -1, 71, -1,
  ],
  leadStep: 2, wave: "pulse25", drums: "full", bass: "roll",
  arp: true, leadVol: 0.2, crash: false, swing: 0,
};

// prettier-ignore
const TH_SIREN: Section = {
  chords: ["Em", "Em", "C", "Dm", "Em", "Em", "C", "E"],
  lead: [
    88, -1, -1, -1, -1, -1, -1, -1,   86, -1, -1, -1, -1, -1, -1, -1,
    84, -1, -1, -1, 86, -1, -1, -1,   88, -1, -1, -1, -1, -1, -1, -1,
    91, -1, -1, -1, -1, -1, -1, -1,   88, -1, -1, -1, -1, -1, -1, -1,
    86, -1, 84, -1, 83, -1, 84, -1,   86, -1, -1, -1, -1, -1, -1, -1,
  ],
  leadStep: 2, wave: "square", drums: "full", bass: "roll",
  arp: true, leadVol: 0.24, crash: true, swing: 0,
};

// prettier-ignore
const TH_EYE: Section = {
  chords: ["Em", "Em", "Em", "Em", "C", "C", "Em", "Em"],
  lead: [
    76, -1, -1, -1, -1, -1, -1, -1,   -1, -1, -1, -1, -1, -1, -1, -1,
    -1, -1, -1, -1, -1, -1, -1, -1,   -1, -1, -1, -1, -1, -1, -1, -1,
    79, -1, -1, -1, -1, -1, -1, -1,   -1, -1, -1, -1, -1, -1, -1, -1,
    76, -1, -1, -1, -1, -1, -1, -1,   -1, -1, -1, -1, -1, -1, -1, -1,
  ],
  leadStep: 2, wave: "triangle", drums: "sparse", bass: "pump",
  arp: false, leadVol: 0.3, crash: false, swing: 0,
};

export const THUNDERHEAD_SONG: Song = {
  bpm: 140,
  arrangement: [TH_VERSE, TH_VERSE, TH_SIREN, TH_VERSE, TH_EYE, TH_SIREN, TH_SIREN],
};

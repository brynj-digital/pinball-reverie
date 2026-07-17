import type { TableSpec } from "../specs";
import type { TableGeometry } from "../geometry";
import { GlasshouseLogic } from "../../game/glasshouse";
import rules from "../../../design/tables/glasshouse/rules.json";

/**
 * Glasshouse (table 7, the botanic glasshouse at night — M14, the widebody
 * with the lineup's first LEFT-hand plunger) entity constants — metres,
 * y down. Table SHAPE lives in design/tables/glasshouse/playfield.svg;
 * placements are cross-checked against its anchor-* markers at load.
 * Design truth: design/tables/glasshouse/BRIEF.md.
 *
 * The structural breaks (M14): width 0.66 (the widebody, extra room spent
 * on LATERAL play — the vine run crosses the field sideways), the shooter
 * lane on the LEFT (plungerSide; every lane test goes through the
 * geometry helpers), and DOUBLE inlanes each side (the POLLEN COUNT).
 */
const GEOMETRY: TableGeometry = {
  table: {
    width: 0.66,
    playfieldW: 0.66,
    height: 1.05,
    laneWallX: 0.055,
    laneTopY: 0.3,
    spawn: { x: 0.0275, y: 0.98 },
    plungerSide: "left",
  },
  plunger: { x: 0.0275, saddleY: 1.0, tipRestY: 0.998, pull: 0.02, baseY: 1.04 },
  /** Centred on the widebody's playfield centre x 0.3575. */
  flippers: { left: { x: 0.2685, y: 0.95 }, right: { x: 0.4465, y: 0.95 } },
  /** The maintenance lamps the moths circle. */
  bumpers: [
    { id: "1", x: 0.3, y: 0.24, r: 0.028 },
    { id: "2", x: 0.415, y: 0.225, r: 0.028 },
    { id: "3", x: 0.36, y: 0.34, r: 0.028 },
  ],
  /** Willow-hurdle slings — this table's own verts/kick (§4 no-copy-paste). */
  slings: [
    {
      id: "left",
      verts: [
        { x: 0.1945, y: 0.72 },
        { x: 0.2495, y: 0.808 },
        { x: 0.1945, y: 0.808 },
      ],
      kick: { x: 0.86, y: -0.51 },
    },
    {
      id: "right",
      verts: [
        { x: 0.5205, y: 0.72 },
        { x: 0.5205, y: 0.808 },
        { x: 0.4655, y: 0.808 },
      ],
      kick: { x: -0.86, y: -0.51 },
    },
  ],
  /**
   * THE BLOOM BANK: the lineup's first free-standing 5-bank — a horizontal
   * row in the beds, faces pointing DOWN-table (wide flat targets), housing
   * wall 6 mm behind (recess shallower than a ball radius).
   */
  dropTargets: {
    hw: 0.014,
    hh: 0.004,
    targets: [
      { id: "1", x: 0.305, y: 0.5 },
      { id: "2", x: 0.34, y: 0.5 },
      { id: "3", x: 0.375, y: 0.5 },
      { id: "4", x: 0.41, y: 0.5 },
      { id: "5", x: 0.445, y: 0.5 },
    ],
  },
  /** M-O-T-H lane lamps under the wide flat crown. */
  rollovers: [
    { id: "1", x: 0.23, y: 0.115 },
    { id: "2", x: 0.325, y: 0.115 },
    { id: "3", x: 0.42, y: 0.115 },
    { id: "4", x: 0.515, y: 0.115 },
  ],
  /** The three roving lamps (rose halos) + the save inserts. */
  lamps: [
    { id: "lampA", x: 0.27, y: 0.44, rgb: "255, 143, 174" },
    { id: "lampB", x: 0.445, y: 0.395, rgb: "255, 143, 174" },
    { id: "lampC", x: 0.345, y: 0.625, rgb: "255, 143, 174" },
    { id: "mister", x: 0.075, y: 0.868, rgb: "255, 143, 174" },
    { id: "coldframe", x: 0.641, y: 0.838, rgb: "255, 223, 158" },
  ],
  /** The roof vent: spinner across the LEFT launch channel. */
  spinner: { x: 0.151, y: 0.18, halfW: 0.051, tilt: 0.6 },
  kickers: [
    {
      /** THE ORCHID scoop, centre-right; left-flipper feed, RIGHT-bat
       * return (per-table eject hands, §4). */
      id: "orchid",
      hold: { x: 0.5, y: 0.47 },
      eject: { x: -0.11, y: 0.99 },
      holdS: rules.orchid.holdS,
      cooldownS: 0.4,
    },
    {
      /** THE MISTER: left-outlane kickback (the proven kit, mirrored to
       * sit between the LEFT lane wall and the first guide). */
      id: "mister",
      hold: { x: 0.075, y: 0.68 },
      eject: { x: 0.4, y: -1 },
      holdS: 0.25,
      cooldownS: 0.6,
      ejectSpeed: 2.0,
    },
  ],
  /** THE COLD FRAME: right-outlane subway back to the outer-right return
   * lane (lit at the Orchid). */
  subways: [{ id: "coldframe", speed: 1.1, exitSpeed: 1.0 }],
};

export const GLASSHOUSE_SPEC: TableSpec = {
  id: "glasshouse",
  name: "GLASSHOUSE",
  tagline: "THE NIGHT SHIFT BLOOMS",
  geometry: GEOMETRY,
  scoring: rules,
  createLogic: (ctx) => new GlasshouseLogic(ctx),
  highScoreKey: "pinball-highscores-glasshouse-v1",
  // leaf ironwork rails; rose lamps; the vine's glass is rose too (§2)
  theme: {
    rail3d: 0x24382b,
    rail3dElevated: 0xbdc9dc,
    rampGlass3d: 0xff8fae,
    accent: 0xff8fae,
    accentDeep: 0xc24868,
  },
};

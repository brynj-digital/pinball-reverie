import type { TableSpec } from "../specs";
import type { TableGeometry } from "../geometry";
import { SummitLogic } from "../../game/summit";
import rules from "../../../design/tables/summit/rules.json";

/**
 * Summit (table 8, the last cable car to the weather station — M15, the
 * playable-elevation table) entity constants — metres, y down. Table SHAPE
 * lives in design/tables/summit/playfield.svg; placements are
 * cross-checked against its anchor-* markers at load. Design truth:
 * design/tables/summit/BRIEF.md.
 *
 * The structural break (M15): THE TERRACE — a flat h 0.034 surface the
 * ball lands on and PLAYS on, with a z-banded upper flipper
 * (flippers.upper.z: the bat's contacts gate at platform height) and
 * z-banded instrument pads. The cable car is the M12 Lift unchanged; its
 * airborne release lands on the platform by the M11 ballistic rules.
 */
const GEOMETRY: TableGeometry = {
  table: {
    width: 0.575,
    playfieldW: 0.52,
    height: 1.05,
    laneWallX: 0.52,
    laneTopY: 0.3,
    spawn: { x: 0.5475, y: 0.98 },
  },
  plunger: { x: 0.5475, saddleY: 1.0, tipRestY: 0.998, pull: 0.02, baseY: 1.04 },
  flippers: {
    left: { x: 0.171, y: 0.95 },
    right: { x: 0.349, y: 0.95 },
    /**
     * The terrace bat (M15): a left flipper ON the platform, base sealed
     * into the west rail (the mallet's 12 mm pattern), contacts banded to
     * platform heights so ground traffic beneath is never touched.
     */
    upper: { x: 0.334, y: 0.27, side: "left", z: { min: 0.03, max: 0.08 } },
  },
  /** Cairn bumpers, left of the landing zone (kept clear per §4). */
  bumpers: [
    { id: "1", x: 0.15, y: 0.24, r: 0.028 },
    { id: "2", x: 0.255, y: 0.225, r: 0.028 },
    { id: "3", x: 0.19, y: 0.34, r: 0.028 },
  ],
  /** Granite slings — this table's own verts/kick (§4 no-copy-paste). */
  slings: [
    {
      id: "left",
      verts: [
        { x: 0.097, y: 0.718 },
        { x: 0.148, y: 0.806 },
        { x: 0.097, y: 0.806 },
      ],
      kick: { x: 0.88, y: -0.475 },
    },
    {
      id: "right",
      verts: [
        { x: 0.423, y: 0.718 },
        { x: 0.423, y: 0.806 },
        { x: 0.372, y: 0.806 },
      ],
      kick: { x: -0.88, y: -0.475 },
    },
  ],
  /** THE CORNICE: three targets in the orbit wall, right-flipper cross shot. */
  dropTargets: {
    hw: 0.004,
    hh: 0.018,
    targets: [
      { id: "1", x: 0.09, y: 0.463 },
      { id: "2", x: 0.09, y: 0.505 },
      { id: "3", x: 0.09, y: 0.547 },
    ],
  },
  /** P-E-A-K lane lamps. */
  rollovers: [
    { id: "1", x: 0.162, y: 0.115 },
    { id: "2", x: 0.225, y: 0.115 },
    { id: "3", x: 0.295, y: 0.115 },
    { id: "4", x: 0.358, y: 0.115 },
  ],
  /** Instrument dials (ice) + the save inserts. */
  lamps: [
    { id: "baro", x: 0.347, y: 0.218, rgb: "184, 230, 255" },
    { id: "thermo", x: 0.395, y: 0.213, rgb: "184, 230, 255" },
    { id: "anemo", x: 0.443, y: 0.228, rgb: "184, 230, 255" },
    { id: "car", x: 0.248, y: 0.62, rgb: "184, 230, 255" },
    { id: "windbreak", x: 0.026, y: 0.868, rgb: "184, 230, 255" },
    { id: "gallery", x: 0.494, y: 0.838, rgb: "255, 223, 158" },
  ],
  /** The anemometer: spinner across the left orbit lane. */
  spinner: { x: 0.0325, y: 0.43, halfW: 0.0325 },
  kickers: [
    {
      /** THE BOTHY: refuge-hut scoop, mouth down-right (right-flipper
       * feed); ejects to the LEFT bat. */
      id: "bothy",
      hold: { x: 0.18, y: 0.47 },
      eject: { x: 0.05, y: 0.99 },
      holdS: rules.bothy.holdS,
      cooldownS: 0.4,
    },
    {
      /** WINDBREAK: left-outlane kickback (the proven kit). */
      id: "windbreak",
      hold: { x: 0.044, y: 0.68 },
      eject: { x: 0.4, y: -1 },
      holdS: 0.25,
      cooldownS: 0.6,
      ejectSpeed: 2.0,
    },
  ],
  /** THE GALLERY: right-outlane subway to the plunger lane (lit at the
   * Bothy ladder's top). */
  subways: [{ id: "gallery", speed: 1.1, exitSpeed: 1.0 }],
  /** THE CABLE CAR: the M12 lift, dock mid-field, releasing airborne
   * 10 mm over the terrace deck. */
  lifts: [{ id: "car", dwellS: 0.4, speed: 0.55, exitSpeed: 0.35 }],
};

export const SUMMIT_SPEC: TableSpec = {
  id: "summit",
  name: "SUMMIT",
  tagline: "THE LAST CAR UP",
  geometry: GEOMETRY,
  scoring: rules,
  createLogic: (ctx) => new SummitLogic(ctx),
  attractTips: [
    ["RIDE THE CAR UP", "READ THE SKY"],
    ["LAUNCH OFF", "THE TERRACE"],
  ],
  highScoreKey: "pinball-highscores-summit-v1",
  // granite rails, chrome terrace; ice lamps; the terrace glass is ice
  theme: {
    rail3d: 0x31435a,
    rail3dElevated: 0xbdc9dc,
    rampGlass3d: 0xb8e6ff,
    accent: 0xb8e6ff,
    accentDeep: 0x5aa3cc,
  },
};

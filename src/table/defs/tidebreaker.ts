import type { TableSpec } from "../specs";
import type { TableGeometry } from "../geometry";
import { TidebreakerLogic } from "../../game/tidebreaker";
import rules from "../../../design/tables/tidebreaker/rules.json";

/**
 * Tidebreaker (table 2, abyssal salvage dive) entity constants — metres,
 * y down. Table SHAPE lives in design/tables/tidebreaker/playfield.svg
 * (plan §5e); placements are cross-checked against its anchor-* markers at
 * load. Design truth: design/tables/tidebreaker/BRIEF.md; the layout was
 * clearance-solved against the STYLE-GUIDE §4 ball-gap rules.
 *
 * Deliberately asymmetric (STYLE-GUIDE §3 as amended): the left flipper
 * owns the trench mouth + dive bell, the right flipper owns the winch ramp
 * (straight up, layer 1 over the field) + the airlock bank recessed in the
 * orbit wall (cross-field shot).
 */
const GEOMETRY: TableGeometry = {
  // shared envelope with Moondial: same shell, plunger lane, flipper spread
  table: {
    width: 0.575,
    playfieldW: 0.52,
    height: 1.05,
    laneWallX: 0.52,
    laneTopY: 0.3,
    spawn: { x: 0.5475, y: 0.98 },
  },
  plunger: { x: 0.5475, saddleY: 1.0, tipRestY: 0.998, pull: 0.02, baseY: 1.04 },
  flippers: { left: { x: 0.171, y: 0.95 }, right: { x: 0.349, y: 0.95 } },
  /** Sonar buoys: an asymmetric cluster in the upper field. */
  bumpers: [
    { id: "1", x: 0.15, y: 0.24, r: 0.028 },
    { id: "2", x: 0.272, y: 0.232, r: 0.028 },
    { id: "3", x: 0.2, y: 0.345, r: 0.028 },
  ],
  /** Net rigs above the inlanes; hypotenuse is the kicking face. */
  slings: [
    {
      id: "left",
      verts: [
        { x: 0.097, y: 0.72 },
        { x: 0.147, y: 0.805 },
        { x: 0.097, y: 0.805 },
      ],
      kick: { x: 0.848, y: -0.53 },
    },
    {
      id: "right",
      verts: [
        { x: 0.423, y: 0.72 },
        { x: 0.423, y: 0.805 },
        { x: 0.373, y: 0.805 },
      ],
      kick: { x: -0.848, y: -0.53 },
    },
  ],
  /**
   * The airlock: three hatch-bolt drop targets recessed into the orbit
   * wall's field face (left side), faces pointing right — the right
   * flipper's cross-field shot. Housing brackets seal the recess.
   */
  dropTargets: {
    hw: 0.004,
    hh: 0.018,
    targets: [
      { id: "1", x: 0.09, y: 0.443 },
      { id: "2", x: 0.09, y: 0.485 },
      { id: "3", x: 0.09, y: 0.527 },
    ],
  },
  /** D-I-V-E lane lamps, under the four top-lane inserts. */
  rollovers: [
    { id: "1", x: 0.162, y: 0.115 },
    { id: "2", x: 0.225, y: 0.115 },
    { id: "3", x: 0.295, y: 0.115 },
    { id: "4", x: 0.358, y: 0.115 },
  ],
  /** Depth-gauge inserts down the lower centreline (cyan, per BRIEF §4). */
  lamps: [
    { id: "g1", x: 0.255, y: 0.625, rgb: "82, 224, 232" },
    { id: "g2", x: 0.255, y: 0.66, rgb: "82, 224, 232" },
    { id: "g3", x: 0.255, y: 0.695, rgb: "82, 224, 232" },
    { id: "g4", x: 0.255, y: 0.73, rgb: "82, 224, 232" },
    { id: "g5", x: 0.255, y: 0.765, rgb: "82, 224, 232" },
  ],
  /** The winch reel: spinner across the ramp entry channel. */
  spinner: { x: 0.356, y: 0.62, halfW: 0.023 },
  kickers: [
    {
      /** Dive bell scoop, mid-field; ejects to the left flipper. */
      id: "divebell",
      hold: { x: 0.272, y: 0.45 },
      eject: { x: -0.12, y: 0.99 },
      holdS: rules.diveBell.holdS,
      cooldownS: 0.4,
    },
    {
      /** Escape-hatch kickback in the left outlane (lit by D-I-V-E). */
      id: "hatch",
      hold: { x: 0.026, y: 0.958 },
      eject: { x: 0.06, y: -1 },
      holdS: 0.25,
      cooldownS: 0.6,
      ejectSpeed: 1.25,
    },
  ],
  /** Under-field transits; paths are the SVG's height-profile-<id>. */
  subways: [
    { id: "trench", speed: 1.0, exitSpeed: 0.9 },
    { id: "gutter", speed: 1.1, exitSpeed: 1.25 },
  ],
};

export const TIDEBREAKER_SPEC: TableSpec = {
  id: "tidebreaker",
  name: "TIDEBREAKER",
  tagline: "AN ABYSSAL SALVAGE",
  geometry: GEOMETRY,
  scoring: rules,
  createLogic: (ctx) => new TidebreakerLogic(ctx),
  highScoreKey: "pinball-highscores-tidebreaker-v1",
  // dark verdigris field walls (abyss-300/500 blend); habitrail stays chrome
  theme: { rail3d: 0x2d5a66, rail3dElevated: 0xbdc9dc },
};

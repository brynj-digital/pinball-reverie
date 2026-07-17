import type { TableSpec } from "../specs";
import type { TableGeometry } from "../geometry";
import { MoondialLogic } from "../../game/moondial";
import rules from "../../../design/tables/moondial/rules.json";

/**
 * Moondial (table 1, night observatory) entity constants — metres, y down.
 * Table SHAPE lives in design/tables/moondial/playfield.svg (plan §5e);
 * placements here are cross-checked against its anchor-* markers at load.
 */
const GEOMETRY: TableGeometry = {
  /**
   * Pinball Fantasies convention: the plunger lane lives OUTSIDE the
   * playfield walls; the lane (0.52..0.575) only meets the playfield
   * through the orbit at the top.
   */
  table: {
    width: 0.575,
    playfieldW: 0.52,
    height: 1.05,
    laneWallX: 0.52,
    laneTopY: 0.3,
    spawn: { x: 0.5475, y: 0.98 },
  },
  plunger: { x: 0.5475, saddleY: 1.0, tipRestY: 0.998, pull: 0.02, baseY: 1.04 },
  // Pivot spacing sets the tip-to-tip drain gap at rest: 39 mm ≈ 1.45 ball
  // diameters. Anything between one radius and ~1.4 diameters wedges the ball.
  flippers: { left: { x: 0.171, y: 0.95 }, right: { x: 0.349, y: 0.95 } },
  /** Pop bumper triangle, mid-upper field, symmetric about x = 0.26. */
  bumpers: [
    { id: "1", x: 0.19, y: 0.33, r: 0.028 },
    { id: "2", x: 0.33, y: 0.33, r: 0.028 },
    { id: "3", x: 0.26, y: 0.425, r: 0.028 },
  ],
  /** Slingshots above the inlane funnels; hypotenuse is the kicking face. */
  slings: [
    {
      id: "left",
      verts: [
        { x: 0.09, y: 0.72 },
        { x: 0.14, y: 0.8 },
        { x: 0.09, y: 0.8 },
      ],
      kick: { x: 0.848, y: -0.53 },
    },
    {
      id: "right",
      verts: [
        { x: 0.43, y: 0.72 },
        { x: 0.43, y: 0.8 },
        { x: 0.38, y: 0.8 },
      ],
      kick: { x: -0.848, y: -0.53 },
    },
  ],
  /**
   * Drop-target bank on the right wall, faces pointing left. Gaps between
   * targets are 6 mm (< 13.5 mm rule); the pocket behind is sealed by wall
   * brackets above and below the bank.
   */
  dropTargets: {
    hw: 0.004,
    hh: 0.018,
    targets: [
      { id: "1", x: 0.495, y: 0.518 },
      { id: "2", x: 0.495, y: 0.56 },
      { id: "3", x: 0.495, y: 0.602 },
    ],
  },
  /** Moon-phase lane lamps, just below the printed phase inserts. */
  rollovers: [
    { id: "1", x: 0.16, y: 0.12 },
    { id: "2", x: 0.26, y: 0.12 },
    { id: "3", x: 0.36, y: 0.12 },
  ],
  lamps: [],
  /** Spinner bar across the orbit's left lane. */
  spinner: { x: 0.0325, y: 0.4, halfW: 0.0325 },
  /**
   * Telescope kickout scoop under the orbit tail. Ejects aimed to land on
   * the mid left flipper (speed = tuning.kickerEject, simcheck-verified).
   */
  kickers: [
    {
      id: "telescope",
      hold: { x: 0.487, y: 0.368 },
      eject: { x: -0.5, y: 0.87 },
      holdS: rules.telescope.holdS,
      cooldownS: 0.4,
    },
  ],
  subways: [],
  /**
   * THE GNOMON (differentiation pass): retractable centre post between the
   * flipper tips, risen while the ball-saver is live and during LUNAR
   * ECLIPSE. "down" is an inert sliver in the sealed under-saddle void.
   */
  diverters: [{ id: "gnomon", blades: ["up", "down"], initial: "down" }],
};

export const MOONDIAL_SPEC: TableSpec = {
  id: "moondial",
  name: "MOONDIAL",
  tagline: "A NIGHT OBSERVATORY",
  geometry: GEOMETRY,
  scoring: rules,
  createLogic: (ctx) => new MoondialLogic(ctx),
  // pre-M10 key, kept so existing players' scores survive the multi-table move
  attractTips: [
    ["SPOT SIGHTINGS", "AT THE TELESCOPE"],
    ["BANKS + ORBITS", "LIGHT THE ECLIPSE"],
  ],
  highScoreKey: "pinball-highscores-v2",
  // steel + chrome, dayglo glass; violet element lamps (the Reverie signature)
  theme: {
    rail3d: 0xaebcd0,
    rail3dElevated: 0xbdc9dc,
    rampGlass3d: 0x39ff14,
    accent: 0x8c6bff,
    accentDeep: 0x4e37a8,
  },
};

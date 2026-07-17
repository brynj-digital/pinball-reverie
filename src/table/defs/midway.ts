import type { TableSpec } from "../specs";
import type { TableGeometry } from "../geometry";
import { MidwayLogic } from "../../game/midway";
import rules from "../../../design/tables/midway/rules.json";

/**
 * Midnight Midway (table 3, a funfair after dark) entity constants — metres,
 * y down. Table SHAPE lives in design/tables/midway/playfield.svg (plan §5e);
 * placements are cross-checked against its anchor-* markers at load. Design
 * truth: design/tables/midway/BRIEF.md; the layout was clearance-solved
 * against the STYLE-GUIDE §4 ball-gap rules (per layer).
 *
 * Deliberately asymmetric (STYLE-GUIDE §3 as amended), roughly Tidebreaker
 * mirrored: the left flipper owns the coaster (layer-1 circuit, opposite-
 * handed from the winch ramp) + the drop tower cross-shot; the right flipper
 * owns the ghost train + the prize booth; and THE MALLET — the upper third
 * flipper, first of its kind in the engine — owns the high striker alone.
 */
const GEOMETRY: TableGeometry = {
  // shared envelope with the other tables: same shell, plunger lane, spread
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
    /** The mallet: catches Sky Ride returns + soft plunges; base sits 12 mm
     * off the lane wall so nothing slips between it and the wall. */
    upper: { x: 0.49, y: 0.3, side: "right" },
  },
  /** Dodgem bumpers, an asymmetric cluster mid-arena. */
  /**
   * THE DODGEMS (differentiation pass 2026-07-17): FIVE small bumper cars
   * (r 22 mm vs the lineup-standard 3 x 28 mm) scattered across the arena
   * the striker wire crosses — the one table where breaking the 3-bumper
   * rule is the fiction. Placement solved against the gap bands: pairwise
   * centre distance >= 82 mm (edge gaps > 38), clear of the striker
   * rails' ball-height mouth run (x > ~310), the striker-back, the top
   * dividers, the ghost pocket and the booth hood; bumper 5 sits 6.5 mm
   * off the striker-back's end cap (< 13.5 mm = sealed, legal).
   */
  bumpers: [
    { id: "1", x: 0.2, y: 0.235, r: 0.022 },
    { id: "2", x: 0.255, y: 0.31, r: 0.022 },
    { id: "3", x: 0.345, y: 0.315, r: 0.022 },
    { id: "4", x: 0.222, y: 0.39, r: 0.022 },
    { id: "5", x: 0.285, y: 0.22, r: 0.022 },
  ],
  /** Bunting rigs above the inlanes; hypotenuse is the kicking face. */
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
   * The drop tower: three brake-magnet targets recessed into the lane wall's
   * field face (right side), faces pointing left — the left flipper's
   * cross-field shot. Housing brackets seal the recess.
   */
  dropTargets: {
    hw: 0.004,
    hh: 0.018,
    targets: [
      { id: "1", x: 0.495, y: 0.468 },
      { id: "2", x: 0.495, y: 0.51 },
      { id: "3", x: 0.495, y: 0.552 },
    ],
  },
  /** P-A-R-K lane lamps, under the four top-lane inserts. */
  rollovers: [
    { id: "1", x: 0.162, y: 0.115 },
    { id: "2", x: 0.225, y: 0.115 },
    { id: "3", x: 0.295, y: 0.115 },
    { id: "4", x: 0.358, y: 0.115 },
  ],
  /** Ferris wheel gondola inserts — the bonus-X ring (magenta, BRIEF §4) —
   * plus the outlane save inserts: lit while the hand stamp / chicken exit
   * is armed, so the player reads the outlane before the ball drops. */
  lamps: [
    { id: "g1", x: 0.315, y: 0.536, rgb: "255, 62, 154" },
    { id: "g2", x: 0.3473, y: 0.5595, rgb: "255, 62, 154" },
    { id: "g3", x: 0.335, y: 0.5975, rgb: "255, 62, 154" },
    { id: "g4", x: 0.295, y: 0.5975, rgb: "255, 62, 154" },
    { id: "g5", x: 0.2827, y: 0.5595, rgb: "255, 62, 154" },
    { id: "stamp", x: 0.026, y: 0.868, rgb: "255, 62, 154" },
    { id: "chicken", x: 0.494, y: 0.893, rgb: "47, 201, 214" },
    // ghost-train turnstile: lit = the dark ride is open (green ghost glow);
    // dark = spin the turnstile relightSpins times to re-open it
    { id: "ghost", x: 0.24, y: 0.512, rgb: "57, 255, 20" },
  ],
  /** The turnstile: spinner across the ghost-train mouth. */
  spinner: { x: 0.24, y: 0.562, halfW: 0.023 },
  kickers: [
    {
      /** Prize booth scoop under the canopy; ejects to the left flipper. */
      id: "booth",
      hold: { x: 0.35, y: 0.435 },
      eject: { x: -0.28, y: 0.96 },
      holdS: rules.prizeBooth.holdS,
      cooldownS: 0.4,
    },
    {
      /** Hand-stamp kickback in the left outlane (lit by P-A-R-K). */
      id: "stamp",
      hold: { x: 0.026, y: 0.958 },
      eject: { x: 0.06, y: -1 },
      holdS: 0.25,
      cooldownS: 0.6,
      ejectSpeed: 1.25,
    },
  ],
  /** Under-field transits; paths are the SVG's height-profile-<id>. */
  subways: [
    { id: "ghost", speed: 1.0, exitSpeed: 0.9 },
    { id: "chicken", speed: 1.1, exitSpeed: 1.2 },
  ],
};

export const MIDWAY_SPEC: TableSpec = {
  id: "midway",
  name: "MIDNIGHT MIDWAY",
  tagline: "RIDE EVERYTHING",
  geometry: GEOMETRY,
  scoring: rules,
  createLogic: (ctx) => new MidwayLogic(ctx),
  attractTips: [
    ["RIDE EVERYTHING", "PUNCH THE PASS"],
    ["DING THE STRIKER", "FILL THE WHEEL"],
  ],
  highScoreKey: "pinball-highscores-midway-v1",
  // dusk plum field walls (carnival-500/300 blend); wireforms stay chrome
  theme: {
    rail3d: 0x45215a,
    rail3dElevated: 0xbdc9dc,
    rampGlass3d: 0x39ff14,
    accent: 0xff3e9a, // carnival magenta element lamps
    accentDeep: 0xb01860,
  },
};

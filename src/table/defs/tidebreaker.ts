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
  /**
   * PRESSURE SLINGS (differentiation pass): the hull flexing under depth —
   * longer, lower-angled net rigs with a flatter, harder kick than the
   * lineup's shared set (this is the first table off the copy-paste kit,
   * STYLE-GUIDE §4). Grown DOWN and OUT only — the top edge stays at the
   * shared y 0.72: raising it 15 mm clipped the winch habitrail's landing
   * path (simcheck: the drop-off stopped reaching the left inlane).
   * Hypotenuse is the kicking face.
   */
  slings: [
    {
      id: "left",
      verts: [
        { x: 0.097, y: 0.72 },
        { x: 0.152, y: 0.81 },
        { x: 0.097, y: 0.81 },
      ],
      kick: { x: 0.91, y: -0.415 },
    },
    {
      id: "right",
      verts: [
        { x: 0.423, y: 0.72 },
        { x: 0.423, y: 0.81 },
        { x: 0.368, y: 0.81 },
      ],
      kick: { x: -0.91, y: -0.415 },
    },
  ],
  /**
   * The airlock: FOUR hatch-bolt drop targets (L-O-C-K, differentiation
   * pass — grown from the lineup-standard three) recessed into the orbit
   * wall's field face (left side), faces pointing right — the right
   * flipper's cross-field shot. Housing brackets seal the recess; the bank
   * grew upward (the ground below y 555 is the orbit channel's exit).
   */
  dropTargets: {
    hw: 0.004,
    hh: 0.018,
    targets: [
      { id: "4", x: 0.09, y: 0.401 },
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
  /** Depth-gauge inserts down the lower centreline (cyan, per BRIEF §4) —
   * plus the outlane save inserts: lit while the escape hatch / gutter is
   * armed, so the player reads the outlane before the ball drops. */
  lamps: [
    { id: "g1", x: 0.255, y: 0.625, rgb: "82, 224, 232" },
    { id: "g2", x: 0.255, y: 0.66, rgb: "82, 224, 232" },
    { id: "g3", x: 0.255, y: 0.695, rgb: "82, 224, 232" },
    { id: "g4", x: 0.255, y: 0.73, rgb: "82, 224, 232" },
    { id: "g5", x: 0.255, y: 0.765, rgb: "82, 224, 232" },
    { id: "hatch", x: 0.026, y: 0.868, rgb: "82, 224, 232" },
    { id: "gutter", x: 0.494, y: 0.838, rgb: "82, 224, 232" },
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
      /**
       * Escape-hatch kickback in the left outlane (lit by D-I-V-E). The ball is
       * eased up to a hold point in the outlane-top chute — right of and below
       * the deflector tip (0.040, 0.640), the one spot clear of both the
       * deflector ceiling and the guide wall — then fired up-and-right hard
       * enough to clear the guide corner into the lower-left field. A lower
       * hold just fires the ball into the deflector's underside and it drops
       * back down the outlane (the kickback then reads as a dud).
       */
      id: "hatch",
      hold: { x: 0.044, y: 0.68 },
      eject: { x: 0.4, y: -1 },
      holdS: 0.25,
      cooldownS: 0.6,
      ejectSpeed: 2.0,
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
  // dark verdigris field walls (abyss-300/500 blend); habitrail stays chrome;
  // ramp glass is cyan-400 abyssal blue, not the dayglo default (STYLE-GUIDE §2)
  theme: {
    rail3d: 0x2d5a66,
    rail3dElevated: 0xbdc9dc,
    rampGlass3d: 0x2fc9d6,
    accent: 0x2fc9d6, // abyssal cyan element lamps
    accentDeep: 0x147986,
  },
};

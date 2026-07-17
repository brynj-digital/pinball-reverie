import type { TableSpec } from "../specs";
import type { TableGeometry } from "../geometry";
import { NightMailLogic } from "../../game/nightmail";
import rules from "../../../design/tables/nightmail/rules.json";

/**
 * The Night Mail (table 4, overnight mail train) entity constants — metres,
 * y down. Table SHAPE lives in design/tables/nightmail/playfield.svg (plan
 * §5e); placements are cross-checked against its anchor-* markers at load.
 * Design truth: design/tables/nightmail/BRIEF.md.
 *
 * Deliberately asymmetric (STYLE-GUIDE §3 as amended): the RIGHT flipper
 * owns the express — the Main Line orbit entry (bottom-left channel) and
 * the signal gantry (both cross-field); the LEFT flipper owns the climb —
 * the incline lift foot and the Sorting Office scoop. Two ways to the same
 * summit; THE POINTS (M12 diverter) decide what arrival means.
 */
const GEOMETRY: TableGeometry = {
  // shared envelope with Moondial/Tidebreaker: same shell, lane, flippers
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
  /** Goods-yard buffers, shifted right of the exchange lane (clearance). */
  bumpers: [
    { id: "1", x: 0.21, y: 0.245, r: 0.028 },
    { id: "2", x: 0.32, y: 0.232, r: 0.028 },
    { id: "3", x: 0.245, y: 0.345, r: 0.028 },
  ],
  /** Buffer stops above the inlanes; hypotenuse is the kicking face. */
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
   * The signal gantry: three signal-lever drop targets recessed into the
   * orbit wall's field face (left side), faces pointing right — the right
   * flipper's cross-field shot. Every lever hit toggles THE POINTS; a full
   * bank lights LOCK at the coupling siding.
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
  /** M-A-I-L lane lamps, under the four top-lane inserts. */
  rollovers: [
    { id: "1", x: 0.162, y: 0.115 },
    { id: "2", x: 0.225, y: 0.115 },
    { id: "3", x: 0.295, y: 0.115 },
    { id: "4", x: 0.358, y: 0.115 },
  ],
  /** Timetable stations down the centreline (signal green), the points
   * setting lamps at the summit, LOCK at the siding, and the outlane save
   * inserts — lit while the banker / loop line is armed. */
  lamps: [
    { id: "st1", x: 0.255, y: 0.625, rgb: "57, 255, 20" },
    { id: "st2", x: 0.255, y: 0.66, rgb: "57, 255, 20" },
    { id: "st3", x: 0.255, y: 0.695, rgb: "57, 255, 20" },
    { id: "st4", x: 0.255, y: 0.73, rgb: "57, 255, 20" },
    { id: "st5", x: 0.255, y: 0.765, rgb: "57, 255, 20" },
    { id: "pmain", x: 0.12, y: 0.092, rgb: "57, 255, 20" },
    { id: "pbranch", x: 0.146, y: 0.152, rgb: "57, 255, 20" },
    { id: "lock", x: 0.095, y: 0.34, rgb: "255, 223, 158" },
    { id: "banker", x: 0.026, y: 0.868, rgb: "57, 255, 20" },
    { id: "loop", x: 0.494, y: 0.838, rgb: "57, 255, 20" },
  ],
  /** The signal wire: spinner in the top-right channel (launch + orbit).
   * The channel runs along the orbit diagonal (409,134)→(520,300), so the
   * bar tilts to lie across the ball's path: atan2(166,111) − 90° ≈ −0.59. */
  spinner: { x: 0.487, y: 0.177, halfW: 0.03, tilt: -0.59 },
  kickers: [
    {
      /**
       * Sorting Office scoop, mid-field; ejects to the RIGHT flipper
       * (differentiation pass — the lineup's only right-hand scoop return:
       * left-flipper feed in, right-flipper ball out, an alternating-hands
       * loop). Eject clears the incline-left wall by ~10 mm (x 312.5 vs
       * edge 322 at y 690, simcheck-verified landing on the right bat).
       */
      id: "sorting",
      hold: { x: 0.272, y: 0.45 },
      eject: { x: 0.12, y: 0.99 },
      holdS: rules.sorting.holdS,
      cooldownS: 0.4,
    },
    {
      /** The banker: left-outlane kickback (lit by M-A-I-L). Hold point and
       * eject vector proven on table 2's identical outlane geometry. */
      id: "banker",
      hold: { x: 0.044, y: 0.68 },
      eject: { x: 0.4, y: -1 },
      holdS: 0.25,
      cooldownS: 0.6,
      ejectSpeed: 2.0,
    },
    {
      /** Coupling siding (virtual lock until engine multiball): captures a
       * lane ball only while LOCK is lit, clunks, and sends it on down the
       * lane. Wagons persist across balls. */
      id: "siding",
      hold: { x: 0.095, y: 0.368 },
      eject: { x: 0.3, y: 1 },
      holdS: 1.2,
      cooldownS: 0.6,
      ejectSpeed: 1.6,
    },
  ],
  /** The loop line: right outlane, under the field, up through the
   * roundhouse turntable. Lit at the Sorting Office; unlit = drain. */
  subways: [{ id: "loop", speed: 1.1, exitSpeed: 1.0 }],
  /** M12 entities — this table is why they exist. */
  diverters: [{ id: "points", blades: ["main", "branch"], initial: "main" }],
  lifts: [{ id: "incline", dwellS: 0.6, speed: 0.3, exitSpeed: 0.7 }],
  magnets: [
    {
      // radius 0.034, not more: the pull has no wall occlusion, and at
      // 0.05 it reached THROUGH the orbit wall and dragged climbing
      // Main-Line balls to a stall (soak/simcheck-found). 0.034 spans the
      // exchange lane exactly and stops 2 mm short of a wall-hugging
      // channel ball.
      id: "hook",
      x: 0.094,
      y: 0.29,
      radius: 0.034,
      pull: 25,
      captureRadius: 0.012,
      holdS: 0.5,
      fling: { x: 0.25, y: 1 },
      flingSpeed: 1.6,
      cooldownS: 1.5,
    },
  ],
  discs: [{ id: "turntable", x: 0.18, y: 0.64, r: 0.034, grip: 8, maxAccel: 30 }],
};

export const NIGHTMAIL_SPEC: TableSpec = {
  id: "nightmail",
  name: "THE NIGHT MAIL",
  tagline: "RACING THE DAWN",
  geometry: GEOMETRY,
  scoring: rules,
  createLogic: (ctx) => new NightMailLogic(ctx),
  attractTips: [
    ["THROW THE POINTS", "CATCH THE MAILS"],
    ["COUPLE WAGONS", "MAKE THE CONNECTION"],
  ],
  highScoreKey: "pinball-highscores-nightmail-v1",
  // wet-slate field walls (smoke-500/300 blend); the incline wireform stays
  // chrome; ramp glass is the dayglo default (STYLE-GUIDE §2)
  theme: {
    rail3d: 0x35503f,
    rail3dElevated: 0xbdc9dc,
    rampGlass3d: 0x39ff14,
    accent: 0x39ff14, // signal-green element lamps
    accentDeep: 0x1cae0d,
  },
};

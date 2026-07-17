import type { TableSpec } from "../specs";
import type { TableGeometry } from "../geometry";
import { SmallHoursLogic } from "../../game/smallhours";
import rules from "../../../design/tables/smallhours/rules.json";

/**
 * Small Hours (table 5, rooftop pirate radio) entity constants — metres,
 * y down. Table SHAPE lives in design/tables/smallhours/playfield.svg (plan
 * §5e); placements are cross-checked against its anchor-* markers at load.
 * Design truth: design/tables/smallhours/BRIEF.md.
 *
 * Deliberately asymmetric (STYLE-GUIDE §3 as amended): the LEFT flipper
 * owns the station — the Aerial Run (straight up) and the Fader Bank
 * (cross-field); the RIGHT flipper owns the city — the City Sweep entry
 * (bottom-left channel) and the Phone (cross-field). Tune on the sweep,
 * climb with the other flipper: the core loop alternates hands.
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
  /** The neighbours' rooftop aerials, right of centre (the aerial run and
   * the switchboard own the left). */
  bumpers: [
    { id: "1", x: 0.285, y: 0.24, r: 0.028 },
    { id: "2", x: 0.39, y: 0.275, r: 0.028 },
    { id: "3", x: 0.315, y: 0.345, r: 0.028 },
  ],
  /** Studio bafflers above the inlanes; hypotenuse is the kicking face. */
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
   * The fader bank: three mixing-desk faders recessed into the plunger-lane
   * wall (right side), faces pointing left — the left flipper's cross-field
   * shot (the mirror of Tidebreaker's airlock). Faders up = CALLER lit at
   * the switchboard.
   */
  dropTargets: {
    hw: 0.004,
    hh: 0.018,
    targets: [
      { id: "1", x: 0.495, y: 0.443 },
      { id: "2", x: 0.495, y: 0.485 },
      { id: "3", x: 0.495, y: 0.527 },
    ],
  },
  /** W-A-V-E lane lamps, under the four top-lane inserts. */
  rollovers: [
    { id: "1", x: 0.162, y: 0.115 },
    { id: "2", x: 0.225, y: 0.115 },
    { id: "3", x: 0.295, y: 0.115 },
    { id: "4", x: 0.358, y: 0.115 },
  ],
  /** The clock down the centreline (transmitter amber), TUNED at the run
   * mouth, the ON AIR sign at the mast, CALLER + the two hold-line berths
   * at the switchboard, and the outlane save inserts. */
  lamps: [
    { id: "h1", x: 0.255, y: 0.625, rgb: "255, 160, 40" },
    { id: "h2", x: 0.255, y: 0.66, rgb: "255, 160, 40" },
    { id: "h3", x: 0.255, y: 0.695, rgb: "255, 160, 40" },
    { id: "h4", x: 0.255, y: 0.73, rgb: "255, 160, 40" },
    { id: "h5", x: 0.255, y: 0.765, rgb: "255, 160, 40" },
    { id: "tuned", x: 0.168, y: 0.62, rgb: "255, 160, 40" },
    { id: "onair", x: 0.086, y: 0.107, rgb: "255, 160, 40" },
    { id: "caller", x: 0.132, y: 0.38, rgb: "255, 160, 40" },
    { id: "hold1", x: 0.132, y: 0.335, rgb: "255, 223, 158" },
    { id: "hold2", x: 0.132, y: 0.305, rgb: "255, 223, 158" },
    { id: "generator", x: 0.026, y: 0.868, rgb: "255, 160, 40" },
    { id: "sidedoor", x: 0.494, y: 0.838, rgb: "255, 160, 40" },
  ],
  /** THE DIAL: spinner in the top-right launch channel (launch + sweep).
   * Same diagonal channel as table 4: bar tilt ≈ atan2(166,111) − 90°. */
  spinner: { x: 0.487, y: 0.177, halfW: 0.03, tilt: -0.59 },
  kickers: [
    {
      /** The Phone, mid-field; ejects to the left flipper. */
      // moved off the lineup-shared (272,450) scoop spot toward the deck
      // (differentiation pass); eject re-aimed to keep the left-bat landing
      id: "phone",
      hold: { x: 0.3, y: 0.48 },
      eject: { x: -0.25, y: 0.96 },
      holdS: rules.phone.holdS,
      cooldownS: 0.4,
    },
    {
      /** The generator: left-outlane kickback (lit by W-A-V-E). Hold point
       * and eject vector proven on tables 2–4's identical outlane. */
      id: "generator",
      hold: { x: 0.044, y: 0.68 },
      eject: { x: 0.4, y: -1 },
      holdS: 0.25,
      cooldownS: 0.6,
      ejectSpeed: 2.0,
    },
    {
      /** The switchboard: sensor-only capture zone (no pocket geometry —
       * the table 4 siding pattern), captures only while CALLER is lit,
       * parks the caller on the hold line (physical lock) and sends any
       * uncaptured flow onward. */
      id: "switchboard",
      hold: { x: 0.132, y: 0.369 },
      eject: { x: 0.5, y: 1 },
      holdS: 1.2,
      cooldownS: 0.6,
      ejectSpeed: 1.4,
    },
  ],
  /** The side door: right outlane, down the back stairs, resurfacing in
   * the LEFT INLANE — the only outlane in the lineup that hands the ball
   * back to a live flipper. Lit at the Phone; unlit = drain. */
  subways: [{ id: "sidedoor", speed: 1.1, exitSpeed: 1.0 }],
  /** The record deck: parked in normal play, slow drift while TUNED, full
   * spin during ON AIR and THE DAWN CHORUS. */
  discs: [{ id: "deck", x: 0.32, y: 0.64, r: 0.034, grip: 8, maxAccel: 30 }],
};

export const SMALLHOURS_SPEC: TableSpec = {
  id: "smallhours",
  name: "SMALL HOURS",
  tagline: "ON AIR TILL DAWN",
  geometry: GEOMETRY,
  scoring: rules,
  createLogic: (ctx) => new SmallHoursLogic(ctx),
  attractTips: [
    ["TUNE IN THEN", "RIDE THE AERIAL"],
    ["THREE CALLERS", "PUT YOU ON AIR"],
  ],
  highScoreKey: "pinball-highscores-smallhours-v1",
  // warm asphalt field walls (rooftop-500/300 blend); the aerial run stays
  // chrome; ramp glass is transmitter amber (STYLE-GUIDE §2, table 5)
  theme: {
    rail3d: 0x46381f,
    rail3dElevated: 0xbdc9dc,
    rampGlass3d: 0xffa028,
    accent: 0xffa028, // transmitter-amber element lamps
    accentDeep: 0xb35f0e,
  },
};

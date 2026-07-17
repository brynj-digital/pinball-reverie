import type { TableSpec } from "../specs";
import type { TableGeometry } from "../geometry";
import { SumpLogic } from "../../game/sump";
import rules from "../../../design/tables/sump/rules.json";

/**
 * The Sump (table 6, the storm-drain junction under the city — M13, the
 * lower-playfield table) entity constants — metres, y down. Table SHAPE
 * lives in design/tables/sump/playfield.svg (plan §5e); placements are
 * cross-checked against its anchor-* markers at load. Design truth:
 * design/tables/sump/BRIEF.md.
 *
 * The structural break (M13): the table CONTINUES BELOW the lineup's usual
 * floor — height 1.25, the sump chamber at y 1.09..1.24 with its own mini
 * flipper pair on the main left/right buttons, and the true drain at
 * y ~1.228. The FLOODGATE diverter decides whether a centre drain is death
 * (shut) or the way into the chamber (open).
 */
const GEOMETRY: TableGeometry = {
  table: {
    width: 0.575,
    playfieldW: 0.52,
    height: 1.25,
    laneWallX: 0.52,
    laneTopY: 0.3,
    spawn: { x: 0.5475, y: 0.98 },
  },
  plunger: { x: 0.5475, saddleY: 1.0, tipRestY: 0.998, pull: 0.02, baseY: 1.04 },
  flippers: {
    left: { x: 0.171, y: 0.95 },
    right: { x: 0.349, y: 0.95 },
    /** M13: the chamber pair — same hardware, same two buttons. */
    mini: { left: { x: 0.171, y: 1.18 }, right: { x: 0.349, y: 1.18 } },
  },
  /** Grate bumpers under the street slots. */
  bumpers: [
    { id: "1", x: 0.2, y: 0.24, r: 0.028 },
    { id: "2", x: 0.315, y: 0.225, r: 0.028 },
    { id: "3", x: 0.26, y: 0.34, r: 0.028 },
  ],
  /** Iron grating slings — this table's own verts/kick (§4 no-copy-paste). */
  slings: [
    {
      id: "left",
      verts: [
        { x: 0.097, y: 0.715 },
        { x: 0.15, y: 0.807 },
        { x: 0.097, y: 0.807 },
      ],
      kick: { x: 0.87, y: -0.49 },
    },
    {
      id: "right",
      verts: [
        { x: 0.423, y: 0.715 },
        { x: 0.423, y: 0.807 },
        { x: 0.37, y: 0.807 },
      ],
      kick: { x: -0.87, y: -0.49 },
    },
  ],
  /**
   * THE SLUICE: three drop targets recessed in the orbit wall (left side),
   * faces pointing right — the right flipper's cross-field shot. Complete
   * = FLOODGATE lit.
   */
  dropTargets: {
    hw: 0.004,
    hh: 0.018,
    targets: [
      { id: "1", x: 0.09, y: 0.483 },
      { id: "2", x: 0.09, y: 0.525 },
      { id: "3", x: 0.09, y: 0.567 },
    ],
  },
  /** S-U-M-P lane lamps under the four top-lane inserts. */
  rollovers: [
    { id: "1", x: 0.162, y: 0.115 },
    { id: "2", x: 0.225, y: 0.115 },
    { id: "3", x: 0.295, y: 0.115 },
    { id: "4", x: 0.358, y: 0.115 },
  ],
  /** Water-level gauge inserts (flood red) + the save/gate lamps. */
  lamps: [
    { id: "g1", x: 0.261, y: 0.61, rgb: "255, 46, 68" },
    { id: "g2", x: 0.261, y: 0.645, rgb: "255, 46, 68" },
    { id: "g3", x: 0.261, y: 0.68, rgb: "255, 46, 68" },
    { id: "g4", x: 0.261, y: 0.715, rgb: "255, 46, 68" },
    { id: "g5", x: 0.261, y: 0.748, rgb: "255, 46, 68" },
    { id: "gate", x: 0.26, y: 1.02, rgb: "255, 46, 68" },
    { id: "grate", x: 0.026, y: 0.868, rgb: "255, 46, 68" },
    { id: "return", x: 0.152, y: 1.146, rgb: "255, 223, 158" },
  ],
  /** The flow meter: spinner across the left orbit lane. */
  spinner: { x: 0.0325, y: 0.45, halfW: 0.0325 },
  kickers: [
    {
      /** Pump House scoop, centre-right; ejects straight down the middle
       * to the RIGHT flipper (per-table eject hands, §4). */
      id: "pump",
      hold: { x: 0.33, y: 0.47 },
      eject: { x: 0, y: 1 },
      holdS: rules.pump.holdS,
      cooldownS: 0.4,
    },
    {
      /** THE GRATE: left-outlane kickback (the proven outlane kit). */
      id: "grate",
      hold: { x: 0.044, y: 0.68 },
      eject: { x: 0.4, y: -1 },
      holdS: 0.25,
      cooldownS: 0.6,
      ejectSpeed: 2.0,
    },
  ],
  /** THE RETURN PIPE: chamber → left inlane (lit by the valves). */
  subways: [{ id: "return", speed: 1.0, exitSpeed: 0.9 }],
  /** THE FLOODGATE: shut sheds a centre drain to the true drain; open
   * routes it into the chamber. Both blades functional (no inert sliver). */
  diverters: [{ id: "floodgate", blades: ["shut", "open"], initial: "shut" }],
};

export const SUMP_SPEC: TableSpec = {
  id: "sump",
  name: "THE SUMP",
  tagline: "UNDER THE CITY",
  geometry: GEOMETRY,
  scoring: rules,
  createLogic: (ctx) => new SumpLogic(ctx),
  attractTips: [
    ["DROP THE SLUICE", "OPEN THE FLOODGATE"],
    ["THE DRAIN IS", "THE WAY IN"],
  ],
  highScoreKey: "pinball-highscores-sump-v1",
  // iron-green masonry rails; flood-red element lamps (STYLE-GUIDE §2/§7)
  theme: {
    rail3d: 0x2b3a35,
    rail3dElevated: 0xbdc9dc,
    rampGlass3d: 0x39ff14,
    accent: 0xff2e44,
    accentDeep: 0xb01226,
  },
};

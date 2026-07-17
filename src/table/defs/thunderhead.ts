import type { TableSpec } from "../specs";
import type { TableGeometry } from "../geometry";
import { ThunderheadLogic } from "../../game/thunderhead";
import rules from "../../../design/tables/thunderhead/rules.json";

/**
 * Thunderhead (table 9, the storm-watch airship — GREY-BOX PROTOTYPE)
 * entity constants — metres, y down. Table SHAPE lives in
 * design/tables/thunderhead/playfield.svg; placements are cross-checked
 * against its anchor-* markers at load. Design truth:
 * design/tables/thunderhead/BRIEF.md.
 *
 * THE GATE (brief §7.1): this build exists to prove the STAGGERED FLIPPERS
 * feel — left bat 30 mm high, right at standard height, funnel/slings/
 * guides re-derived so the resting tip gap stays the lineup's ~39 mm
 * (Euclidean, across the stagger). No master art, no palette amendment,
 * until the player signs the feel off.
 *
 * The other structural break is subtraction: ZERO pop bumpers — the chaos
 * engine is two CHARGE CELL magnets (M12 hardware) where the nest would
 * sit, scarce and aimed instead of dumb and constant.
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
  /**
   * THE STAGGER: the deck lists to starboard. Left high (y 0.92), right at
   * the standard 0.95; x pulled in 7 mm a side (178/342 vs 171/349) so the
   * resting tip gap across the diagonal stays ~39 mm — the lineup's proven
   * drain-gap invariant, preserved through the stagger by construction.
   */
  flippers: {
    left: { x: 0.178, y: 0.92 },
    right: { x: 0.342, y: 0.95 },
  },
  /** ZERO bumpers — the brief's first structural refusal. */
  bumpers: [],
  /** Storm slings, re-derived per hand around the stagger (left up 30 mm). */
  slings: [
    {
      id: "left",
      verts: [
        { x: 0.099, y: 0.688 },
        { x: 0.15, y: 0.772 },
        { x: 0.099, y: 0.772 },
      ],
      kick: { x: 0.9, y: -0.44 },
    },
    {
      id: "right",
      verts: [
        { x: 0.421, y: 0.72 },
        { x: 0.421, y: 0.806 },
        { x: 0.37, y: 0.806 },
      ],
      kick: { x: -0.9, y: -0.44 },
    },
  ],
  /** BALLAST bank: three drops recessed in the left wall (right-flipper cross shot). */
  dropTargets: {
    hw: 0.004,
    hh: 0.018,
    targets: [
      { id: "1", x: 0.04, y: 0.64 },
      { id: "2", x: 0.04, y: 0.682 },
      { id: "3", x: 0.04, y: 0.724 },
    ],
  },
  /** G-A-L-E lane lamps over the cloud-top. */
  rollovers: [
    { id: "1", x: 0.155, y: 0.11 },
    { id: "2", x: 0.219, y: 0.11 },
    { id: "3", x: 0.291, y: 0.11 },
    { id: "4", x: 0.355, y: 0.11 },
  ],
  /** Cell arcs + save inserts (grey-box: neutral chrome, no storm yellow yet). */
  lamps: [
    { id: "cell1", x: 0.2, y: 0.27, rgb: "216, 222, 233" },
    { id: "cell2", x: 0.33, y: 0.255, rgb: "216, 222, 233" },
    { id: "static", x: 0.044, y: 0.775, rgb: "216, 222, 233" },
    { id: "keel", x: 0.496, y: 0.885, rgb: "216, 222, 233" },
    { id: "nacelle", x: 0.4, y: 0.462, rgb: "255, 223, 158" },
  ],
  /** THE VANE: spinner across the nacelle approach. */
  spinner: { x: 0.48, y: 0.582, halfW: 0.03 },
  kickers: [
    {
      /** THE NACELLE: instrument scoop, centre-right — ejects RIGHT (to the
       * low starboard bat, with the deck's list). */
      id: "nacelle",
      hold: { x: 0.4, y: 0.462 },
      eject: { x: -0.06, y: 1 },
      holdS: rules.nacelle.holdS,
      cooldownS: 0.4,
    },
    {
      /** STATIC: left-outlane kickback — catches at the outlane bottom,
       * fires from the chute mouth above (the hatch/windbreak pattern). */
      id: "static",
      hold: { x: 0.044, y: 0.775 },
      eject: { x: 0.4, y: -1 },
      holdS: 0.25,
      cooldownS: 0.6,
      ejectSpeed: 2.0,
    },
  ],
  /** THE KEEL: right-outlane subway through the hull to the mooring line. */
  subways: [{ id: "keel", speed: 1.1, exitSpeed: 1.0 }],
  /**
   * THE CHARGE CELLS: two magnets where every other table's bumper nest
   * sits. 34 mm fields (the Night Mail's proven no-wall-reach radius),
   * capture → hold → fling; the fling direction is rules-chosen at release
   * via TableLogic.magnetFling (the storm route aims the storm).
   */
  magnets: [
    {
      id: "cell1",
      x: 0.2,
      y: 0.27,
      radius: 0.034,
      pull: 25,
      captureRadius: 0.012,
      holdS: 0.5,
      fling: { x: -0.4, y: 1 },
      flingSpeed: 1.6,
      cooldownS: 1.5,
    },
    {
      id: "cell2",
      x: 0.33,
      y: 0.255,
      radius: 0.034,
      pull: 25,
      captureRadius: 0.012,
      holdS: 0.5,
      fling: { x: 0.4, y: 1 },
      flingSpeed: 1.6,
      cooldownS: 1.5,
    },
  ],
};

export const THUNDERHEAD_SPEC: TableSpec = {
  id: "thunderhead",
  name: "THUNDERHEAD",
  tagline: "GREY-BOX PROTOTYPE",
  geometry: GEOMETRY,
  scoring: rules,
  createLogic: (ctx) => new ThunderheadLogic(ctx),
  attractTips: [
    ["RIDE THE STORM", "DONT GET EATEN"],
    ["GREY-BOX BUILD", "FEEL TEST ONLY"],
  ],
  highScoreKey: "pinball-highscores-thunderhead-v1",
  // grey-box: neutral chrome throughout; storm yellow arrives with the
  // style-guide amendment AFTER the feel gate (brief §4)
  theme: {
    rail3d: 0x3a4152,
    rail3dElevated: 0xaeb6c8,
    rampGlass3d: 0xd8dee9,
    accent: 0xd8dee9,
    accentDeep: 0x8790b3,
  },
};

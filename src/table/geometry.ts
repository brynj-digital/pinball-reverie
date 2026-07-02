/**
 * Entity constants for the Moondial table, in metres with y pointing DOWN
 * the table (matches screen space; gravity is +y).
 *
 * As of milestone 3.5 the table SHAPE (walls + sensors) lives in the
 * playfield SVG (design/tables/moondial/playfield.svg) and is parsed by
 * SvgCollision.ts — never hand-author collision here that duplicates drawn
 * geometry (plan §5e). This module keeps only what the code-defined dynamic
 * entities need (flippers, bumpers, slings, targets, spinner), and those
 * placements are cross-checked against the SVG's anchor-* markers at load.
 *
 * Pure data/math (no planck, no DOM) so physics, renderer and the headless
 * simcheck can all share it.
 */
export interface Pt {
  x: number;
  y: number;
}

export const BALL_RADIUS = 0.0135; // real pinball: 27 mm diameter

/**
 * Pinball Fantasies convention: the plunger lane lives OUTSIDE the playfield
 * walls. The playfield proper is 0..0.52 with every structural element
 * mirror-symmetric about x = 0.26; the lane (0.52..0.575) is appended on the
 * right and only meets the playfield through the orbit at the top.
 */
export const TABLE = {
  width: 0.575,
  /** Right wall of the symmetric playfield = inner wall of the plunger lane. */
  playfieldW: 0.52,
  height: 1.05,
  /** x of the wall separating the plunger lane from the playfield. */
  laneWallX: 0.52,
  /** y where the plunger lane's inner wall ends (orbit tail joins here). */
  laneTopY: 0.3,
  spawn: { x: 0.5475, y: 1.0 },
} as const;

export const FLIPPER = {
  length: 0.079,
  /**
   * Round base centred on the pivot. Fills the notch between the bat polygon
   * and the funnel-wall end — without it the ball wedges in a gap that is
   * bigger than its radius but smaller than its diameter.
   */
  baseRadius: 0.012,
  /** Rest angle below horizontal (rad); mirrored for the right flipper. */
  restAngle: 0.5,
  /** Total swing from down-stop to up-stop (rad). */
  sweep: 1.05,
  // Pivot spacing sets the tip-to-tip drain gap at rest: 39 mm ≈ 1.45 ball
  // diameters. Anything between one radius and ~1.4 diameters wedges the ball.
  pivotL: { x: 0.171, y: 0.95 },
  pivotR: { x: 0.349, y: 0.95 },
} as const;

export type FlipperSide = "left" | "right";

/**
 * Outer arch across the top (also the orbit's outer wall). The left quarter
 * is r 0.26 about (0.26, 0.26); the top-right quarter is r 0.315 about
 * (0.26, 0.315) so it reaches over the plunger lane — both arcs share the
 * apex (0.26, 0) with a horizontal tangent, so the shell is smooth.
 */
export const ARCH = { cx: 0.26, cy: 0.26, r: 0.26 } as const;
export const ARCH_RIGHT = { cx: 0.26, cy: 0.315, r: 0.315 } as const;

/**
 * The orbit ("ramp" of milestone 3): an inner guide wall concentric with the
 * arch plus a straight left lane, forming a channel the plunger launch rides
 * around and down the left side. Channel width 65 mm (> 38 mm rule).
 */
export const ORBIT = {
  r: 0.195,
  laneX: 0.065, // inner wall of the left lane
  laneBottomY: 0.55, // where the lane opens into the playfield
  /** Inner arc ends at this angle (deg) and a tail runs to the plunger-lane wall top. */
  tailAngleDeg: 40,
} as const;

export interface BumperDef {
  id: string;
  x: number;
  y: number;
  r: number;
}
/** Pop bumper triangle, mid-upper field, symmetric about x = 0.26. */
export const BUMPERS: readonly BumperDef[] = [
  { id: "1", x: 0.19, y: 0.33, r: 0.028 },
  { id: "2", x: 0.33, y: 0.33, r: 0.028 },
  { id: "3", x: 0.26, y: 0.425, r: 0.028 },
];

export interface SlingDef {
  id: string;
  verts: Pt[]; // CCW
  kick: Pt; // unit-ish kick direction (face normal, toward the playfield)
}
/** Slingshots above the inlane funnels; hypotenuse is the kicking face. */
export const SLINGS: readonly SlingDef[] = [
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
];

/**
 * Drop-target bank on the right wall, faces pointing left. Gaps between
 * targets are 6 mm (< 13.5 mm rule); the pocket behind is sealed by wall
 * brackets above and below the bank.
 */
export const DROP_TARGETS = {
  x: 0.495, // center of the thin boxes, housed against the playfield's right wall
  hw: 0.004,
  hh: 0.018,
  ys: [0.518, 0.56, 0.602],
} as const;

export interface RolloverDef {
  id: string;
  x: number;
  y: number;
}
/** Top-lane rollover insert positions (sensors live in the SVG). */
export const ROLLOVERS: readonly RolloverDef[] = [
  { id: "1", x: 0.16, y: 0.115 },
  { id: "2", x: 0.26, y: 0.115 },
  { id: "3", x: 0.36, y: 0.115 },
];

/** Spinner bar across the orbit's left lane (its trip sensor lives in the SVG). */
export const SPINNER = { x: ORBIT.laneX / 2, y: 0.4, halfW: ORBIT.laneX / 2 } as const;

/**
 * Flipper bat polygon in local body space, pivot at origin, CCW winding.
 * Left extends +x; right is the x-mirror. The back edge sits on the base
 * circle's chord (x = 0, |y| = baseRadius) so bat + base form one convex
 * profile with no re-entrant corner for the ball to seat in.
 */
export function flipperVerts(side: FlipperSide): Pt[] {
  const L = FLIPPER.length;
  const r = FLIPPER.baseRadius;
  const left: Pt[] = [
    { x: 0, y: -r },
    { x: L, y: -0.007 },
    { x: L, y: 0.007 },
    { x: 0, y: r },
  ];
  if (side === "left") return left;
  // mirror in x, then reverse to restore CCW winding
  return left.map((p) => ({ x: -p.x, y: p.y })).reverse();
}

/*
 * Wall and sensor shapes were removed from this file at milestone 3.5 —
 * they now live in design/tables/moondial/playfield.svg as named
 * "collision-" and "sensor-" prefixed layers. The trap rules travelled too:
 *
 *  - inlane guides end TANGENT to the flipper base circle, past its apex
 *    (short = pocket; below the crown = a creeping ball stalls on the hump)
 *  - every gap < 13.5 mm or > 38 mm; 13.5–38 mm wedges the ball
 *  - lane dividers end 4 mm BELOW the orbit arc line (a tip poking into the
 *    channel pockets a slow orbiting ball)
 *  - the drop-target bank is fully housed: back wall 4 mm behind the
 *    targets so the open recess is shallower than the ball radius
 *
 * These are also recorded in design/STYLE-GUIDE.md §4. Run `npm run
 * simcheck` and `npm run soak` after ANY change to the playfield SVG.
 */

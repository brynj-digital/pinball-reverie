/**
 * Placeholder table geometry for Milestone 1, in metres with y pointing DOWN
 * the table (matches screen space; gravity is +y).
 *
 * Hand-authored only because no Claude Design playfield SVG exists yet — once
 * milestone 3.5 lands, collision geometry is derived from named SVG layers
 * (plan §5e) and this file is replaced by the SVG parser's output.
 *
 * This module is pure data/math (no planck, no DOM) so the physics build,
 * the renderer and the headless simcheck can all share it.
 */
export interface Pt {
  x: number;
  y: number;
}

export const BALL_RADIUS = 0.0135; // real pinball: 27 mm diameter

export const TABLE = {
  width: 0.52,
  height: 1.05,
  /** x of the wall separating the plunger lane from the playfield. */
  laneWallX: 0.465,
  /** y where the plunger lane opens into the playfield. */
  laneTopY: 0.3,
  spawn: { x: 0.4925, y: 1.0 },
  /** Drain sensor box (centre + half extents), spanning outlanes + centre gap. */
  drain: { cx: 0.2325, cy: 1.02, hw: 0.2325, hh: 0.015 },
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

/** Outer arch across the top (also the orbit's outer wall). */
export const ARCH = { cx: 0.26, cy: 0.26, r: 0.26 } as const;

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
/** Pop bumper triangle, mid-upper field. All edge gaps > 38 mm. */
export const BUMPERS: readonly BumperDef[] = [
  { id: "1", x: 0.2, y: 0.34, r: 0.028 },
  { id: "2", x: 0.33, y: 0.32, r: 0.028 },
  { id: "3", x: 0.265, y: 0.42, r: 0.028 },
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
  // Right sling sits 20 mm further from the lane wall than mirror-symmetry
  // would put it: at x 0.43 its bottom corner left a 26 mm wedge against the
  // right funnel wall (soak-verified trap); at 0.41 the passage is 41 mm.
  {
    id: "right",
    verts: [
      { x: 0.41, y: 0.72 },
      { x: 0.41, y: 0.8 },
      { x: 0.36, y: 0.8 },
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
  x: 0.44, // center of the thin boxes
  hw: 0.004,
  hh: 0.018,
  ys: [0.518, 0.56, 0.602],
} as const;

export interface RolloverDef {
  id: string;
  x: number;
  y: number;
}
/** Top-lane rollovers (sensor rects 30 × 20 mm). */
export const ROLLOVERS: readonly RolloverDef[] = [
  { id: "1", x: 0.16, y: 0.115 },
  { id: "2", x: 0.26, y: 0.115 },
  { id: "3", x: 0.36, y: 0.115 },
];
export const ROLLOVER_SENSOR = { hw: 0.015, hh: 0.01 } as const;

/** Spinner bar across the orbit's left lane. */
export const SPINNER = { x: ORBIT.laneX / 2, y: 0.4, halfW: ORBIT.laneX / 2 } as const;

/** Orbit entry (bottom of the left lane) and exit (right arch channel) sensors. */
export const ORBIT_SENSORS = {
  entry: { x: ORBIT.laneX / 2, y: 0.5, hw: 0.03, hh: 0.008 },
  exit: { x: 0.457, y: 0.146, hw: 0.012, hh: 0.012 },
} as const;

/** y of the inner orbit arc at a given x (for butting the lane dividers into it). */
function orbitArcY(x: number): number {
  return ARCH.cy - Math.sqrt(ORBIT.r * ORBIT.r - (x - ARCH.cx) ** 2);
}

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

export interface Polyline {
  pts: Pt[];
  loop: boolean;
}

/** All static wall chains: outer shell (with rounded arch top), funnels, plunger lane. */
export function wallPolylines(): Polyline[] {
  const { width, height, laneWallX, laneTopY } = TABLE;

  // Rounded arch across the top: semicircle radius = half table width.
  const R = width / 2;
  const outer: Pt[] = [
    { x: 0, y: height },
    { x: 0, y: R },
  ];
  const N = 14;
  for (let i = 1; i < N; i++) {
    const th = Math.PI - (i * Math.PI) / N;
    outer.push({ x: R + R * Math.cos(th), y: R - R * Math.sin(th) });
  }
  outer.push({ x: width, y: R });
  outer.push({ x: width, y: height }); // loop closure adds the floor

  return [
    { pts: outer, loop: true },
    // Funnel walls guiding the ball onto the flippers; the vertical tails
    // form the outlane channels down to the drain.
    //
    // Each wall ends exactly TANGENT to the flipper's base circle, past its
    // apex, so wall → base → bat face is one slope-continuous descent. This
    // is the load-bearing property: end the wall short and there's a pocket;
    // bury it below the circle's crown and a slow ball stalls against the
    // hump it can't climb (drop tests pass — the ball arrives with speed —
    // but a creeping ball sticks). Only tangency has no pocket AND no hump.
    // After the tangent point the wall dives inside the circle and down to
    // the floor; the overlap is harmless because the circle's contact
    // normals pass through the pivot — zero torque on the flipper.
    {
      pts: [
        { x: 0, y: 0.8 },
        { x: 0.1784, y: 0.9406 }, // tangent to left base circle
        { x: 0.163, y: 0.955 }, // buried inside the circle
        { x: 0.163, y: height },
      ],
      loop: false,
    },
    {
      pts: [
        { x: laneWallX, y: 0.8 },
        { x: 0.34, y: 0.9421 }, // tangent to right base circle
        { x: 0.357, y: 0.955 }, // buried inside the circle
        { x: 0.357, y: height },
      ],
      loop: false,
    },
    // plunger lane wall
    {
      pts: [
        { x: laneWallX, y: laneTopY },
        { x: laneWallX, y: height },
      ],
      loop: false,
    },
    // Orbit inner wall: left lane up, arc around under the arch, then a tail
    // down to the plunger-lane wall top — so a launched ball rides the whole
    // orbit and exits down the left lane past the spinner.
    { pts: orbitInnerWall(), loop: false },
    // Top-lane dividers, ending 4 mm BELOW the inner arc line (a 4 mm gap is
    // under the ball-radius rule; ending ABOVE the line pokes a tip into the
    // orbit channel that pockets a slow orbiting ball — soak-verified trap)
    { pts: laneDivider(0.215), loop: false },
    { pts: laneDivider(0.305), loop: false },
    // Drop-target bank housing: a back wall 4 mm behind the target faces'
    // rear, joined to the lane wall above and below. When targets are down
    // the exposed recess is only ~12 mm deep (< ball radius), so the ball
    // can never get behind the bank — an open pocket there traps it against
    // the lower seal (soak-verified trap).
    {
      pts: [
        { x: laneWallX, y: 0.49 },
        { x: DROP_TARGETS.x + DROP_TARGETS.hw + 0.004, y: 0.498 },
        { x: DROP_TARGETS.x + DROP_TARGETS.hw + 0.004, y: 0.622 },
        { x: laneWallX, y: 0.63 },
      ],
      loop: false,
    },
  ];
}

function orbitInnerWall(): Pt[] {
  const pts: Pt[] = [
    { x: ORBIT.laneX, y: ORBIT.laneBottomY },
    { x: ORBIT.laneX, y: ARCH.cy }, // = arc point at 180°
  ];
  const N = 14; // 180° → tail angle
  const a0 = Math.PI;
  const a1 = (ORBIT.tailAngleDeg * Math.PI) / 180;
  for (let i = 1; i <= N; i++) {
    const a = a0 + (i * (a1 - a0)) / N;
    pts.push({ x: ARCH.cx + ORBIT.r * Math.cos(a), y: ARCH.cy - ORBIT.r * Math.sin(a) });
  }
  pts.push({ x: TABLE.laneWallX, y: TABLE.laneTopY });
  return pts;
}

function laneDivider(x: number): Pt[] {
  return [
    { x, y: orbitArcY(x) + 0.004 }, // +y = below the arc line, out of the channel
    { x, y: 0.15 },
  ];
}

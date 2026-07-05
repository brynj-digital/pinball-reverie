/**
 * Shared table geometry types and the constants common to every table, in
 * metres with y pointing DOWN the table (matches screen space; gravity +y).
 *
 * Per-table entity constants (bumpers, slings, kickers, …) live in
 * src/table/defs/<id>.ts as a TableGeometry; table SHAPE (walls + sensors)
 * lives in each table's playfield SVG parsed by SvgCollision.ts (plan §5e).
 * Never hand-author collision here that duplicates drawn geometry.
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
 * Flipper hardware is identical on every table (same bats, same coils);
 * only the pivot placement is per-table (TableGeometry.flippers).
 */
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
} as const;

export type FlipperSide = "left" | "right";

export interface BumperDef {
  id: string;
  x: number;
  y: number;
  r: number;
}

export interface SlingDef {
  id: string;
  verts: Pt[]; // CCW
  kick: Pt; // unit-ish kick direction (face normal, toward the playfield)
}

export interface RolloverDef {
  id: string;
  x: number;
  y: number;
}

/** Extra playfield insert lamp (e.g. Tidebreaker's depth gauge). */
export interface LampDef {
  id: string;
  x: number;
  y: number;
  /** "r, g, b" for the renderer's additive glow. */
  rgb: string;
}

export interface DropTargetsDef {
  hw: number;
  hh: number;
  targets: { id: string; x: number; y: number }[];
}

/**
 * Kickout scoop / kickback: trip sensor lives in the SVG (sensor-kicker-<id>);
 * this def drives the capture → hold → eject cycle. Geometry must never trap:
 * scoop mouths open downhill so gravity alone always returns an uncaptured
 * ball to play — only the sensor+hold logic ever keeps a ball at `hold`.
 */
export interface KickerDef {
  id: string;
  hold: Pt;
  eject: Pt; // direction (normalised at use)
  holdS: number;
  /** Post-eject window during which the sensor won't re-capture. */
  cooldownS: number;
  /** Eject speed (m/s); falls back to tuning.kickerEject. */
  ejectSpeed?: number;
}

/**
 * Scripted under-playfield transit (sensor-subway-<id> in the SVG): the ball
 * is carried along the matching height-profile-<id> path and ejected at its
 * far end. Physics stays planar — depth is render-only (plan §7).
 */
export interface SubwayDef {
  id: string;
  /** Travel speed along the path (m/s). */
  speed: number;
  /** Exit speed (m/s) along the path's final segment direction. */
  exitSpeed: number;
}

export interface TableGeometry {
  table: {
    width: number;
    /** Right wall of the playfield = inner wall of the plunger lane. */
    playfieldW: number;
    height: number;
    /** x of the wall separating the plunger lane from the playfield. */
    laneWallX: number;
    /** y where the plunger lane's inner wall ends. */
    laneTopY: number;
    spawn: Pt;
  };
  /** Plunger visuals: rod + spring assembly under the saddle bar. */
  plunger: {
    x: number;
    saddleY: number;
    tipRestY: number;
    pull: number;
    baseY: number;
  };
  /**
   * The lower pair every table has, plus an optional upper (third) flipper
   * (M10+, Midway's mallet): placed by anchor-flipper-upper in the SVG,
   * driven by the "upper" input action (defaults to the same keys as its
   * `side`'s lower flipper). Same hardware (FLIPPER constants) as the pair.
   */
  flippers: { left: Pt; right: Pt; upper?: Pt & { side: FlipperSide } };
  bumpers: readonly BumperDef[];
  slings: readonly SlingDef[];
  dropTargets: DropTargetsDef;
  /** Multiplier-lane lamp indicator positions (sensors live in the SVG). */
  rollovers: readonly RolloverDef[];
  lamps: readonly LampDef[];
  spinner: { x: number; y: number; halfW: number };
  kickers: readonly KickerDef[];
  subways: readonly SubwayDef[];
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

/*
 * The ball-trap rules that gate every playfield SVG (also in
 * design/STYLE-GUIDE.md §4 — run `npm run simcheck` and `npm run soak`
 * after ANY change to a playfield SVG):
 *
 *  - inlane guides end TANGENT to the flipper base circle, past its apex
 *  - every gap < 13.5 mm or > 38 mm; 13.5–38 mm wedges the ball
 *  - lane dividers end 4 mm BELOW the orbit arc line
 *  - target banks are fully housed: back wall ≤ 8 mm behind the targets so
 *    the open recess is shallower than the ball radius
 *  - gap rules apply PER LAYER (data-layer) — see STYLE-GUIDE §4
 */

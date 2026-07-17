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

/**
 * Logic-controlled gate (M12, the Night Mail's Points). The SVG carries one
 * collision chain per blade (`collision-diverter-<id>-<blade>`, blade names
 * single-segment); exactly one blade is solid at a time, chosen by
 * TableLogic.diverterBlade(id) (default: `initial`). Blades swap by fixture
 * create/destroy post-step — the DropTargetBank pattern.
 */
export interface DiverterDef {
  id: string;
  /** Blade names; each needs a collision-diverter-<id>-<blade> path. */
  blades: readonly string[];
  /** Blade solid at load and whenever logic offers no override. */
  initial: string;
}

/**
 * Scripted lift (M12, the Night Mail's incline): sensor-lift-<id> captures
 * at the foot (lit-gated via TableLogic.kickerLit like kickers/subways); the
 * ball is carried along height-profile-<id> with z following the profile
 * height, then released AIRBORNE at the far end — it flies off the summit
 * and lands on the best surface below (M11 ballistics), unlike a Subway
 * which ends its transit at ground level.
 */
export interface LiftDef {
  id: string;
  /** Pause at the foot before the carry starts (the engine coupling on). */
  dwellS: number;
  /** Travel speed along the path (m/s). */
  speed: number;
  /** Exit speed (m/s) along the path's final segment direction. */
  exitSpeed: number;
}

/**
 * Magnet (M12, the Night Mail's mail-hook): while lit
 * (TableLogic.magnetLit, default unlit) it pulls a ground ball within
 * `radius` toward (x, y), captures inside `captureRadius`, holds `holdS`,
 * then flings along `fling` at `flingSpeed`. Elevated/transiting balls are
 * ignored — a rider crossing above the magnet is out of its reach.
 */
export interface MagnetDef {
  id: string;
  x: number;
  y: number;
  /** Pull field radius (m). */
  radius: number;
  /** Pull acceleration (m/s²) at the core, falling linearly to 0 at the rim. */
  pull: number;
  /** Capture distance (m). */
  captureRadius: number;
  holdS: number;
  fling: Pt; // direction (normalised at use)
  flingSpeed: number;
  /** Post-fling window during which the magnet won't re-capture. */
  cooldownS: number;
}

/**
 * Rotating floor disc (M12, the Night Mail's turntable): a flush patch that
 * couples a ground ball's velocity toward the disc's surface velocity
 * (ω × r) with a friction-like force. Spin rate comes from
 * TableLogic.discSpin (rad/s, signed; default 0 = parked, no force).
 */
export interface DiscDef {
  id: string;
  x: number;
  y: number;
  r: number;
  /** Velocity-coupling rate toward the surface velocity (1/s). */
  grip: number;
  /** Cap on the coupling acceleration (m/s²). */
  maxAccel: number;
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
    /**
     * Which side of the playfield the shooter lane lives on (M14, the
     * Glasshouse). Default "right" (the lineup convention). All
     * lane-vs-playfield tests must go through the helpers below.
     */
    plungerSide?: "left" | "right";
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
   *
   * `mini` (M13, the Sump's chamber pair): an optional SECOND full pair,
   * placed by anchor-flipper-mini-left/right and driven by the SAME
   * left/right actions as the main pair — one button works both storeys,
   * the real-machine lower-playfield convention. Same hardware.
   */
  flippers: {
    left: Pt;
    right: Pt;
    upper?: Pt & { side: FlipperSide };
    mini?: { left: Pt; right: Pt };
  };
  bumpers: readonly BumperDef[];
  slings: readonly SlingDef[];
  dropTargets: DropTargetsDef;
  /** Multiplier-lane lamp indicator positions (sensors live in the SVG). */
  rollovers: readonly RolloverDef[];
  lamps: readonly LampDef[];
  /**
   * Spinner placement. `tilt` (rad, default 0) rotates the bar in the table
   * plane so its axle lies ACROSS the lane it spans — 0 suits a vertical
   * lane (bar horizontal); a diagonal channel needs the lane's direction
   * minus 90° (the Night Mail's signal wire crosses the top-right channel).
   */
  spinner: { x: number; y: number; halfW: number; tilt?: number };
  kickers: readonly KickerDef[];
  subways: readonly SubwayDef[];
  /** M12 entities (optional: pre-Night-Mail tables simply have none). */
  diverters?: readonly DiverterDef[];
  lifts?: readonly LiftDef[];
  magnets?: readonly MagnetDef[];
  discs?: readonly DiscDef[];
}

/**
 * Flipper bat polygon in local body space, pivot at origin, CCW winding.
 * Left extends +x; right is the x-mirror. The back edge sits on the base
 * circle's chord (x = 0, |y| = baseRadius) so bat + base form one convex
 * profile with no re-entrant corner for the ball to seat in.
 */
/** Is (x, y) inside the shooter lane? (M14: side-aware — never hand-roll.) */
export function inShooterLane(
  t: { laneWallX: number; laneTopY: number; plungerSide?: "left" | "right" },
  x: number,
  y: number,
): boolean {
  if (y <= t.laneTopY) return false;
  return t.plungerSide === "left" ? x < t.laneWallX : x > t.laneWallX;
}

/** Is x on the playfield side of the lane wall? (Camera follow, gates.) */
export function onPlayfieldSide(
  t: { laneWallX: number; plungerSide?: "left" | "right" },
  x: number,
): boolean {
  return t.plungerSide === "left" ? x > t.laneWallX : x < t.laneWallX;
}

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

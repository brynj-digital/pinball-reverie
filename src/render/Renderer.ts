/**
 * The renderer seam (plan §3). `Game` only ever talks to this interface, so
 * Renderer2D can be swapped for Renderer3D without touching game logic.
 * Pure types — no planck, no DOM imports.
 */
import type { FlipperSide } from "../table/geometry";
import type { Camera } from "../core/Camera";

export interface TableRenderData {
  width: number;
  height: number;
  /**
   * Raw SVG text of the playfield art (drawn as the base layer). Text, not a
   * URL: the renderer re-rasterizes it at the display scale for crispness —
   * browsers rasterize SVG images at their intrinsic size, so drawing the
   * 575 px master onto a ~2600 px canvas via URL would blur.
   */
  artSvgText?: string;
  /** Raw SVG text of the ball art. */
  ballSvgText?: string;
  /** Raw SVG text of the backglass (drawn in the side panel under the DMD). */
  backglassSvgText?: string;
  /** Plunger assembly placement (per-table; drawn by the renderer). */
  plunger: { x: number; saddleY: number; tipRestY: number; pull: number; baseY: number };
  /** Per-table material tints (wall art colors live in the SVG). The
   * `accent` pair is the table's element-lamp colour (STYLE-GUIDE §7) —
   * used by slings/drop targets in both renderers. */
  theme?: {
    rail3d: number;
    rail3dElevated: number;
    rampGlass3d: number;
    accent: number;
    accentDeep: number;
  };
}

export interface BallSnapshot {
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  /** 1 in play; fades to 0 while the drained ball drops out. */
  alpha: number;
  /** Display height above the playfield (m; negative = subway). Render-only
   * — physics stays planar (plan §7). */
  h: number;
  /** Collision layer (0 field, 1 raised, -1 subway) for draw styling. */
  layer: number;
}

export interface FlipperSnapshot {
  x: number;
  y: number;
  angle: number;
  side: FlipperSide;
}

export type DebugShape =
  | { type: "circle"; x: number; y: number; r: number; sensor: boolean; layer?: number }
  | { type: "poly"; pts: { x: number; y: number }[]; closed: boolean; sensor: boolean; layer?: number };

export interface ElementsSnapshot {
  /** flash: 1 → 0 after a hit. */
  bumpers: { x: number; y: number; r: number; flash: number }[];
  slings: { verts: { x: number; y: number }[]; flash: number }[];
  targets: { x: number; y: number; hw: number; hh: number; up: boolean }[];
  /** lit: 1 → 0 after the ball rolls over. */
  rollovers: { x: number; y: number; lit: number }[];
  /** Extra insert lamps (e.g. depth gauge); rgb feeds the additive glow. */
  lamps: { x: number; y: number; rgb: string; lit: number }[];
  /** tilt: table-plane rotation of the bar (rad) so it lies across its lane. */
  spinner: { x: number; y: number; halfW: number; angle: number; spin: number; tilt?: number };
  /** M12: the solid blade of each diverter, as a table-space polyline. */
  diverters: { id: string; blade: string; pts: { x: number; y: number }[] }[];
  /** M12: magnet cores (r = capture radius; lit while armed). */
  magnets: { x: number; y: number; r: number; lit: boolean; holding: boolean }[];
  /** M12: rotating discs (angle in rad; spinning while driven). */
  discs: { x: number; y: number; r: number; angle: number; spinning: boolean }[];
}

export interface WorldSnapshot {
  ball: BallSnapshot;
  /** M12 multiball extras; empty outside multiball. */
  extraBalls: BallSnapshot[];
  flippers: FlipperSnapshot[];
  elements: ElementsSnapshot;
  score: number;
  /** Last scoring label + seconds since it happened (HUD flash; DMD in M4). */
  scoreLabel: string;
  scoreLabelAge: number;
  plungerCharge: number;
  fps: number;
  /** Smoothed JS cost per frame (ms) — splits game code from browser paint. */
  jsMs: number;
  /** Canvas resolution fraction of native DPI — the active renderer's value
   * of the per-mode performance option (Game persists one per RenderMode). */
  renderScale: number;
  /** Show the frame-stats HUD line (settings toggle; defaults off on
   * small/touch devices, where it's clutter). */
  hudStats: boolean;
  /** Show the keyboard-hints HUD line (settings toggle; defaults off on
   * small/touch devices, where the key names don't even apply). */
  hudKeys: boolean;
  /**
   * The DMD's offscreen canvas (plan §5b): the DMD subsystem owns and paints
   * it; renderers only composite it (2D blits it, 3D would texture-map it).
   */
  dmd?: HTMLCanvasElement;
  /** Present only when the debug overlay is enabled. */
  debugShapes?: DebugShape[];
}

/** In-world juice effects (plan §5d): impact ring, launch puff, drain pulse. */
export type EffectKind = "flash" | "launch" | "drain";

/** Which Renderer implementation drives the game (player-facing toggle). */
export type RenderMode = "2d" | "3d";

/** 3D camera style: tilted perspective chase, or top-down orthographic
 * "classic view" (WebGL-drawn flat look). Ignored by the 2D renderer. */
export type View3D = "tilted" | "flat";

export interface Renderer {
  init(table: TableRenderData): void;
  drawFrame(snap: WorldSnapshot, camera: Camera): void;
  spawnEffect(kind: EffectKind, x: number, y: number): void;
  /** Camera style for renderers that have one (Renderer3D). */
  setView3D?(view: View3D): void;
  /**
   * Table-metres of height this renderer actually shows for a requested view
   * height. Renderer2D grows it when width binds the scale (narrow screens) —
   * without this the camera clamps to a window smaller than the screen and
   * scroll extremes expose void past the table edges. Game feeds the result
   * into `camera.viewH`; renderers without the method show exactly the base.
   */
  effectiveViewH?(baseViewH: number): number;
  /** Release GPU/DOM resources when the renderer is swapped out. */
  dispose?(): void;
}

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
}

export interface BallSnapshot {
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  /** 1 in play; fades to 0 while the drained ball drops out. */
  alpha: number;
}

export interface FlipperSnapshot {
  x: number;
  y: number;
  angle: number;
  side: FlipperSide;
}

export type DebugShape =
  | { type: "circle"; x: number; y: number; r: number; sensor: boolean }
  | { type: "poly"; pts: { x: number; y: number }[]; closed: boolean; sensor: boolean };

export interface ElementsSnapshot {
  /** flash: 1 → 0 after a hit. */
  bumpers: { x: number; y: number; r: number; flash: number }[];
  slings: { verts: { x: number; y: number }[]; flash: number }[];
  targets: { x: number; y: number; hw: number; hh: number; up: boolean }[];
  /** lit: 1 → 0 after the ball rolls over. */
  rollovers: { x: number; y: number; lit: number }[];
  spinner: { x: number; y: number; halfW: number; angle: number; spin: number };
}

export interface WorldSnapshot {
  ball: BallSnapshot;
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

export interface Renderer {
  init(table: TableRenderData): void;
  drawFrame(snap: WorldSnapshot, camera: Camera): void;
  spawnEffect(kind: EffectKind, x: number, y: number): void;
}

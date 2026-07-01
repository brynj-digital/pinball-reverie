/**
 * The renderer seam (plan §3). `Game` only ever talks to this interface, so
 * Renderer2D can be swapped for Renderer3D without touching game logic.
 * Pure types — no planck, no DOM imports.
 */
import type { FlipperSide, Polyline } from "../table/geometry";
import type { Camera } from "../core/Camera";

export interface TableRenderData {
  width: number;
  height: number;
  polylines: Polyline[];
}

export interface BallSnapshot {
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
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
  spinner: { x: number; y: number; halfW: number; angle: number };
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
  /** Present only when the debug overlay is enabled. */
  debugShapes?: DebugShape[];
}

export type EffectKind = "flash" | "shake" | "trail";

export interface Renderer {
  init(table: TableRenderData): void;
  drawFrame(snap: WorldSnapshot, camera: Camera): void;
  spawnEffect(kind: EffectKind, x: number, y: number): void;
}

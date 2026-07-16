import type { TableGeometry } from "./geometry";
import type { TableLogic, TableLogicCtx } from "../game/TableLogic";
import { MOONDIAL_SPEC } from "./defs/moondial";
import { TIDEBREAKER_SPEC } from "./defs/tidebreaker";
import { MIDWAY_SPEC } from "./defs/midway";
import { NIGHTMAIL_SPEC } from "./defs/nightmail";

/** Scoring values every table's rules JSON must carry (Scoring.ts reads these). */
export interface ScoringRules {
  points: {
    bumper: number;
    sling: number;
    rollover: number;
    spinnerTick: number;
    target: number;
    bankComplete: number;
    orbit: number;
  };
  bonusUnits: { rollover: number; target: number; spinnerTick: number };
}

/**
 * Everything the engine needs to run one table (Node-safe: no DOM, no Vite
 * asset imports — raw SVG/scene text lives in src/table/assets.ts, browser
 * only). New tables register in TABLE_SPECS; scripts and Game both build
 * from here so simcheck/soak exercise exactly what ships.
 */
export interface TableSpec {
  id: TableId;
  name: string;
  /** Attract-scene subtitle. */
  tagline: string;
  geometry: TableGeometry;
  scoring: ScoringRules;
  createLogic(ctx: TableLogicCtx): TableLogic;
  /** localStorage key — each table keeps its own high-score list. */
  highScoreKey: string;
  /**
   * Renderer theming that can't live in the SVG (3D materials). Wall art
   * colors themselves are per-table IN the SVG (STYLE-GUIDE §2); these keep
   * the 3D rail materials in step. Elevated wireforms stay chrome on every
   * table — the material split is the layer cue. `rampGlass3d` tints the
   * translucent bed between the wires and must match the SVG's
   * art-rails-elevated wash (STYLE-GUIDE §2). `accent`/`accentDeep` are the
   * table's element-lamp pair (STYLE-GUIDE §7, a neon-400/600 token pair) —
   * sling lamps and drop-target plastic in BOTH renderers draw from them.
   */
  theme: {
    rail3d: number;
    rail3dElevated: number;
    rampGlass3d: number;
    accent: number;
    accentDeep: number;
  };
}

export type TableId = "moondial" | "tidebreaker" | "midway" | "nightmail";

export const TABLE_SPECS: Record<TableId, TableSpec> = {
  moondial: MOONDIAL_SPEC,
  tidebreaker: TIDEBREAKER_SPEC,
  midway: MIDWAY_SPEC,
  nightmail: NIGHTMAIL_SPEC,
};

export const TABLE_ORDER: TableId[] = ["moondial", "tidebreaker", "midway", "nightmail"];

const TABLE_KEY = "pinball-table-v1";

/** Persisted outside Tuning, like the render mode: a machine choice, not feel. */
export function loadTableId(): TableId {
  try {
    const raw = localStorage.getItem(TABLE_KEY);
    if (raw && raw in TABLE_SPECS) return raw as TableId;
  } catch {
    // storage unavailable
  }
  return "moondial";
}

export function saveTableId(id: TableId): void {
  try {
    localStorage.setItem(TABLE_KEY, id);
  } catch {
    // storage unavailable — the choice just won't persist
  }
}

import type { EventBus } from "../core/EventBus";
import type { Scoring } from "./Scoring";
import type { SfxName } from "../audio/AudioEngine";
import type { DmdScene } from "../render/dmd/DmdScene";

/**
 * The seam between the generic Game shell and a table's ruleset (M10).
 * Game owns the universal machine (phases, balls, saver, tilt, plunger,
 * generic element sfx/fx, shared DMD scenes); a TableLogic owns everything
 * themed — modes, multiplier lanes, kicker awards, per-table DMD scenes.
 * Logic modules subscribe to the EventBus themselves for physics events.
 */
export interface TableLogicCtx {
  bus: EventBus;
  scoring: Scoring;
  sfx: (name: SfxName) => void;
  /** Camera shake (cabinet-moved moments only, per the juice rule). */
  shake: (mag: number) => void;
  /** Push a DMD scene (priority as DmdQueue). */
  push: (scene: DmdScene, prio?: number) => void;
  /** Baked per-table DMD frames by scene key (undefined until loaded). */
  baked: (key: string) => Uint8Array[] | undefined;
}

export interface TableLogic {
  update(dt: number): void;
  /** Ball drained: combos and timed modes die with it. */
  endBall(): void;
  /** New game: zero all progression. */
  resetGame(): void;
  /**
   * A rollover lane was hit during play (Game gates: play phase, not
   * tilted). Owns the lane-set → bonus-multiplier rule.
   */
  onRollover(id: string): void;
  /** Persistent lamp glow for a rollover lane insert (0..1). */
  laneLit(id: string): number;
  /** Persistent glow for an extra insert lamp (TableGeometry.lamps). */
  lamp(id: string): number;
  /**
   * Whether a kicker/subway may capture right now (kickbacks and lit-gated
   * subways say no while unlit; plain scoops always say yes).
   */
  kickerLit(id: string): boolean;
  /**
   * A kicker/subway capture actually happened (Game confirmed it — not just
   * the sensor firing, which can re-trigger during cooldown). Award ladders
   * and lit-state consumption belong here.
   */
  onCapture?(id: string): void;
}

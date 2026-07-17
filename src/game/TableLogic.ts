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
  /**
   * Extended kicker hold (M12 video modes): `open` keeps the named scoop's
   * hold alive past its holdS until called again with false — the ball sits
   * captive while an input-driven DMD scene runs. Logic must pair every
   * open with a close on a TIMER it owns (never on scene completion — the
   * headless sims have no DMD, and an unclosed hold is a stuck ball).
   */
  holdScoop?: (id: string, open: boolean) => void;
  /**
   * Serve extra balls (M12 multiball): n balls released from `at` with
   * initial velocity `v` (defaults: the plunger spawn, at rest), staggered
   * so they don't overlap. Play phase only; extras drain silently and the
   * ball ends when the LAST one drains. Absent in the headless sims —
   * modes must remain playable single-ball (the frenzy still runs).
   */
  addBalls?: (n: number, at?: { x: number; y: number }, v?: { x: number; y: number }) => void;
  /**
   * Physical ball lock (M12): transfer the ball a kicker is currently
   * holding into a visible parked berth (the locked ball leaves play; a
   * fresh ball is served to the plunger if it was the last live one).
   * Returns false when nothing was held / not in play. Absent in the sims —
   * logic must keep a virtual-lock path (clunk-and-release) as fallback.
   */
  lockBall?: (kickerId: string, berth: { x: number; y: number }) => boolean;
  /** Release every parked lock into play as multiball extras; returns how
   * many were released (top up with addBalls for a fixed-count multiball). */
  releaseLocks?: () => number;
  /**
   * Whether the ball-saver is live right now (differentiation pass; e.g.
   * Moondial's gnomon rises with the saver). Game owns the saver; sims
   * provide a stand-in window so saver-gated geometry gets soak coverage.
   */
  saverActive?: () => boolean;
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
  /**
   * A main flipper was pressed (edge, play phase, not tilted). Classic
   * lane-change: tables may rotate their lit rollover lanes on it.
   */
  onFlipper?(side: "left" | "right"): void;
  /**
   * A sensor-skill-<id> band fired (Game gates: play phase, not tilted)
   * with the ball's speed (m/s) at that instant. STYLE-GUIDE §4: a soft
   * plunge peaking inside the band arrives slow; a full plunge rips
   * through fast — the qualifying threshold is the table's rules call.
   */
  onSkillShot?(id: string, speed: number): void;
  /**
   * Which blade of a diverter should be solid right now (M12, polled per
   * frame). Absent hook or unknown name: the def's `initial` blade holds.
   */
  diverterBlade?(id: string): string;
  /** Whether a magnet is armed right now (M12; default unlit = inert). */
  magnetLit?(id: string): boolean;
  /**
   * Directed fling (Thunderhead's charge cells): the release direction for
   * a magnet's next fling, polled each frame while it holds. Undefined (or
   * absent hook) = the def's static fling vector. Normalised at use.
   */
  magnetFling?(id: string): { x: number; y: number } | undefined;
  /**
   * One-line live status for the score readout's bottom ticker (DMD pass):
   * collected letters, mode timers — max ~21 glyphs. Undefined = no line.
   */
  dmdStatus?(): string | undefined;
  /**
   * Paged progress readout (DMD pass): shown when the player holds both
   * flippers ~2 s in play. Each page is [line1, line2?].
   */
  statusReport?(): string[][];
  /**
   * Multiplier on the sling kick impulse right now (differentiation pass;
   * e.g. Small Hours' TUNED monitors). Absent hook or 1 = stock kick. Keep
   * it modest (~0.8–1.3): the sling geometry was trap-proofed at stock
   * strength, and soak only covers the values a table actually returns.
   */
  slingBoost?(): number;
  /** A rotating disc's spin rate, signed rad/s (M12; default 0 = parked). */
  discSpin?(id: string): number;
}

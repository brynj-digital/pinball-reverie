import { EventBus } from "../core/EventBus";
import rules from "../../design/tables/moondial/rules.json";

/**
 * Base scoring: element events → points, all values from the table's rules
 * JSON (plan §5e — code carries no scoring numbers). Orbit awards and modes
 * live in Modes.ts and come through award(). Bonus units accumulate from
 * moons/targets/spinner and pay out ×multiplier at end of ball.
 */
export class Scoring {
  total = 0;
  /** Moon-lane bonus multiplier (set by Game). */
  multiplier = 1;
  /** ×2 while Lunar Eclipse runs (set by Modes). */
  eclipseFactor = 1;
  /** True while TILTED: a tilted ball scores nothing and accrues no bonus. */
  muted = false;
  bonusUnits = 0;
  /** Last thing that scored, for the HUD label flash. */
  lastLabel = "";
  lastLabelAge = Infinity;

  constructor(private bus: EventBus) {
    const P = rules.points;
    const U = rules.bonusUnits;
    bus.on("hit", ({ kind, id }) => {
      if (this.muted) return;
      if (kind === "bumper") this.award(P.bumper, `BUMPER ${id}`);
      else if (kind === "sling") this.award(P.sling, "SLING");
      else if (kind === "target") {
        this.award(P.target, `TARGET ${id}`);
        this.bonusUnits += U.target;
      }
    });
    bus.on("sensor", ({ kind }) => {
      if (this.muted) return;
      if (kind === "rollover") {
        this.award(P.rollover, "LANE");
        this.bonusUnits += U.rollover;
      }
    });
    bus.on("spinnerTick", () => {
      if (this.muted) return;
      this.award(P.spinnerTick, "SPINNER");
      this.bonusUnits += U.spinnerTick;
    });
    bus.on("bankComplete", () => this.award(P.bankComplete, "BANK BONUS"));
  }

  update(dt: number): void {
    this.lastLabelAge += dt;
  }

  /** Returns the multiplied points actually added (0 while muted). */
  award(points: number, label: string): number {
    if (this.muted) return 0; // also blocks Modes-driven awards (orbits) on a tilted ball
    const p = Math.round(points * this.multiplier * this.eclipseFactor);
    this.total += p;
    this.lastLabel = label;
    this.lastLabelAge = 0;
    this.bus.emit("score", { points: p, total: this.total, label });
    return p;
  }

  /** TILT forfeits the accrued bonus (real-machine rule). */
  forfeitBonus(): void {
    this.bonusUnits = 0;
  }

  /** End-of-ball bonus: units × multiplier, added to the total. */
  collectBonus(): number {
    const bonus = this.bonusUnits * this.multiplier;
    this.bonusUnits = 0;
    if (bonus > 0) {
      this.total += bonus;
      this.bus.emit("score", { points: bonus, total: this.total, label: "BONUS" });
    }
    return bonus;
  }

  /** New game: zero everything. */
  reset(): void {
    this.total = 0;
    this.multiplier = 1;
    this.eclipseFactor = 1;
    this.muted = false;
    this.bonusUnits = 0;
    this.lastLabel = "";
    this.lastLabelAge = Infinity;
  }
}

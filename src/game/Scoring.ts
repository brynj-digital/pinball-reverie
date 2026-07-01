import { EventBus } from "../core/EventBus";

/**
 * Milestone-3 scoring: every element scores through the EventBus — nothing
 * calls Scoring directly. Modes, multipliers, and the DMD arrive in M4.
 */
const POINTS = {
  bumper: 100,
  sling: 50,
  rollover: 500,
  spinnerTick: 100,
  target: 500,
  bankComplete: 5000,
  orbit: 2500,
} as const;

/** Entry→exit (either direction) within this window scores an orbit. */
const ORBIT_WINDOW = 3.5;

export class Scoring {
  total = 0;
  /** Last thing that scored, for the HUD (DMD takes over in M4). */
  lastLabel = "";
  lastLabelAge = Infinity;

  private now = 0;
  private entryAt = -Infinity;
  private exitAt = -Infinity;

  constructor(private bus: EventBus) {
    bus.on("hit", ({ kind, id }) => {
      if (kind === "bumper") this.add(POINTS.bumper, `BUMPER ${id}`);
      else if (kind === "sling") this.add(POINTS.sling, "SLING");
      else if (kind === "target") this.add(POINTS.target, `TARGET ${id}`);
    });
    bus.on("sensor", ({ kind }) => {
      if (kind === "rollover") this.add(POINTS.rollover, "LANE");
      else if (kind === "ramp-entry") this.orbitEnd("entry");
      else if (kind === "ramp-exit") this.orbitEnd("exit");
    });
    bus.on("spinnerTick", () => this.add(POINTS.spinnerTick, "SPINNER"));
    bus.on("bankComplete", () => this.add(POINTS.bankComplete, "BANK BONUS"));
  }

  update(dt: number): void {
    this.now += dt;
    this.lastLabelAge += dt;
  }

  private orbitEnd(end: "entry" | "exit"): void {
    const otherAt = end === "entry" ? this.exitAt : this.entryAt;
    if (this.now - otherAt < ORBIT_WINDOW) {
      this.add(POINTS.orbit, "ORBIT");
      this.entryAt = this.exitAt = -Infinity; // consume the pair
    } else if (end === "entry") {
      this.entryAt = this.now;
    } else {
      this.exitAt = this.now;
    }
  }

  private add(points: number, label: string): void {
    this.total += points;
    this.lastLabel = label;
    this.lastLabelAge = 0;
    this.bus.emit("score", { points, total: this.total, label });
  }
}

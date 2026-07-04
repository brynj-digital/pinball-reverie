import { EventBus } from "../core/EventBus";
import { Scoring } from "./Scoring";
import rules from "../../design/tables/moondial/rules.json";

/** Entry→exit (either direction) within this window counts as an orbit. */
const ORBIT_PAIR_WINDOW = 3.5;

/**
 * The Moondial ruleset (plan §8 M7), values from the table's rules JSON:
 *
 * - Orbit combos: consecutive orbits inside orbitCombo.windowS escalate the
 *   award ×2 per step (capped at maxStep).
 * - LUNAR ECLIPSE: complete the comet bank banksRequired times AND shoot
 *   orbitsRequired orbits to light it; the next orbit starts the mode —
 *   durationS seconds of ×scoreFactor scoring with orbitValue orbit jackpots.
 * - TELESCOPE: each scoop capture awards the next sighting in the telescope
 *   list (wrapping); the last sighting also spots one orbit toward lighting
 *   the eclipse. Progression persists across balls, resets per game.
 * - Combos and any running eclipse end with the ball.
 */
export class Modes {
  private now = 0;
  private entryAt = -Infinity;
  private exitAt = -Infinity;
  private orbitStep = 0;
  private lastOrbitAt = -Infinity;
  private banks = 0;
  private orbits = 0;
  private sightingIdx = 0;
  eclipseReady = false;
  private eclipseUntil = -Infinity;
  private eclipseWasActive = false;

  constructor(
    private bus: EventBus,
    private scoring: Scoring,
  ) {
    bus.on("sensor", ({ kind }) => {
      if (kind === "ramp-entry") this.orbitEnd("entry");
      else if (kind === "ramp-exit") this.orbitEnd("exit");
      else if (kind === "kicker") this.onTelescope();
    });
    bus.on("bankComplete", () => {
      this.banks++;
      this.checkReady();
    });
  }

  get eclipseActive(): boolean {
    return this.now < this.eclipseUntil;
  }

  /** Seconds of eclipse remaining (0 when inactive). */
  get eclipseRemaining(): number {
    return Math.max(0, this.eclipseUntil - this.now);
  }

  update(dt: number): void {
    this.now += dt;
    if (this.eclipseWasActive && !this.eclipseActive) {
      this.eclipseWasActive = false;
      this.scoring.eclipseFactor = 1;
      this.bus.emit("mode", { kind: "eclipseEnd" });
    }
  }

  /** Ball drained: combos and any running eclipse die with it. */
  endBall(): void {
    this.orbitStep = 0;
    this.lastOrbitAt = -Infinity;
    this.entryAt = this.exitAt = -Infinity;
    if (this.eclipseActive) {
      this.eclipseUntil = -Infinity;
      this.eclipseWasActive = false;
      this.scoring.eclipseFactor = 1;
      this.bus.emit("mode", { kind: "eclipseEnd" });
    }
  }

  resetGame(): void {
    this.endBall();
    this.banks = 0;
    this.orbits = 0;
    this.sightingIdx = 0;
    this.eclipseReady = false;
  }

  /** Telescope scoop capture: award the next sighting in the logbook. */
  private onTelescope(): void {
    if (this.scoring.muted) return; // tilted: no sighting, no progression
    const T = rules.telescope;
    const s = T.sightings[this.sightingIdx];
    const spotted = T.lastSpotsOrbit && this.sightingIdx === T.sightings.length - 1;
    this.sightingIdx = (this.sightingIdx + 1) % T.sightings.length;
    const points = this.scoring.award(s.points, s.name);
    this.scoring.bonusUnits += T.bonusUnit;
    if (spotted && !this.eclipseReady && !this.eclipseActive) {
      this.orbits++;
      this.checkReady();
    }
    this.bus.emit("telescope", { name: s.name, points, spotted });
  }

  private orbitEnd(end: "entry" | "exit"): void {
    const otherAt = end === "entry" ? this.exitAt : this.entryAt;
    if (this.now - otherAt < ORBIT_PAIR_WINDOW) {
      this.entryAt = this.exitAt = -Infinity; // consume the pair
      this.onOrbit();
    } else if (end === "entry") {
      this.entryAt = this.now;
    } else {
      this.exitAt = this.now;
    }
  }

  private onOrbit(): void {
    if (this.eclipseActive) {
      this.scoring.award(rules.eclipse.orbitValue, "ECLIPSE ORBIT");
      return;
    }
    const combo = rules.orbitCombo;
    this.orbitStep = this.now - this.lastOrbitAt < combo.windowS ? Math.min(combo.maxStep, this.orbitStep + 1) : 1;
    this.lastOrbitAt = this.now;
    const factor = 2 ** (this.orbitStep - 1);
    this.scoring.award(rules.points.orbit * factor, factor > 1 ? `ORBIT ×${factor}` : "ORBIT");

    if (this.eclipseReady) {
      this.startEclipse();
    } else {
      this.orbits++;
      this.checkReady();
    }
  }

  private checkReady(): void {
    if (
      !this.eclipseReady &&
      !this.eclipseActive &&
      this.banks >= rules.eclipse.banksRequired &&
      this.orbits >= rules.eclipse.orbitsRequired
    ) {
      this.eclipseReady = true;
      this.bus.emit("mode", { kind: "eclipseReady" });
    }
  }

  private startEclipse(): void {
    this.eclipseReady = false;
    this.banks = 0;
    this.orbits = 0;
    this.eclipseUntil = this.now + rules.eclipse.durationS;
    this.eclipseWasActive = true;
    this.scoring.eclipseFactor = rules.eclipse.scoreFactor;
    this.bus.emit("mode", { kind: "eclipseStart" });
  }
}
